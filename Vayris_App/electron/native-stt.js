/*
 * Native Vosk command STT for the Electron main process.
 *
 * Loads the prebuilt libvosk shared library through Koffi (N-API, so it is ABI
 * stable across Node/Electron versions and needs no node-gyp). The renderer
 * keeps its existing AudioWorklet capture and streams 16 kHz mono Float32 PCM
 * over IPC; this module feeds it to Vosk and hands transcripts back.
 *
 * Deliberately scoped to COMMAND STT. Wake-word detection stays in the
 * renderer's WASM Vosk, and transcripts produced here are returned verbatim so
 * they enter the existing normalization -> speechAliases -> router pipeline
 * unchanged.
 */
const path = require('path');
const fs = require('fs');

const LIB_DIR_NAME = 'vosk-win64-0.3.45';

let koffi = null;
let lib = null;          // koffi library handle
let fns = null;          // bound C functions
let model = null;        // VoskModel*
let recognizer = null;   // VoskRecognizer*
let loadedModelPath = null;

function resolveLibDir(appPath) {
  // Unpacked/dev: <app>/native/libvosk/<LIB_DIR_NAME>
  // Packaged:     <resources>/native/libvosk/<LIB_DIR_NAME>
  const candidates = [
    path.join(appPath, 'native', 'libvosk', LIB_DIR_NAME),
    path.join(process.resourcesPath || '', 'native', 'libvosk', LIB_DIR_NAME),
    path.join(__dirname, '..', 'native', 'libvosk', LIB_DIR_NAME),
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'libvosk.dll'))) return dir;
  }
  return null;
}

function loadLibrary(appPath) {
  if (lib) return;

  const dir = resolveLibDir(appPath);
  if (!dir) throw new Error('libvosk.dll not found (looked under native/libvosk/' + LIB_DIR_NAME + ')');

  // libvosk.dll is a MinGW build and pulls in libgcc/libstdc++/libwinpthread
  // from its own directory; put that directory on PATH so the loader finds them.
  if (!process.env.PATH.split(path.delimiter).includes(dir)) {
    process.env.PATH = dir + path.delimiter + process.env.PATH;
  }

  koffi = require('koffi');
  lib = koffi.load(path.join(dir, 'libvosk.dll'));

  const VoskModel = koffi.opaque('VoskModel');
  const VoskRecognizer = koffi.opaque('VoskRecognizer');

  fns = {
    setLogLevel:    lib.func('void vosk_set_log_level(int)'),
    modelNew:       lib.func('VoskModel* vosk_model_new(const char*)'),
    modelFree:      lib.func('void vosk_model_free(VoskModel*)'),
    recNew:         lib.func('VoskRecognizer* vosk_recognizer_new(VoskModel*, float)'),
    recSetWords:    lib.func('void vosk_recognizer_set_words(VoskRecognizer*, int)'),
    recAcceptF:     lib.func('int vosk_recognizer_accept_waveform_f(VoskRecognizer*, float*, int)'),
    recResult:      lib.func('const char* vosk_recognizer_result(VoskRecognizer*)'),
    recPartial:     lib.func('const char* vosk_recognizer_partial_result(VoskRecognizer*)'),
    recFinal:       lib.func('const char* vosk_recognizer_final_result(VoskRecognizer*)'),
    recReset:       lib.func('void vosk_recognizer_reset(VoskRecognizer*)'),
    recFree:        lib.func('void vosk_recognizer_free(VoskRecognizer*)'),
  };
  void VoskModel; void VoskRecognizer;

  fns.setLogLevel(parseInt(process.env.VAYRIS_VOSK_LOG_LEVEL || '-1', 10));
  return dir;
}

function parseText(json, key) {
  if (!json) return '';
  try { return (JSON.parse(json) || {})[key] || ''; } catch { return ''; }
}

/**
 * Loads the model. Reading a multi-GB model takes tens of seconds, and
 * vosk_model_new is a blocking C call, so it runs on a Koffi worker thread -
 * calling it directly would freeze the main process (and therefore the window
 * and all IPC) for the whole load.
 */
function init({ appPath, modelPath }) {
  const dir = loadLibrary(appPath);

  if (model && loadedModelPath === modelPath) {
    return Promise.resolve({ alreadyLoaded: true, libDir: dir, modelPath });
  }
  if (!fs.existsSync(path.join(modelPath, 'am', 'final.mdl'))) {
    return Promise.reject(new Error('Vosk model not found at ' + modelPath + ' (missing am/final.mdl)'));
  }

  disposeRecognizer();
  if (model) { fns.modelFree(model); model = null; loadedModelPath = null; }

  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    fns.modelNew.async(modelPath, (err, handle) => {
      if (err) return reject(err);
      if (!handle) return reject(new Error('vosk_model_new returned null for ' + modelPath));
      model = handle;
      loadedModelPath = modelPath;
      resolve({ alreadyLoaded: false, libDir: dir, modelPath, loadMs: Date.now() - t0 });
    });
  });
}

function startUtterance(sampleRate = 16000) {
  if (!model) throw new Error('native STT: model not initialised');
  disposeRecognizer();
  recognizer = fns.recNew(model, sampleRate);
  if (!recognizer) throw new Error('vosk_recognizer_new returned null');
  fns.recSetWords(recognizer, 1);
}

/**
 * Feeds one chunk of 16 kHz mono PCM.
 * @param {Float32Array} samples in [-1, 1]
 * @returns {{final: boolean, text: string}}
 */
function acceptChunk(samples) {
  if (!recognizer) throw new Error('native STT: no active recognizer');

  // Vosk's float API expects int16-scaled floats, matching what the WASM
  // binding does internally.
  const scaled = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) scaled[i] = samples[i] * 32768;

  const isFinal = fns.recAcceptF(recognizer, scaled, scaled.length);
  if (isFinal) {
    return { final: true, text: parseText(fns.recResult(recognizer), 'text') };
  }
  return { final: false, text: parseText(fns.recPartial(recognizer), 'partial') };
}

/** Flushes the tail of the utterance and returns the final transcript. */
function endUtterance() {
  if (!recognizer) return '';
  const text = parseText(fns.recFinal(recognizer), 'text');
  disposeRecognizer();
  return text;
}

function disposeRecognizer() {
  if (recognizer && fns) {
    try { fns.recFree(recognizer); } catch (e) { /* already gone */ }
  }
  recognizer = null;
}

/** Releases the recognizer and model. Safe to call repeatedly. */
function shutdown() {
  disposeRecognizer();
  if (model && fns) {
    try { fns.modelFree(model); } catch (e) { /* already gone */ }
  }
  model = null;
  loadedModelPath = null;
}

module.exports = {
  init,
  startUtterance,
  acceptChunk,
  endUtterance,
  shutdown,
  isReady: () => !!model,
  hasActiveUtterance: () => !!recognizer,
};
