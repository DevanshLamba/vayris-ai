/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import React from 'react';
import { Settings, Play, CheckCircle2, Clock, XCircle, AlertTriangle, ShieldAlert } from 'lucide-react';
import { ToolActivityCard } from './ToolActivityCard';

export const TaskTimeline: React.FC<{ activeTask: any }> = ({ activeTask }) => {
  if (!activeTask) {
    return (
      <div className="text-gray-600 text-sm h-full flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border border-gray-800 border-dashed flex items-center justify-center opacity-50">
          <Settings className="w-5 h-5 animate-[spin_10s_linear_infinite]" />
        </div>
        <span>System Idle</span>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'RUNNING': return <Play className="w-4 h-4 text-cyan-400" />;
      case 'COMPLETED': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'ERROR': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'Working';
      case 'COMPLETED': return 'Finished';
      case 'ERROR': return 'Failed';
      default: return status;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full animate-in fade-in duration-300">
      <div className="mb-4 pb-4 border-b border-white/10">
        <div className="flex items-center space-x-2 mb-2">
          {getStatusIcon(activeTask.status)}
          <span className="text-[9px] uppercase tracking-widest font-mono text-white/50">{getStatusText(activeTask.status)}</span>
        </div>
        <h3 className="text-sm font-light text-white/80 leading-relaxed truncate">{activeTask.goal}</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
        <div className="relative border-l border-white/10 ml-2 pl-4 space-y-6">
          {activeTask.events.map((ev: any, i: number) => {
            if (ev.type === 'PLAN_CREATED') {
              return (
                <div key={i} className="relative">
                  <div className="absolute -left-[21px] top-1 w-2 h-2 rounded-full border border-black bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>
                  <div className="text-xs space-y-2 bg-black/20 p-3 rounded-lg border border-white/5 backdrop-blur-sm">
                    <div className="text-white/40 uppercase font-mono text-[9px] tracking-widest mb-2">Execution Plan</div>
                    {ev.data?.steps?.map((step: string, idx: number) => (
                      <div key={idx} className="flex space-x-2 text-white/60 leading-relaxed font-light text-[11px]">
                        <span className="text-indigo-400/50">{idx + 1}.</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            if (ev.type === 'TOOL_CALLED') {
              return (
                <div key={i} className="relative">
                  <div className="absolute -left-[21px] top-2 w-2 h-2 rounded-full border border-black bg-cyan-500 shadow-[0_0_8px_rgba(6,182,214,0.8)] animate-pulse"></div>
                  <ToolActivityCard toolName={ev.data.tool} args={ev.data.args} status="running" />
                </div>
              );
            }
            if (ev.type === 'TOOL_RESULT') {
              return (
                <div key={i} className="relative">
                  <div className={`absolute -left-[21px] top-2 w-2 h-2 rounded-full border border-black shadow-[0_0_8px_rgba(255,255,255,0.2)] ${ev.data.result.success ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></div>
                  <ToolActivityCard toolName={ev.data.tool} result={ev.data.result} status={ev.data.result.success ? 'success' : 'failed'} error={ev.data.result.error} />
                </div>
              );
            }
            if (ev.type === 'PERMISSION_REQUESTED') {
               return (
                 <div key={i} className="relative">
                   <div className="absolute -left-[21px] top-2 w-2 h-2 rounded-full border border-black bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse"></div>
                   <div className="text-[11px] font-light bg-amber-500/10 text-amber-500/90 p-3 rounded-lg border border-amber-500/20 flex items-center space-x-2 backdrop-blur-sm">
                     <ShieldAlert className="w-3 h-3" />
                     <span>Waiting for user approval to run <span className="font-mono bg-black/30 px-1 rounded">{ev.data?.tool}</span></span>
                   </div>
                 </div>
               );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};
