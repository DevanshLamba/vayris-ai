import { useEffect, useRef, useState } from 'react';
import { createModel } from 'vosk-browser';

export type VoskState = 'DISABLED' | 'LOADING' | 'READY' | 'LISTENING' | 'ERROR';
export type VoskListenMode = 'WAKE_WORD' | 'COMMAND' | 'IDLE';

// Singleton model - shared across all hook instances and re-renders
let globalModel: any = null;
let globalModelPromise: Promise<any> | null = null;

function getOrCreateModel(): Promise<any> {
    if (globalModel) return Promise.resolve(globalModel);
    if (globalModelPromise) return globalModelPromise;

    console.log('[VOSK-BROWSER] Starting singleton model load...');
    // Must be a tar.gz carrying real directory entries with the execute bit.
    // A Windows/FAT .zip stores mode 0600 and no directory entries at all, so
    // libarchive extracts the tree with non-traversable directories: emscripten's
    // mayLookup() then refuses to descend, FS.syncfs() dies walking the tree, and
    // Model() reports "does not contain model files". See ui/public/README-vosk-model.md.
    globalModelPromise = createModel('./vosk-model-small-en-us-0.15.tar.gz').then(model => {
        console.log('[VOSK-BROWSER] Model loaded successfully!');
        globalModel = model;
        return model;
    }).catch(err => {
        console.error('[VOSK-BROWSER] Model load failed:', err);
        // Clear the cached rejection so a later mount can retry instead of
        // staying stuck on a one-off failure.
        globalModelPromise = null;
        throw err;
    });

    return globalModelPromise;
}

function normalize(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const curr = [i];
        for (let j = 1; j <= b.length; j++) {
            curr[j] = Math.min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        prev = curr;
    }
    return prev[b.length];
}

/**
 * Decodings the small Vosk model actually returns for "hey buddy" - it has no
 * vocabulary entry for the phrase, so it substitutes ordinary words. Listed
 * explicitly because these are the common cases and an exact list is cheaper
 * and safer than widening the fuzzy budget (which costs false positives).
 */
const KNOWN_WAKE_VARIANTS: Record<string, string[]> = {
    'hey buddy': [
        'hey buddy', 'hey body', 'hey bud he', 'they buddy', 'hey buddie',
        'hey budy', 'a buddy', 'hey but he', 'hey bud', 'hey bloody',
    ],
};

/**
 * The small Vosk model mishears the wake phrase constantly ("hey body",
 * "hey bud he", "they buddy"), so an exact substring test drops most real
 * activations. Accept a known variant, else slide a window of the phrase's
 * word count across the transcript and accept the closest one within an
 * edit-distance budget.
 * A false wake just opens the mic; a missed wake makes Vayris feel dead.
 */
function matchesWakePhrase(text: string, phrase: string): boolean {
    const heard = normalize(text);
    if (!heard || !phrase) return false;
    if (heard.includes(phrase)) return true;

    const variants = KNOWN_WAKE_VARIANTS[phrase];
    if (variants && variants.some(v => heard.includes(v))) return true;

    const phraseWords = phrase.split(' ');
    const heardWords = heard.split(' ');
    if (heardWords.length < phraseWords.length) return false;

    const budget = Math.max(1, Math.floor(phrase.length * 0.3));
    for (let i = 0; i + phraseWords.length <= heardWords.length; i++) {
        const window = heardWords.slice(i, i + phraseWords.length).join(' ');
        if (levenshtein(window, phrase) <= budget) return true;
    }
    return false;
}

