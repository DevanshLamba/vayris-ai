import { useEffect, useRef, useState, useCallback } from 'react';

export function useWebSpeechWakeWord({
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
    const [state, setState] = useState<'DISABLED' | 'READY' | 'LISTENING' | 'ERROR'>('DISABLED');
    const [errorMsg, setErrorMsg] = useState('');
    const recognitionRef = useRef<any>(null);
    const callbackRef = useRef(onWakeWordDetected);

    useEffect(() => {
        callbackRef.current = onWakeWordDetected;
    }, [onWakeWordDetected]);

    useEffect(() => {
        if (!enabled) {
            setState('DISABLED');
            if (recognitionRef.current) {
                recognitionRef.current.stop();
                recognitionRef.current = null;
            }
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setState('ERROR');
            setErrorMsg('SpeechRecognition API not supported in this browser.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            setState('LISTENING');
        };

        recognition.onresult = (event: any) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    const text = event.results[i][0].transcript.toLowerCase();
                    if (text.includes(wakePhrase.toLowerCase())) {
                        callbackRef.current();
                        recognition.stop();
                    }
                } else {
                    interimTranscript += event.results[i][0].transcript.toLowerCase();
                }
            }
            if (interimTranscript.includes(wakePhrase.toLowerCase())) {
                callbackRef.current();
                recognition.stop();
            }
        };

        recognition.onerror = (event: any) => {
            console.error('[WakeWord] error:', event.error);
            if (event.error === 'not-allowed') {
                setState('ERROR');
                setErrorMsg('Microphone access denied.');
            }
        };

        recognition.onend = () => {
            if (listening && enabled && state !== 'ERROR') {
                try {
                    recognition.start();
                } catch (e) {}
            } else {
                setState('READY');
            }
        };

        recognitionRef.current = recognition;
        setState('READY');

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.onend = null;
                recognitionRef.current.stop();
                recognitionRef.current = null;
            }
        };
    }, [enabled, wakePhrase]);

    useEffect(() => {
        if (state === 'DISABLED' || state === 'ERROR' || !recognitionRef.current) return;

        if (listening && state === 'READY') {
            try {
                recognitionRef.current.start();
            } catch (e) {}
        } else if (!listening && state === 'LISTENING') {
            recognitionRef.current.stop();
        }
    }, [listening, state]);

    return {
        state,
        errorMsg,
        isListening: state === 'LISTENING'
    };
}
