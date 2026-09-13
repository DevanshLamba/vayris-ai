/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import React from 'react';
import { X, CheckCircle2, XCircle, Clock, List } from 'lucide-react';
import { TaskTimeline } from './TaskTimeline';

export const TaskHistoryModal: React.FC<{
  history: any[];
  onClose: () => void;
}> = ({ history, onClose }) => {
  const [selectedTask, setSelectedTask] = React.useState<any | null>(null);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-[#111] border border-white/10 rounded-3xl shadow-2xl max-w-5xl w-full h-[85vh] flex overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Sidebar */}
        <div className="w-1/3 border-r border-white/5 flex flex-col bg-[#0a0a0a]">
          <div className="p-6 border-b border-white/5 flex items-center space-x-4">
            <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-white border border-white/10">
              <List className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-medium text-white tracking-wide">Session History</h2>
              <div className="text-xs text-white/40 mt-0.5">{history.length} tasks completed</div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
            {history.length === 0 ? (
              <div className="text-gray-600 text-sm h-full flex items-center justify-center">No tasks completed in this session.</div>
            ) : (
              history.map((task, i) => (
                <button 
                  key={i}
                  onClick={() => setSelectedTask(task)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${selectedTask === task ? 'bg-gray-800 border-gray-600 shadow-md' : 'bg-gray-900/50 border-gray-800/50 hover:bg-gray-800/80 hover:border-gray-700'}`}
                >
                  <div className="flex items-center space-x-2 mb-2">
                    {task.status === 'COMPLETED' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                    <span className="text-[10px] uppercase font-bold tracking-widest text-gray-500">Task {i + 1}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-200 line-clamp-2 leading-relaxed">{task.goal}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail View */}
        <div className="flex-1 flex flex-col relative bg-black">
          <button onClick={onClose} className="absolute top-6 right-6 z-10 p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex-1 p-8 overflow-hidden">
            {selectedTask ? (
              <TaskTimeline activeTask={selectedTask} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center space-y-4 text-gray-600 opacity-60">
                <Clock className="w-12 h-12" />
                <div className="text-lg font-medium">Select a task</div>
                <div className="text-sm">View details from a previous task in this session.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
