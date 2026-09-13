/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import React, { useState, useEffect, useRef } from 'react';
import { Settings, Shield, HardDrive, List, Zap, MessageSquare, Activity, CheckCircle, XCircle } from 'lucide-react';
import { VayrisOrb } from './components/VayrisOrb';
import { ToolActivityCard } from './components/ToolActivityCard';
import { PermissionModal } from './components/PermissionModal';
import { MessageComposer } from './components/MessageComposer';
import { SettingsModal } from './components/SettingsModal';
import { MemoryModal } from './components/MemoryModal';
import { TaskTimeline } from './components/TaskTimeline';
import { CapabilitiesModal } from './components/CapabilitiesModal';
import { TaskHistoryModal } from './components/TaskHistoryModal';
import { SetupModal } from './components/SetupModal';
import { LegalModal } from './components/LegalModal';
import { AnimatePresence, motion } from 'framer-motion';

type TaskEvent = { type: string; data?: any };
type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; toolActivities?: any[] };
type ActiveTask = { id: string; goal: string; status: string; events: TaskEvent[] } | null;
type PermissionReq = { reqId: string; tool: string; arguments: any } | null;

import { useVoiceIntegration } from './hooks/useVoiceIntegration';

// ... (skipping type declarations)

export default function App() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [mode, setMode] = useState<'AUTO'|'FAST'|'DEEP'>('AUTO');
  const [connected, setConnected] = useState(false);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  
  const [activeTask, setActiveTask] = useState<ActiveTask>(null);
  const [permissionReq, setPermissionReq] = useState<PermissionReq>(null);
  const [taskHistory, setTaskHistory] = useState<any[]>([]);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [needsLegal, setNeedsLegal] = useState(false);
  const [backendError, setBackendError] = useState('');

  const [orbState, setOrbState] = useState<'IDLE'|'LISTENING'|'THINKING'|'EXECUTING'|'WAITING'|'VERIFYING'|'COMPLETED'|'SPEAKING'|'ERROR'>('IDLE');

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(s => !s);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);

    if ((window as any).electronAPI) {
      // First, get the initial status in case we missed the event
      (window as any).electronAPI.getStatus().then((data: any) => {
        if (data.status === 'needs_legal') setNeedsLegal(true);
        else if (data.status === 'needs_setup') setNeedsSetup(true);
        else if (data.status === 'error') setBackendError(data.message);
      });

      // Then listen for updates
      (window as any).electronAPI.onBackendStatus((data: any) => {
        console.log('[UI] Backend status:', data);
        if (data.status === 'needs_legal') {
          setNeedsLegal(true);
          setNeedsSetup(false);
        } else if (data.status === 'needs_setup') {
          setNeedsSetup(true);
          setNeedsLegal(false);
        } else if (data.status === 'error') {
          setBackendError(data.message);
        } else if (data.status === 'running') {
          setNeedsSetup(false);
          setNeedsLegal(false);
          setBackendError('');
        }
      });
    }

    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  useEffect(() => {
    const handleCommand = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.type === 'VAYRIS_COMMAND' && socket) {
         const command = customEvent.detail?.command;
         if (command) {
           console.log('[UI] inline command executed:', command);
           setMessages(prev => [...prev, { id: Math.random().toString(), role: 'user', content: command }]);
           socket.send(JSON.stringify({ type: 'run_task', goal: command, mode }));
           setOrbState('THINKING');
         }
      }
    };
    window.addEventListener('VAYRIS_COMMAND', handleCommand);
    return () => window.removeEventListener('VAYRIS_COMMAND', handleCommand);
  }, [socket, mode]);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleFinalTranscript = (text: string) => {
    // If it's a cancellation phrase and we have an active task
    const lower = text.toLowerCase();
    if ((lower === 'stop' || lower === 'cancel' || lower === 'cancel that.' || lower === 'stop.') && activeTask && socket) {
      socket.send(JSON.stringify({ type: 'cancel_task' }));
      setOrbState('ERROR');
      return;
    }
    
    // Normal submission
    if (!text.trim() || !socket) return;
    console.log('[UI] sending run_task:', text);
    setMessages(prev => [...prev, { id: Math.random().toString(), role: 'user', content: text }]);
    socket.send(JSON.stringify({ type: 'run_task', goal: text, mode }));
    setOrbState('THINKING');
  };

  const voice = useVoiceIntegration(handleFinalTranscript);

  const [greetingText, setGreetingText] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const hasGreetedRef = useRef(false);
  
  useEffect(() => {
    if (!hasGreetedRef.current) {
      hasGreetedRef.current = true;
      setTimeout(() => {
        setGreetingText('Welcome, Boss. What should we do today?');
        voice.speak('Welcome, Boss. What should we do today?');
      }, 2500);
    }
  }, [voice]);

  useEffect(() => {
    if (voice.isListening) setOrbState('LISTENING');
    else if (voice.isSpeaking) setOrbState('SPEAKING');
    else if (orbState === 'LISTENING' || orbState === 'SPEAKING') setOrbState('IDLE');
  }, [voice.isListening, voice.isSpeaking]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    // Only auto-scroll if user is near the bottom (within 150px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTask, voice.interimText]);

  useEffect(() => {
    let reconnectTimer: any;
    let activeWs: WebSocket | null = null;
    let isUnmounted = false;
    let activeTaskHasStreamed = false;
    
    const connect = () => {
      if (isUnmounted) return;
      console.log('[UI] connecting');
      const hostname = window.location.hostname || 'localhost';
      const wsUrl = import.meta.env.VITE_WS_URL || `ws://${hostname}:3000`;
      const ws = new WebSocket(wsUrl);
      activeWs = ws;
      
      ws.onopen = () => {
        if (isUnmounted) {
          ws.close();
          return;
        }
        console.log('[UI] connected');
        setConnected(true);
        if (orbState === 'ERROR') setOrbState('IDLE');
      };
      
      ws.onclose = () => {
        // Clear active task state on disconnect so UI doesn't get stuck if backend restarts
        setActiveTask(null);
        setIsCancelling(false);
        setConnected(false);
        setOrbState('ERROR');
        if (!isUnmounted) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
      
      ws.onmessage = (event) => {
        if (isUnmounted) return;
        const msg = JSON.parse(event.data);
        console.log('[UI] received event:', msg.type, msg);
        
        if (msg.type === 'task_result') {
          const response = msg.result?.metadata?.finalResponse || 'Task Finished.';
          
          setMessages(prev => {
            const newMsgs = [...prev];
            const last = newMsgs[newMsgs.length - 1];
            if (last && last.role === 'assistant') {
              // Always replace with authoritative finalResponse (may contain uiContent HTML cards)
              newMsgs[newMsgs.length - 1] = { ...last, content: response };
            } else {
              newMsgs.push({ id: Math.random().toString(), role: 'assistant', content: response });
            }
            return newMsgs;
          });
          
          voice.finalizeStream();
          if (voice.config.voiceEnabled && !activeTaskHasStreamed) {
              // Extract clean spoken text
              let spoken = msg.result?.metadata?.spokenResponse;
              if (!spoken && response.trim()) {
                 // Strip HTML tags and markdown
                 spoken = response
                    .replace(/<[^>]*>?/gm, '')
                    .replace(/```[\s\S]*?```/g, '')
                    .replace(/[*_~`#]/g, '')
                    .trim();
              }
              if (spoken) {
                 voice.feedStream(spoken + '. ');
                 voice.finalizeStream();
              }
          }
          
          setActiveTask(prev => {
            if (prev) setTaskHistory(h => [...h, { ...prev, status: 'COMPLETED' }]);
            return null;
          });
          setTimeout(() => setOrbState('IDLE'), 3000);
        }
        else if (msg.type === 'task_event') {
          const taskEvent = msg.data;
          if (!taskEvent) return;
          
          if (taskEvent.type === 'TASK_STARTED') {
            activeTaskHasStreamed = false;
            const taskId = taskEvent.taskId || taskEvent.data?.id || Math.random().toString();
            const goal = taskEvent.data?.goal || 'Task';
            setActiveTask({ id: taskId, goal, status: 'RUNNING', events: [] });
            setOrbState('THINKING');
            setMessages(prev => [...prev, { id: `stream-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, role: 'assistant', content: '' }]);
          } else if (taskEvent.type === 'MESSAGE_DELTA') {
            activeTaskHasStreamed = true;
            let chunk = taskEvent.data?.content || '';
            // Strip raw model artifacts that local LLMs leak
            if (chunk.includes('<tool_call>')) chunk = chunk.split('<tool_call>')[0];
            if (chunk.includes('<complete_task>')) chunk = chunk.split('<complete_task>')[0];
            if (chunk.includes('<think>')) chunk = chunk.split('<think>')[0];
            if (chunk.includes('</think>')) chunk = chunk.split('</think>').pop() || '';
            // Strip raw JSON tool calls that models sometimes emit
            chunk = chunk.replace(/\{\s*"\s*(name|type)"\s*:\s*"(function|[^"]+)".*$/s, '');
            if (!chunk.trim()) return; // Skip empty chunks after filtering
            
            voice.feedStream(chunk);
            setMessages(prev => {
              const newMessages = [...prev];
              const last = newMessages[newMessages.length - 1];
              if (last && last.role === 'assistant') {
                newMessages[newMessages.length - 1] = {
                  ...last,
                  content: last.content + chunk
                };
              } else {
                newMessages.push({ id: `stream-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, role: 'assistant', content: chunk });
              }
              return newMessages;
            });
            if (!voice.isSpeaking) setOrbState('EXECUTING');
          } else {
            setActiveTask(prev => prev ? { ...prev, events: [...prev.events, taskEvent] } : prev);
            
            if (taskEvent.type === 'STEP_STARTED' || taskEvent.type === 'TOOL_CALLED') setOrbState('EXECUTING');
            if (taskEvent.type === 'VERIFICATION_STARTED') setOrbState('VERIFYING');
            if (taskEvent.type === 'STEP_FAILED') setOrbState('THINKING');
            if (taskEvent.type === 'TASK_COMPLETED') setIsCancelling(false);
            if (taskEvent.type === 'TASK_FAILED' || taskEvent.type === 'TASK_CANCELLED') {
               setIsCancelling(false);
               setOrbState('ERROR');
               setActiveTask(prev => {
                 if (prev) setTaskHistory(h => [...h, { ...prev, status: 'ERROR' }]);
                 return null;
               });
               setTimeout(() => setOrbState('IDLE'), 3000);
            }
          }
        }
        else if (msg.type === 'permission_request') {
          setPermissionReq(msg);
          setOrbState('WAITING');
        }
      };
      
      setSocket(ws);
    };
    
    connect();
    
    return () => {
      isUnmounted = true;
      clearTimeout(reconnectTimer);
      activeWs?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [image, setImage] = useState<any>(null);

  const handleSubmit = () => {
    if ((!input.trim() && !image) || !socket) return;
    console.log('[UI] sending run_task:', input || '[Image Attached]');
    setMessages(prev => [...prev, { id: Math.random().toString(), role: 'user', content: input || '[Image Attached]' }]);
    socket.send(JSON.stringify({ 
      type: 'run_task', 
      goal: input || 'Analyze this image',
      image: image ? { mimeType: image.mimeType, data: image.data } : undefined,
      mode
    }));
    setInput('');
    setImage(null);
    setOrbState('THINKING');
  };

  const handleCancel = () => {
    if (socket && activeTask && !isCancelling) {
      socket.send(JSON.stringify({ type: 'cancel_task' }));
      setIsCancelling(true);
      
      // Safety timeout: if the backend doesn't acknowledge the cancellation
      // within 3 seconds, re-enable the cancel button to allow retry.
      setTimeout(() => {
        setIsCancelling((prev) => {
          if (prev) {
            console.warn('Backend did not respond to cancel_task, resetting UI state.');
            return false;
          }
          return prev;
        });
      }, 3000);
    }
  };

  const handlePermission = (allowed: boolean, data?: any) => {
    if (permissionReq && socket) {
      socket.send(JSON.stringify({ type: 'permission_response', reqId: permissionReq.reqId, allowed, data }));
      setPermissionReq(null);
      setOrbState('EXECUTING');
    }
  };

  const isIdle = messages.length === 0 && !activeTask;

  return (
    <main className="relative w-full h-screen overflow-hidden bg-black text-slate-200 font-sans selection:bg-purple-500/30">
      {/* Layer 0+1: 3D World */}
      <VayrisOrb state={orbState} isIdle={isIdle} />

      {/* Layer 2-6: HTML UI */}
      <div className="relative z-10 w-full h-full flex flex-col pointer-events-none">

        {/* Floating Controls — top right, glass surface */}
        <header className="w-full p-6 flex justify-between items-start pointer-events-none">
          {/* Left: Task Timeline (only visible during tasks) */}
          <div className="w-80 pointer-events-auto h-full max-h-[70vh]">
            <AnimatePresence>
              {activeTask && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="glass-strong rounded-2xl p-5 shadow-2xl h-full flex flex-col"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[10px] font-mono tracking-widest text-indigo-400 uppercase flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                      <span>Processing</span>
                    </h2>
                    <button onClick={handleCancel} className="text-[10px] text-red-400 hover:text-red-300 uppercase font-mono tracking-widest transition-colors">Abort</button>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    <TaskTimeline activeTask={activeTask} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Utility Controls */}
          <div className="flex items-center gap-2 pointer-events-auto opacity-50 hover:opacity-100 transition-opacity duration-300 bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5">
            <div className={`w-2 h-2 rounded-full mr-1 ${connected ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'}`} title={connected ? 'Online' : 'Disconnected'} />
            {[
              { icon: List, action: () => setShowHistory(true), title: 'History' },
              { icon: Zap, action: () => setShowCapabilities(true), title: 'Capabilities' },
              { icon: HardDrive, action: () => setShowMemory(true), title: 'Memory' },
              { icon: Settings, action: () => setShowSettings(true), title: 'Settings' },
            ].map(({ icon: Icon, action, title }) => (
              <button
                key={title}
                onClick={action}
                className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all"
                title={title}
                aria-label={title}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </header>

        {/* Main Content Area */}
        {isIdle ? (
          /* IDLE MODE: Centered title + composer */
          <div className="flex-1 flex flex-col items-center justify-center px-6 pointer-events-auto">
            <AnimatePresence mode="wait">
              <motion.h1
                key={greetingText}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="text-white/90 text-[28px] font-light tracking-tight mb-8 text-center min-h-[40px]"
              >
                {greetingText}
              </motion.h1>
            </AnimatePresence>
            <div className="w-full max-w-2xl">
              <MessageComposer
                input={input} setInput={setInput}
                onSubmit={handleSubmit} onCancel={handleCancel}
                isProcessing={false}
                isSpeaking={voice.isSpeaking || voice.isListening}
                toggleVoice={() => { if (voice.isSpeaking) voice.stopSpeaking(); else voice.toggleListening(); }}
                image={image} setImage={setImage}
                mode={mode} setMode={setMode}
              />
              {voice.config.wakeWordEnabled && (
                <div className={`text-center mt-3 text-[11px] font-mono tracking-widest uppercase ${
                  voice.voskState === 'ERROR' ? 'text-red-400/80' :
                  voice.voskState === 'LISTENING' ? 'text-purple-400/60 animate-pulse' :
                  voice.voskState === 'LOADING' ? 'text-yellow-400/60' :
                  'text-gray-400/40'
                }`}>
                  {voice.voskState === 'LOADING' && '⏳ Loading wake word model...'}
                  {voice.voskState === 'LISTENING' && `🎙 Listening for "${voice.config.wakeWord}"...`}
                  {voice.voskState === 'READY' && `⏸ Wake word paused`}
                  {voice.voskState === 'ERROR' && `❌ Wake word error: ${voice.voskError || 'unknown'}`}
                  {voice.voskState === 'DISABLED' && ''}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* CHAT MODE: Messages + composer at bottom */
          <>
            <div ref={scrollContainerRef} className="flex-1 min-h-0 w-full max-w-3xl mx-auto overflow-y-auto custom-scrollbar flex flex-col pb-4 px-6 pointer-events-auto">
              <div className="mt-auto" />
              <AnimatePresence>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex mb-5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] text-[15px] leading-relaxed tracking-wide ${
                      msg.role === 'user'
                        ? 'text-white/80 font-light text-right'
                        : 'text-white/90 font-light'
                    }`}>
                      {msg.role === 'assistant' && <div className="text-[10px] font-semibold tracking-widest text-white/30 uppercase mb-2">Vayris</div>}
                      <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {voice.interimText && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-end mb-5">
                  <div className="max-w-[85%] text-[15px] text-white/40 font-light text-right italic">{voice.interimText}</div>
                </motion.div>
              )}

              <div ref={chatEndRef} className="h-2" />
            </div>

            <footer className="w-full pb-8 flex justify-center pointer-events-auto shrink-0 relative">
              <div className="absolute -top-12 left-0 w-full h-12 bg-gradient-to-b from-transparent to-black pointer-events-none" />
              <div className="w-full max-w-2xl px-6 relative z-10">
                <MessageComposer
                  input={input} setInput={setInput}
                  onSubmit={handleSubmit} onCancel={handleCancel}
                  isProcessing={activeTask !== null && activeTask.status !== 'COMPLETED'}
                  isCancelling={isCancelling}
                  isSpeaking={voice.isSpeaking || voice.isListening}
                  toggleVoice={() => { if (voice.isSpeaking) voice.stopSpeaking(); else voice.toggleListening(); }}
                  image={image} setImage={setImage}
                  mode={mode} setMode={setMode}
                />
                {voice.config.wakeWordEnabled && (
                  <div className={`text-center mt-2 mb-[-8px] text-[10px] font-mono tracking-widest uppercase ${
                    voice.voskState === 'ERROR' ? 'text-red-400/70' :
                    voice.voskState === 'LISTENING' ? 'text-purple-400/50' :
                    voice.voskState === 'LOADING' ? 'text-yellow-400/50' :
                    'text-gray-400/30'
                  }`}>
                    {voice.voskState === 'LOADING' && '⏳ Loading model...'}
                    {voice.voskState === 'LISTENING' && `🎙 "${voice.config.wakeWord}"`}
                    {voice.voskState === 'READY' && '⏸ paused'}
                    {voice.voskState === 'ERROR' && `❌ ${voice.voskError || 'error'}`}
                  </div>
                )}
              </div>
            </footer>
          </>
        )}
      </div>

      {/* Layer 7: Modal overlays */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} voice={voice} />}
      {showMemory && <MemoryModal onClose={() => setShowMemory(false)} />}
      {showCapabilities && <CapabilitiesModal onClose={() => setShowCapabilities(false)} />}
      {showHistory && <TaskHistoryModal history={taskHistory} onClose={() => setShowHistory(false)} />}
      {permissionReq && <PermissionModal toolName={permissionReq.tool} args={permissionReq.arguments} onRespond={handlePermission} />}
      {needsLegal && <LegalModal onComplete={() => setNeedsLegal(false)} />}
      {needsSetup && <SetupModal onComplete={() => setNeedsSetup(false)} />}
      
      {backendError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/80 text-white px-4 py-2 rounded shadow-lg backdrop-blur">
          Backend Error: {backendError}
        </div>
      )}

      {/* Layer 8: Persistent Copyright */}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <span className="text-[10px] font-mono text-indigo-300/75 tracking-widest select-none drop-shadow-[0_0_5px_rgba(165,180,252,0.4)]">
          &copy; 2026 Devansh Lamba
        </span>
      </div>
    </main>
  );
}

