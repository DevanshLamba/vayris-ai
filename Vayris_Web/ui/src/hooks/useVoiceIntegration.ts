/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import { useState, useRef, useEffect, useCallback } from 'react';

interface VoiceConfig {
  voiceEnabled: boolean;
  rate: number;
  voiceURI: string | null;
}

export function useVoiceIntegration(onFinalTranscript: (text: string) => void) {
  const [config, setConfig] = useState<VoiceConfig>({
    voiceEnabled: true,
    rate: 1.0,
    voiceURI: null,
  });

  const [mode, setMode] = useState<'WAKE_WORD' | 'DICTATION'>('WAKE_WORD');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimText, setInterimText] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  
  const speechBufferRef = useRef<string>('');
  const speakQueueRef = useRef<string[]>([]);
  
  const modeRef = useRef<'WAKE_WORD' | 'DICTATION'>('WAKE_WORD');
  // This flag tells onend: "I stopped on purpose to switch modes, DO NOT reset"
  const intentionalStopRef = useRef(false);
  
  const callbackRef = useRef(onFinalTranscript);

  useEffect(() => {
    callbackRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const switchMode = (newMode: 'WAKE_WORD' | 'DICTATION') => {
    modeRef.current = newMode;
    setMode(newMode);
  };

  useEffect(() => {
    const saved = localStorage.getItem('vayris_voice_config');
    if (saved) {
      try { setConfig(JSON.parse(saved)); } catch {}
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onstart = () => {
        console.log('[Voice] Engine started. Mode:', modeRef.current);
      };
      
      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        
        // Barge-in
        if (synthRef.current.speaking && (interim.trim() || final.trim())) {
          stopSpeaking();
        }
        
        if (modeRef.current === 'WAKE_WORD') {
           // In WAKE_WORD mode, only listen for the wake phrase
           const lower = (interim + final).toLowerCase();
           if (lower.includes('hey buddy')) {
               console.log('[Voice] Wake word detected! Switching to DICTATION');
               switchMode('DICTATION');
               stopSpeaking();
               // Stop + restart to flush the "hey buddy" transcript buffer
               intentionalStopRef.current = true;
               recognition.stop();
           }
           // Otherwise ignore everything - don't submit, don't show interim
        } else {
           // In DICTATION mode, capture the user's actual command
           setInterimText(interim);
           if (final.trim()) {
             const text = final.trim();
             const lower = text.toLowerCase().replace(/[.,!?]/g, '');
             
             // Filter out accidental wake word captures
             if (lower === 'hey buddy' || lower === 'hey' || lower === 'buddy') {
                setInterimText('');
                return;
             }
             
             console.log('[Voice] Got command:', text, '- switching back to WAKE_WORD');
             setInterimText('');
             switchMode('WAKE_WORD');
             intentionalStopRef.current = true;
             recognition.stop();
             
             callbackRef.current(text);
           }
        }
      };
      
      recognition.onerror = (e: any) => { 
          console.error('[Voice] error:', e.error);
          // no-speech is normal - Chrome fires this when nobody speaks for a while
          // We should NOT reset mode on no-speech, just let onend restart
          if (e.error === 'not-allowed') {
              switchMode('WAKE_WORD');
              setInterimText('');
          }
          // For 'no-speech' and 'aborted', do nothing - onend will restart
      };
      
      recognition.onend = () => { 
          console.log('[Voice] Engine ended. intentionalStop:', intentionalStopRef.current, 'mode:', modeRef.current);
          
          if (intentionalStopRef.current) {
              // We stopped on purpose (mode switch). Keep the current mode and restart.
              intentionalStopRef.current = false;
          }
          // In all cases, restart the engine to keep listening
          setTimeout(() => {
              try {
                 recognition.start();
              } catch(e) {
                 console.error('[Voice] Failed to restart:', e);
              }
          }, 100);
      };
      
      recognitionRef.current = recognition;
      try { recognition.start(); } catch(e) {}
    }

    const monitorSpeaking = setInterval(() => {
      setIsSpeaking(synthRef.current.speaking);
    }, 100);

    return () => {
      if (recognitionRef.current) {
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
      }
      synthRef.current.cancel();
      clearInterval(monitorSpeaking);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveConfig = (newConfig: Partial<VoiceConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    localStorage.setItem('vayris_voice_config', JSON.stringify(updated));
  };

  // Manual mic button: switch to DICTATION, restart engine to flush buffer
  const startListening = () => {
    stopSpeaking();
    switchMode('DICTATION');
    if (recognitionRef.current) {
        intentionalStopRef.current = true;
        try { recognitionRef.current.stop(); } catch(e) {}
    }
  };

  const stopListening = () => {
    switchMode('WAKE_WORD');
    setInterimText('');
    if (recognitionRef.current) {
        intentionalStopRef.current = true;
        try { recognitionRef.current.stop(); } catch(e) {}
    }
  };

  const toggleListening = () => {
    if (mode === 'DICTATION') stopListening();
    else startListening();
  };

  const stopSpeaking = useCallback(() => {
    synthRef.current.cancel();
    speakQueueRef.current = [];
    speechBufferRef.current = '';
    setIsSpeaking(false);
  }, []);

  // Simple punctuation regex to chunk sentences
  const CHUNK_REGEX = /([.?!]+[\s]+)/;

  const processQueue = useCallback(() => {
    if (!config.voiceEnabled) return;
    if (synthRef.current.speaking) return; // already speaking
    
    if (speakQueueRef.current.length > 0) {
      const text = speakQueueRef.current.shift()!;
      if (!text.trim()) {
        processQueue();
        return;
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = config.rate;
      
      let selectedVoice = null;
      const voices = synthRef.current.getVoices();

      if (config.voiceURI) {
        selectedVoice = voices.find(v => v.voiceURI === config.voiceURI);
      }
      
      // Fallback to the best Jarvis-inspired premium male AI voice
      if (!selectedVoice) {
        const preferred = [
          'Google UK English Male',
          'Microsoft George - English (United Kingdom)',
          'Microsoft Mark - English (United States)',
          'Microsoft David - English (United States)'
        ];
        for (const name of preferred) {
          selectedVoice = voices.find(v => v.name === name);
          if (selectedVoice) break;
        }
      }

      if (selectedVoice) utterance.voice = selectedVoice;
      
      // Slightly lower pitch for a calm, confident, warm baritone feel
      utterance.pitch = 0.95;
      
      utterance.onend = () => processQueue();
      utterance.onerror = () => processQueue();
      
      synthRef.current.speak(utterance);
      setIsSpeaking(true);
    } else {
      setIsSpeaking(false);
    }
  }, [config]);

  // Feed stream text into the chunker
  const feedStream = useCallback((deltaText: string) => {
    if (!config.voiceEnabled) return;
    
    speechBufferRef.current += deltaText;
    
    const parts = speechBufferRef.current.split(CHUNK_REGEX);
    // parts will be alternating [text, punctuation, text, punctuation, remainder]
    
    // If there's at least one punctuation chunk, we can extract the completed sentences
    if (parts.length > 1) {
      // The last element is the remainder (no punctuation yet)
      const remainder = parts.pop() || '';
      
      // Combine the rest into complete sentences
      let chunk = '';
      for (let i = 0; i < parts.length; i += 2) {
        chunk += parts[i] + (parts[i+1] || '');
      }
      
      if (chunk.trim()) {
        speakQueueRef.current.push(chunk.trim());
        processQueue();
      }
      
      speechBufferRef.current = remainder;
    }
  }, [config.voiceEnabled, processQueue]);

  const speak = useCallback((text: string) => {
    if (!config.voiceEnabled) return;
    speakQueueRef.current.push(text);
    processQueue();
  }, [config.voiceEnabled, processQueue]);

  const finalizeStream = useCallback(() => {
    if (speechBufferRef.current.trim()) {
      speakQueueRef.current.push(speechBufferRef.current.trim());
      speechBufferRef.current = '';
      processQueue();
    }
  }, [processQueue]);

  return {
    isListening: mode === 'DICTATION',
    isSpeaking,
    interimText,
    startListening,
    stopListening,
    toggleListening,
    stopSpeaking,
    speak,
    feedStream,
    finalizeStream,
    config,
    saveConfig,
    availableVoices: synthRef.current.getVoices()
  };
}
