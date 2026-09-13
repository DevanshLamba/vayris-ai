import { useState, useRef, useEffect, useCallback } from 'react';
import { useVoskSTT, VoskListenMode } from './useVoskWakeWord';

export interface VoiceConfig {
  voiceEnabled: boolean;
  rate: number;
  voiceURI: string | null;
  wakeWordEnabled: boolean;
  wakeWord: string;
}

export type VoiceState = 'IDLE' | 'WAKE_WORD_LISTENING' | 'COMMAND_LISTENING';

export function useVoiceIntegration(onFinalTranscript: (text: string) => void) {
  const [config, setConfig] = useState<VoiceConfig>({
    voiceEnabled: true,
    rate: 1.0,
    voiceURI: null,
    wakeWordEnabled: false,
    wakeWord: 'hey buddy',
  });

  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimText, setInterimText] = useState('');
  
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const speechBufferRef = useRef<string>('');
  const speakQueueRef = useRef<string[]>([]);
  
  const callbackRef = useRef(onFinalTranscript);
  const commandTimeoutRef = useRef<any>(null); // For absolute fallback timeout if no speech ever occurs

  useEffect(() => {
    callbackRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    const saved = localStorage.getItem('vayris_voice_config');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (parsed.wakeWord === 'vayris') parsed.wakeWord = 'hey buddy';
        setConfig({ ...config, ...parsed }); 
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const monitorSpeaking = setInterval(() => {
      if (synthRef.current.speaking) {
        setIsSpeaking(true);
      } else {
        setIsSpeaking(false);
      }
    }, 100);
    return () => {
      clearInterval(monitorSpeaking);
      clearTimeout(commandTimeoutRef.current);
    };
  }, []);

  const playActivationSound = useCallback(() => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}
  }, []);

  const stopSpeaking = useCallback(() => {
    synthRef.current.cancel();
    speakQueueRef.current = [];
    speechBufferRef.current = '';
    setIsSpeaking(false);
  }, []);

  const startManualListening = useCallback(() => {
    stopSpeaking();
    setInterimText('');
    setVoiceState('COMMAND_LISTENING');
    playActivationSound();
    
    // Absolute fallback: if user says NOTHING for 15s, go back to idle/wake
    clearTimeout(commandTimeoutRef.current);
    commandTimeoutRef.current = setTimeout(() => {
       console.log('[VAYRIS] 15s silence fallback reached, stopping command listen');
       setVoiceState(config.wakeWordEnabled ? 'WAKE_WORD_LISTENING' : 'IDLE');
       setInterimText('');
    }, 15000);
  }, [config.wakeWordEnabled, playActivationSound, stopSpeaking]);

  const stopManualListening = useCallback(() => {
    setVoiceState(config.wakeWordEnabled ? 'WAKE_WORD_LISTENING' : 'IDLE');
    setInterimText('');
    clearTimeout(commandTimeoutRef.current);
  }, [config.wakeWordEnabled]);

  const toggleListening = useCallback(() => {
    if (voiceState === 'COMMAND_LISTENING') stopManualListening();
    else startManualListening();
  }, [voiceState, startManualListening, stopManualListening]);

  // ---- State Transitions ----
  // After TTS finishes → resume wake listening
  useEffect(() => {
     if (!isSpeaking && config.wakeWordEnabled && voiceState === 'IDLE') {
        console.log('[VAYRIS] TTS finished, resuming WAKE_WORD_LISTENING');
        setVoiceState('WAKE_WORD_LISTENING');
     }
  }, [isSpeaking, config.wakeWordEnabled, voiceState]);

  // Transition IDLE → WAKE_WORD_LISTENING when conditions are met
  useEffect(() => {
     const wantWake = config.wakeWordEnabled && !isSpeaking;
     if (wantWake && voiceState === 'IDLE') {
        setVoiceState('WAKE_WORD_LISTENING');
     } else if (!config.wakeWordEnabled && voiceState === 'WAKE_WORD_LISTENING') {
        setVoiceState('IDLE');
     }
  }, [config.wakeWordEnabled, isSpeaking, voiceState]);

  // ---- Vosk STT Integration ----
  let voskMode: VoskListenMode = 'IDLE';
  if (!isSpeaking) {
      if (voiceState === 'COMMAND_LISTENING') voskMode = 'COMMAND';
      else if (voiceState === 'WAKE_WORD_LISTENING') voskMode = 'WAKE_WORD';
  }

  const vosk = useVoskSTT({
      enabled: true, // Always keep model loaded in memory for instant STT
      listenMode: voskMode,
      wakePhrase: config.wakeWord,
      onWakeWordDetected: () => {
          console.log('[VAYRIS] Wake word detected -> transitioning to COMMAND_LISTENING');
          startManualListening();
      },
      onCommandPartial: (text) => {
          if (isSpeaking) {
              stopSpeaking();
          }
          
          const cleanText = text.toLowerCase().trim();
          const stopCommands = ['stop it', 'stop', 'stop listening', 'cancel', 'never mind', 'nevermind'];
          
          if (stopCommands.some(cmd => cleanText === cmd || cleanText.endsWith(cmd))) {
              console.log(`[VAYRIS] Local stop command intercepted (partial): "${cleanText}"`);
              stopManualListening();
              return;
          }

          setInterimText(text);
          // Extend timeout as long as user is speaking
          clearTimeout(commandTimeoutRef.current);
          commandTimeoutRef.current = setTimeout(() => {
             console.log('[VAYRIS] Extended 10s silence fallback reached');
             setVoiceState(config.wakeWordEnabled ? 'WAKE_WORD_LISTENING' : 'IDLE');
             setInterimText('');
          }, 10000);
      },
      onCommandFinal: (text) => {
          console.log(`[VAYRIS] Command STT Final: "${text}"`);
          clearTimeout(commandTimeoutRef.current);
          setInterimText('');
          setVoiceState(config.wakeWordEnabled ? 'WAKE_WORD_LISTENING' : 'IDLE');
          
          if (text) {
              const cleanText = text.toLowerCase().trim();
              const stopCommands = ['stop it', 'stop', 'stop listening', 'cancel', 'never mind', 'nevermind'];
              if (stopCommands.includes(cleanText)) {
                  console.log(`[VAYRIS] Local stop command intercepted (final): "${cleanText}"`);
                  stopSpeaking();
                  return;
              }
              callbackRef.current(text);
          }
      }
  });

  const saveConfig = (newConfig: Partial<VoiceConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    localStorage.setItem('vayris_voice_config', JSON.stringify(updated));
  };

  // Simple punctuation regex to chunk sentences
  const CHUNK_REGEX = /([.?!]+[\s]+)/;

  const processQueue = useCallback(() => {
    if (!config.voiceEnabled) return;
    if (synthRef.current.speaking) return; 
    
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
      utterance.pitch = 0.95;
      
      utterance.onend = () => {
         processQueue();
      };
      utterance.onerror = () => processQueue();
      
      synthRef.current.speak(utterance);
      setIsSpeaking(true);
    } else {
      setIsSpeaking(false);
    }
  }, [config]);

  const feedStream = useCallback((deltaText: string) => {
    if (!config.voiceEnabled) return;
    
    speechBufferRef.current += deltaText;
    const parts = speechBufferRef.current.split(CHUNK_REGEX);
    
    if (parts.length > 1) {
      const remainder = parts.pop() || '';
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
    isListening: voiceState === 'COMMAND_LISTENING',
    isWakeWordListening: voiceState === 'WAKE_WORD_LISTENING',
    isSpeaking,
    interimText,
    startListening: startManualListening,
    stopListening: stopManualListening,
    toggleListening,
    stopSpeaking,
    speak,
    feedStream,
    finalizeStream,
    config,
    saveConfig,
    availableVoices: synthRef.current.getVoices(),
    voskState: vosk.state,
    voskError: vosk.errorMsg
  };
}
