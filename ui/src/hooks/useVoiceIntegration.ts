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

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimText, setInterimText] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  
  const speechBufferRef = useRef<string>('');
  const speakQueueRef = useRef<string[]>([]);
  
  const checkQueueTimer = useRef<any>(null);
  const callbackRef = useRef(onFinalTranscript);

  useEffect(() => {
    callbackRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    // Load config from local storage
    const saved = localStorage.getItem('vayris_voice_config');
    if (saved) {
      try { setConfig(JSON.parse(saved)); } catch {}
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onstart = () => setIsListening(true);
      
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
        
        setInterimText(interim);
        
        // Barge-in: User is speaking, so stop Vayris speaking
        if (synthRef.current.speaking && (interim.trim() || final.trim())) {
          stopSpeaking();
        }
        
        if (final.trim()) {
          setInterimText('');
          stopListening();
          
          // Check if it's a voice cancellation intent
          const lower = final.trim().toLowerCase();
          if (lower === 'stop.' || lower === 'cancel that.' || lower === 'stop' || lower === 'cancel') {
            // we will let the main app handle cancellation, but we pass it out
            callbackRef.current(final.trim());
          } else {
            callbackRef.current(final.trim());
          }
        }
      };
      
      recognition.onerror = () => { setIsListening(false); setInterimText(''); };
      recognition.onend = () => { setIsListening(false); setInterimText(''); };
      
      recognitionRef.current = recognition;
    }

    // Monitor speaking state
    const monitorSpeaking = setInterval(() => {
      if (synthRef.current.speaking) {
        setIsSpeaking(true);
      } else {
        setIsSpeaking(false);
      }
    }, 100);

    return () => {
      recognitionRef.current?.stop();
      synthRef.current.cancel();
      clearInterval(monitorSpeaking);
      clearInterval(checkQueueTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveConfig = (newConfig: Partial<VoiceConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    localStorage.setItem('vayris_voice_config', JSON.stringify(updated));
  };

  const startListening = () => {
    if (recognitionRef.current) {
      stopSpeaking();
      try { recognitionRef.current.start(); } catch (e) {}
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
  };

  const toggleListening = () => {
    if (isListening) stopListening();
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
      
      if (config.voiceURI) {
        const voices = synthRef.current.getVoices();
        const selected = voices.find(v => v.voiceURI === config.voiceURI);
        if (selected) utterance.voice = selected;
      }
      
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
    isListening,
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
