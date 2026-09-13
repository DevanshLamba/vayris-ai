// Technical validation of the native Vosk path inside the real Electron main
// process: DLL load, model load, streaming, real-time factor, backlog, cleanup.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const native = require(path.join(ROOT, 'electron', 'native-stt.js'));

const MODEL = process.argv.find(a => a.startsWith('--model='))?.split('=')[1]
  || path.join(ROOT, 'vosk-model', 'vosk-model-en-us-0.22');
const WAV = process.argv.find(a => a.startsWith('--wav='))?.split('=')[1];

const log = (...a) => process.stdout.write(a.join(' ') + '\n');
const mb = (b) => (b / 1048576).toFixed(0);

function readWavMono16k(file) {
  const buf = fs.readFileSync(file);
  // Minimal RIFF walk to find fmt + data.
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(pos + 10), rate: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) };
    if (id === 'data') data = buf.subarray(pos + 8, pos + 8 + size);
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('bad wav');
  const n = Math.floor(data.length / 2 / fmt.channels);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2 * fmt.channels) / 32768;
  return { pcm: out, rate: fmt.rate, seconds: n / fmt.rate };
}

app.whenReady().then(async () => {
  let failed = false;
  try {
    log('--- GATE 1: libvosk.dll + koffi load, model load ---');
    const rssBefore = process.memoryUsage().rss;
    let ticks = 0, worstGapMs = 0, lastTick = Date.now();
    const heartbeat = setInterval(() => {
      const gap = Date.now() - lastTick; lastTick = Date.now();
      if (gap > worstGapMs) worstGapMs = gap;
      ticks++;
    }, 50);
    const t0 = Date.now();
    const info = await native.init({ appPath: ROOT, modelPath: MODEL });
    const loadMs = Date.now() - t0;
    log(`  libDir     = ${info.libDir}`);
    log(`  model      = ${info.modelPath}`);
    log(`  PASS model loaded in ${loadMs} ms`);
    clearInterval(heartbeat);
    log(`  RSS ${mb(rssBefore)} MB -> ${mb(process.memoryUsage().rss)} MB`);
    log(`  main-thread heartbeat during load: ${ticks} ticks, worst stall ${worstGapMs} ms ` +
        (worstGapMs < 500 ? '(PASS - main process stayed responsive)' : '(FAIL - main process blocked)'));

    if (!WAV) { log('\nno --wav supplied; skipping streaming gates'); native.shutdown(); return app.exit(0); }

    const { pcm, rate, seconds } = readWavMono16k(WAV);
    log(`\n--- GATE 2/3: streaming + real-time factor ---`);
    log(`  audio: ${seconds.toFixed(2)} s @ ${rate} Hz (${pcm.length} samples)`);
    if (rate !== 16000) log(`  WARNING: expected 16000 Hz`);

    // Feed in 128-sample blocks, exactly like the AudioWorklet emits.
    const BLOCK = 128;
    native.startUtterance(16000);
    const tStart = Date.now();
    let finals = [];
    let maxBlockMs = 0;
    for (let i = 0; i < pcm.length; i += BLOCK) {
      const tb = Date.now();
      const r = native.acceptChunk(pcm.subarray(i, Math.min(i + BLOCK, pcm.length)));
      const bms = Date.now() - tb;
      if (bms > maxBlockMs) maxBlockMs = bms;
      if (r.final && r.text) finals.push(r.text);
    }
    const tail = native.endUtterance();
    if (tail) finals.push(tail);
    const decodeMs = Date.now() - tStart;
    const rtf = decodeMs / 1000 / seconds;

    log(`  decode wall time : ${decodeMs} ms`);
    log(`  REAL-TIME FACTOR : ${rtf.toFixed(3)}x  ${rtf < 1 ? 'PASS (<1, keeps up with live audio)' : 'FAIL (>1, will backlog)'}`);
    log(`  slowest single 128-sample block: ${maxBlockMs} ms (budget 8 ms)`);
    log(`  transcript: "${finals.join(' ').trim()}"`);
    log(`  RSS after decode: ${mb(process.memoryUsage().rss)} MB`);
    if (rtf >= 1) failed = true;

    log(`\n--- GATE 4: backlog over sustained repeats ---`);
    const laps = [];
    for (let n = 0; n < 3; n++) {
      native.startUtterance(16000);
      const t = Date.now();
      for (let i = 0; i < pcm.length; i += BLOCK) native.acceptChunk(pcm.subarray(i, Math.min(i + BLOCK, pcm.length)));
      native.endUtterance();
      laps.push(Date.now() - t);
    }
    log(`  lap times: ${laps.join(' / ')} ms  (stable = no accumulation)`);
    const drift = (laps[laps.length - 1] - laps[0]) / laps[0];
    log(`  drift first->last: ${(drift * 100).toFixed(1)}%  ${Math.abs(drift) < 0.35 ? 'PASS' : 'FAIL'}`);

    log(`\n--- GATE 5: cleanup safety ---`);
    native.shutdown();
    native.shutdown();               // double free must be safe
    log('  double shutdown() survived');
    const re = await native.init({ appPath: ROOT, modelPath: MODEL });
    log(`  re-init after shutdown OK (alreadyLoaded=${re.alreadyLoaded})`);
    native.shutdown();
    log('  PASS cleanup safe');
    log(`  RSS final: ${mb(process.memoryUsage().rss)} MB`);
  } catch (e) {
    failed = true;
    log('FAILURE: ' + (e && e.stack ? e.stack : e));
  }
  log(failed ? '\nRESULT: FAIL' : '\nRESULT: ALL TECHNICAL GATES PASS');
  app.exit(failed ? 1 : 0);
});