export function useVoskSTT({ enabled, listenMode, wakePhrase, onWakeWordDetected, onCommandPartial, onCommandFinal }: any) {
    const [state, setState] = useState<VoskState>('DISABLED');
    const [errorMsg, setErrorMsg] = useState('');

    const recognizerRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const nodeRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
    const micStartingRef = useRef(false);

    // Store callbacks in refs so useEffect doesn't depend on them
    const onWakeRef = useRef(onWakeWordDetected);
    const onPartialRef = useRef(onCommandPartial);
    const onFinalRef = useRef(onCommandFinal);
    const phraseRef = useRef(normalize(wakePhrase || 'hey buddy'));
    const modeRef = useRef<VoskListenMode>(listenMode);
    // Deadline (not a latch) for swallowing the flushed transcript produced
    // when switching into COMMAND mode, so the wake phrase is not delivered as
    // a command. A bare boolean could stay set when a flush produced no result
    // and would then swallow a genuine transcript instead.
    const discardUntilRef = useRef(0);
    const lastWakeAtRef = useRef(0);

    // Keep refs synced without triggering effects
    useEffect(() => { onWakeRef.current = onWakeWordDetected; }, [onWakeWordDetected]);
    useEffect(() => { onPartialRef.current = onCommandPartial; }, [onCommandPartial]);
    useEffect(() => { onFinalRef.current = onCommandFinal; }, [onCommandFinal]);
    useEffect(() => { phraseRef.current = normalize(wakePhrase || 'hey buddy'); }, [wakePhrase]);

    const handleWake = () => {
        // partialResult fires repeatedly while the phrase sits in the partial
        // buffer; only act on the first one.
        const now = Date.now();
        if (now - lastWakeAtRef.current < 2000) return;
        lastWakeAtRef.current = now;
        onWakeRef.current?.();
    };

    const stopMic = () => {
        if (!audioContextRef.current && !streamRef.current) return;
        console.log('[VOSK-BROWSER] Stopping mic...');
        if (nodeRef.current) {
            try {
                (nodeRef.current as AudioWorkletNode).port?.postMessage({ command: 'stop' });
            } catch (e) {}
            try { nodeRef.current.disconnect(); } catch (e) {}
            nodeRef.current = null;
        }
        if (sourceRef.current) {
            try { sourceRef.current.disconnect(); } catch (e) {}
            sourceRef.current = null;
        }
        if (audioContextRef.current) {
            try { audioContextRef.current.close(); } catch (e) {}
            audioContextRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    };

    // LOAD VOSK MODEL - only depends on `enabled`, runs ONCE
    useEffect(() => {
        if (!enabled) {
            setState('DISABLED');
            return;
        }

        let isMounted = true;
        setState('LOADING');

        getOrCreateModel().then(model => {
            if (!isMounted) return;

            const recognizer = new model.KaldiRecognizer(16000);
            recognizer.setWords(true);

            recognizer.on('result', (message: any) => {
                if (!isMounted) return;
                const text = message?.result?.text;
                if (!text || text === '[unk]') return;

                if (Date.now() < discardUntilRef.current) {
                    discardUntilRef.current = 0;
                    console.log('[VOSK-BROWSER] Discarded flushed transcript:', text);
                    return;
                }
                console.log('[VOSK-BROWSER] Final result:', text);

                if (modeRef.current === 'WAKE_WORD') {
                    const hit = matchesWakePhrase(text, phraseRef.current);
                    console.log(`[VOSK-BROWSER] Wake check "${text}" vs "${phraseRef.current}" -> ${hit}`);
                    if (hit) handleWake();
                } else if (modeRef.current === 'COMMAND') {
                    onFinalRef.current?.(text);
                }
            });

            recognizer.on('partialResult', (message: any) => {
                if (!isMounted) return;
                const text = message?.result?.partial;
                if (!text || text === '[unk]') return;

                if (modeRef.current === 'WAKE_WORD') {
                    if (matchesWakePhrase(text, phraseRef.current)) handleWake();
                } else if (modeRef.current === 'COMMAND') {
                    onPartialRef.current?.(text);
                }
            });

            recognizerRef.current = recognizer;
            setState('READY');
            console.log('[VOSK-BROWSER] Recognizer created, state=READY');
        }).catch(err => {
            console.error('[VOSK-BROWSER] Setup error:', err);
            if (isMounted) {
                setErrorMsg(err?.message || String(err) || 'Failed to load model');
                setState('ERROR');
            }
        });

        return () => {
            isMounted = false;
            if (recognizerRef.current) {
                try { recognizerRef.current.remove(); } catch (e) {}
                recognizerRef.current = null;
            }
        };
    }, [enabled]);

    // Mode changes only flip a ref - the mic stays open, so switching between
    // wake-word and command listening costs nothing. Audio simply is not fed
    // to the recognizer while IDLE, which is also what stops Vayris from
    // hearing its own text-to-speech.
    useEffect(() => {
        const previous = modeRef.current;
        modeRef.current = listenMode;
        // The mic stays open, but report LISTENING only while audio is
        // actually being consumed, so the UI's "paused" indicator stays honest.
        if (audioContextRef.current) {
            setState(listenMode === 'IDLE' ? 'READY' : 'LISTENING');
        }
        if (previous !== listenMode && recognizerRef.current) {
            // FinalResult() flushes and resets Kaldi, so leftover audio from
            // the previous mode cannot bleed into the next transcript.
            // Only suppress that flush when entering COMMAND, where the wake
            // phrase would otherwise be delivered as the command. Entering
            // WAKE_WORD must never suppress, or the wake word itself is lost.
            if (listenMode === 'COMMAND') {
                discardUntilRef.current = Date.now() + 600;
            }
            try {
                recognizerRef.current.retrieveFinalResult();
            } catch (e) {
                discardUntilRef.current = 0;
            }
        }
    }, [listenMode]);

    // START MIC once the recognizer exists, and keep it open.
    useEffect(() => {
        if (state !== 'READY') return;
        let cancelled = false;

        const startMic = async () => {
            if (audioContextRef.current || micStartingRef.current) return;
            micStartingRef.current = true;
            try {
                console.log('[VOSK-BROWSER] Starting mic...');
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
                });
                if (cancelled) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }
                streamRef.current = stream;

                // Run at the hardware's native rate and downsample in the
                // worklet. Forcing a 16 kHz AudioContext makes Chromium
                // resample the entire graph and is a common source of
                // distorted, unrecognisable audio.
                const audioContext = new AudioContext();
                audioContextRef.current = audioContext;
                if (audioContext.state === 'suspended') {
                    try { await audioContext.resume(); } catch (e) {}
                }

                const source = audioContext.createMediaStreamSource(stream);
                sourceRef.current = source;

                const feed = (samples: Float32Array, sampleRate: number) => {
                    if (!recognizerRef.current || modeRef.current === 'IDLE') return;
                    try {
                        recognizerRef.current.acceptWaveformFloat(samples, sampleRate);
                    } catch (err) {
                        // Recognizer may be mid-teardown; dropping a frame is fine.
                    }
                };

                let usingWorklet = false;
                try {
                    // The worklet keeps capture off the main thread, which the
                    // Three.js orb otherwise starves into dropped audio.
                    await audioContext.audioWorklet.addModule('./vosk-processor.js');
                    if (cancelled) return;
                    const node = new AudioWorkletNode(audioContext, 'vosk-audio-processor');
                    node.port.onmessage = (event) => {
                        if (event.data?.type === 'audio') feed(event.data.samples, 16000);
                    };
                    nodeRef.current = node;
                    source.connect(node);
                    usingWorklet = true;
                    console.log('[VOSK-BROWSER] Using AudioWorklet capture');
                } catch (err) {
                    console.warn('[VOSK-BROWSER] AudioWorklet unavailable, falling back to ScriptProcessor:', err);
                }

                if (!usingWorklet) {
                    if (cancelled) return;
                    const processor = audioContext.createScriptProcessor(4096, 1, 1);
                    processor.onaudioprocess = (event) => {
                        feed(event.inputBuffer.getChannelData(0), event.inputBuffer.sampleRate);
                    };
                    nodeRef.current = processor;
                    source.connect(processor);
                    // A ScriptProcessorNode only fires while connected to the
                    // graph. A zero-gain sink keeps it running without routing
                    // the microphone back out to the speakers.
                    const mute = audioContext.createGain();
                    mute.gain.value = 0;
                    processor.connect(mute);
                    mute.connect(audioContext.destination);
                }

                setState(modeRef.current === 'IDLE' ? 'READY' : 'LISTENING');
                console.log('[VOSK-BROWSER] Mic started, mode=' + modeRef.current);
            } catch (err: any) {
                console.error('[VOSK-BROWSER] Mic Error:', err);
                if (!cancelled) {
                    setErrorMsg(err?.message || 'Microphone unavailable');
                    setState('ERROR');
                }
            } finally {
                micStartingRef.current = false;
            }
        };

        startMic();
        return () => { cancelled = true; };
    }, [state]);

    // Tear the mic down when the hook is disabled.
    useEffect(() => {
        if (!enabled) stopMic();
    }, [enabled]);

    // Cleanup mic on unmount
    useEffect(() => {
        return () => { stopMic(); };
    }, []);

    return { state, errorMsg };
}
