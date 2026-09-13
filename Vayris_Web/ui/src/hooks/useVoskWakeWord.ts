import { useEffect, useRef, useState, useCallback } from 'react';
import { createModel, Model, KaldiRecognizer } from 'vosk-browser';

export type VoskState = 'DISABLED' | 'LOADING' | 'READY' | 'LISTENING' | 'ERROR';

const VOSK_MODEL_URL = '/vosk-model.zip';

export function useVoskWakeWord({
    enabled,
    listening,
    wakePhrase,
    onWakeWordDetected
}: {
    enabled: boolean;
    listening: boolean;
    wakePhrase: string;
    onWakeWordDetected: () => void;
}) {
    const [state, setState] = useState<VoskState>('DISABLED');
    const [errorMsg, setErrorMsg] = useState('');
    
    const modelRef = useRef<Model | null>(null);
    const recognizerRef = useRef<KaldiRecognizer | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const activeRef = useRef(false);
    const detectedRef = useRef(false); // prevents multi-fire per utterance
    
    const phraseRef = useRef(wakePhrase.toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ').trim());
    const callbackRef = useRef(onWakeWordDetected);

    useEffect(() => {
        phraseRef.current = wakePhrase.toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ').trim();
    }, [wakePhrase]);
    
    useEffect(() => {
        callbackRef.current = onWakeWordDetected;
    }, [onWakeWordDetected]);

    // ---- Mic release (synchronous, no async gaps) ----
    const releaseMic = useCallback(() => {
        activeRef.current = false;
        if (sourceRef.current) {
            try { sourceRef.current.disconnect(); } catch(e){}
            sourceRef.current = null;
        }
        if (processorRef.current) {
            try { processorRef.current.disconnect(); } catch(e){}
            processorRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(()=>{});
            audioContextRef.current = null;
        }
        console.log('[VOSK] Microphone released');
    }, []);

    // ---- Public stop: release mic + set state ----
    const stopListening = useCallback(() => {
        releaseMic();
        setState(s => s === 'LISTENING' ? 'READY' : s);
    }, [releaseMic]);

    // ---- Mic acquire + start streaming to recognizer ----
    const startListening = useCallback(async () => {
        if (!modelRef.current || !recognizerRef.current) {
            console.warn('[VOSK] Cannot start: model/recognizer not ready');
            return;
        }
        if (activeRef.current) return; // already running
        
        activeRef.current = true;
        detectedRef.current = false;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    channelCount: 1, 
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true
                } 
            });
            
            // Check if cancelled while waiting for mic permission
            if (!activeRef.current) {
                stream.getTracks().forEach(t => t.stop());
                return;
            }
            
            const AC = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AC({ sampleRate: 16000 });
            
            // CRITICAL: AudioContext may start in 'suspended' state if no user gesture
            if (audioContext.state === 'suspended') {
                console.log('[VOSK] AudioContext suspended, resuming...');
                await audioContext.resume();
            }
            console.log('[VOSK] AudioContext state:', audioContext.state);
            
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            
            source.connect(processor);
            processor.connect(audioContext.destination);
            
            let frameCount = 0;
            
            processor.onaudioprocess = (e) => {
                if (recognizerRef.current && activeRef.current && !detectedRef.current) {
                    frameCount++;
                    if (frameCount === 1 || frameCount % 200 === 0) {
                        console.log(`[VOSK] Audio frames: ${frameCount}`);
                    }
                    const data = e.inputBuffer.getChannelData(0);
                    recognizerRef.current.acceptWaveformFloat(data as any, audioContext.sampleRate);
                }
            };

            audioContextRef.current = audioContext;
            streamRef.current = stream;
            processorRef.current = processor;
            sourceRef.current = source;
            
            setState('LISTENING');
            console.log('[VOSK] WAKE_LISTENING started');
            
        } catch (err: any) {
            console.error('[VOSK] Mic acquisition failed:', err);
            activeRef.current = false;
            setState('ERROR');
            setErrorMsg(err.message || 'Microphone access denied');
        }
    }, []);

    // ---- Model loading (runs once when enabled) ----
    useEffect(() => {
        if (!enabled) {
            setState('DISABLED');
            releaseMic();
            return;
        }
        
        let cancelled = false;

        const loadModel = async () => {
            if (modelRef.current) {
                // Model already loaded, just ensure READY
                if (!recognizerRef.current) {
                    // recreate recognizer
                    setupRecognizer();
                }
                setState('READY');
                return;
            }
            
            setState('LOADING');
            console.log(`[VOSK] Loading model from: ${VOSK_MODEL_URL}`);
            
            try {
                const model = await createModel(VOSK_MODEL_URL);
                if (cancelled) return;
                
                modelRef.current = model;
                console.log('[VOSK] MODEL_LOADED');
                
                setupRecognizer();
                setState('READY');
                
            } catch (err: any) {
                console.error('[VOSK] Model load failed:', err);
                if (!cancelled) {
                    setState('ERROR');
                    setErrorMsg(err.message || 'Failed to load Vosk model');
                }
            }
        };

        const setupRecognizer = () => {
            if (!modelRef.current) return;
            
            // Use grammar to constrain recognition to wake phrase + filler
            // This dramatically improves detection accuracy for "hey buddy"
            const grammar = '["hey buddy", "hey", "buddy", "[unk]"]';
            recognizerRef.current = new modelRef.current.KaldiRecognizer(16000, grammar);
            recognizerRef.current.setWords(true);
            console.log('[VOSK] Recognizer created with grammar:', grammar);
            
            recognizerRef.current.on('result', (message: any) => {
                const result = message.result;
                if (result && result.text) {
                    const text = result.text.trim();
                    if (text && text !== '[unk]') {
                        console.log(`[VOSK] FINAL: "${text}"`);
                    }
                    checkWakeWord(text);
                }
            });

            recognizerRef.current.on('partialresult', (message: any) => {
                const result = message.result;
                if (result && result.partial) {
                    const text = result.partial.trim();
                    if (text && text !== '[unk]') {
                        console.log(`[VOSK] PARTIAL: "${text}"`);
                    }
                    checkWakeWord(text);
                }
            });
        };

        const checkWakeWord = (rawText: string) => {
            if (detectedRef.current) return; // already detected, waiting for reset
            
            const clean = rawText.toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ').trim();
            if (clean.includes(phraseRef.current)) {
                detectedRef.current = true;
                cooldownRef.current = true;
                console.log('[VOSK] *** WAKE WORD MATCHED ***');
                
                // Release mic SYNCHRONOUSLY before firing callback
                releaseMic();
                setState('READY');
                
                // Fire callback after mic is released
                // Use setTimeout(0) to let React batch the state updates first
                setTimeout(() => {
                    callbackRef.current();
                }, 50);
                
                // Cooldown: prevent re-listening for 3 seconds
                setTimeout(() => {
                    cooldownRef.current = false;
                    console.log('[VOSK] Cooldown expired, ready to listen again');
                }, 3000);
            }
        };

        loadModel();

        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    const cooldownRef = useRef(false);

    // ---- React to `listening` prop changes ----
    useEffect(() => {
        if (state === 'DISABLED' || state === 'LOADING' || state === 'ERROR') return;
        
        if (listening && state === 'READY' && !cooldownRef.current) {
            detectedRef.current = false;
            startListening();
        } else if (!listening && state === 'LISTENING') {
            stopListening();
        }
    }, [listening, state, startListening, stopListening]);

    // ---- Full cleanup on unmount ----
    useEffect(() => {
        return () => {
            releaseMic();
            if (recognizerRef.current) {
                try { recognizerRef.current.remove(); } catch(e){}
                recognizerRef.current = null;
            }
            if (modelRef.current) {
                try { modelRef.current.terminate(); } catch(e){}
                modelRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        state,
        errorMsg,
        isListening: state === 'LISTENING'
    };
}
