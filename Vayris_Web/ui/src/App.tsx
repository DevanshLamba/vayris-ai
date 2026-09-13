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
import { AnimatePresence, motion } from 'framer-motion';

type TaskEvent = { type: string; data?: any };
type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; toolActivities?: any[] };
type ActiveTask = { id: string; goal: string; status: string; events: TaskEvent[] } | null;
type PermissionReq = { reqId: string; tool: string; arguments: any } | null;

import { useVoiceIntegration } from './hooks/useVoiceIntegration';
import { useWebSpeechWakeWord } from './hooks/useWebSpeechWakeWord';

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

  const [orbState, setOrbState] = useState<'IDLE'|'LISTENING'|'THINKING'|'EXECUTING'|'WAITING'|'VERIFYING'|'COMPLETED'|'SPEAKING'|'ERROR'>('IDLE');

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(s => !s);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);
  
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

  // The single useVoiceIntegration now handles BOTH Wake Word and Dictation modes.
  // When isListening is false, it listens for "hey buddy".
  // When isListening is true, it routes transcripts to handleFinalTranscript.

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTask, voice.interimText]);

  useEffect(() => {
    let reconnectTimer: any;
    let activeWs: WebSocket | null = null;
    let isUnmounted = false;
    let activeTaskHasStreamed = false;
    
    const connect = () => {
      if (isUnmounted) return;
      console.log('[UI] connecting');
      const wsUrl = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:3000`;
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
            if (!last || last.role === 'user' || (last.role === 'assistant' && last.content.trim() === '')) {
              if (last && last.role === 'assistant' && last.content.trim() === '') {
                newMsgs[newMsgs.length - 1] = { ...last, content: response };
              } else {
                newMsgs.push({ id: Math.random().toString(), role: 'assistant', content: response });
              }
            }
            return newMsgs;
          });
          
          voice.finalizeStream();
          
          const spoken = msg.result?.metadata?.spokenResponse || response;
          // Strip HTML tags if we are falling back to response
          const cleanSpoken = spoken.replace(/<[^>]*>?/gm, '');

          if (voice.config.voiceEnabled && !activeTaskHasStreamed && cleanSpoken.trim()) {
              // fallback if stream wasn't used
              voice.feedStream(cleanSpoken + '. ');
              voice.finalizeStream();
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
            // Basic heuristic to hide raw tool JSON or XML if leaked by local models
            if (chunk.includes('<tool_call>')) chunk = chunk.split('<tool_call>')[0];
            if (chunk.includes('<complete_task>')) chunk = chunk.split('<complete_task>')[0];
            
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

  useEffect(() => {
    const handleVayrisCommand = (e: any) => {
      const { command } = e.detail;
      if (command && socket && socket.readyState === WebSocket.OPEN) {
        console.log('[UI] sending VAYRIS_COMMAND:', command);
        setMessages(prev => [...prev, { id: Math.random().toString(), role: 'user', content: command }]);
        socket.send(JSON.stringify({ 
          type: 'run_task', 
          goal: command
        }));
        setOrbState('THINKING');
      }
    };
    window.addEventListener('VAYRIS_COMMAND', handleVayrisCommand);
    return () => window.removeEventListener('VAYRIS_COMMAND', handleVayrisCommand);
  }, [socket]);

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
          <div className="flex items-center gap-2 pointer-events-auto opacity-40 hover:opacity-100 transition-opacity duration-300">
            <div className="flex items-center gap-2 mr-4 bg-white/5 px-3 py-1 rounded-full text-[10px] uppercase font-mono tracking-widest text-white/50">
              <div className={`w-1.5 h-1.5 rounded-full ${voice.isListening ? 'bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.8)] animate-pulse' : 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]'}`} />
              {voice.isListening ? 'Listening...' : 'Wake Word Active'}
            </div>
            <div className={`w-2 h-2 rounded-full mr-2 ${connected ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-red-500 animate-pulse'}`} title={connected ? 'Online' : 'Disconnected'} />
            {[
              { icon: List, action: () => setShowHistory(true), title: 'History' },
              { icon: Zap, action: () => setShowCapabilities(true), title: 'Capabilities' },
              { icon: HardDrive, action: () => setShowMemory(true), title: 'Memory' },
              { icon: Settings, action: () => setShowSettings(true), title: 'Settings' },
            ].map(({ icon: Icon, action, title }) => (
              <button
                key={title}
                onClick={action}
                className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all"
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
            </div>
          </div>
        ) : (
          /* CHAT MODE: Messages + composer at bottom */
          <>
            <div className="flex-1 w-full max-w-3xl mx-auto overflow-y-auto custom-scrollbar flex flex-col pt-24 pb-4 px-6 pointer-events-auto relative">
              <div className="flex-1 min-h-[min-content] flex flex-col justify-end">
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
                        : 'text-purple-50/90 font-light'
                    }`}>
                      {msg.role === 'assistant' && <div className="text-[9px] font-mono tracking-widest text-fuchsia-400/50 uppercase mb-1.5">Vayris</div>}
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
              </div>
              <div ref={chatEndRef} className="h-2" />
            </div>

            <footer className="w-full pb-8 flex justify-center pointer-events-auto shrink-0">
              <div className="w-full max-w-2xl px-6">
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

      {/* Layer 8: Persistent Copyright */}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <span className="text-[10px] font-mono text-indigo-300/75 tracking-widest select-none drop-shadow-[0_0_5px_rgba(165,180,252,0.4)]">
          &copy; 2026 Devansh Lamba
        </span>
      </div>
    </main>
  );
}

