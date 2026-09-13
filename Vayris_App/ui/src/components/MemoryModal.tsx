/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import React, { useEffect, useState } from 'react';
import { X, HardDrive, Trash2, Search, Calendar, Tag, AlertCircle } from 'lucide-react';

export const MemoryModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchMemories = (query: string = '') => {
    setLoading(true);
    setError(null);
    fetch(`http://localhost:3000/api/memory?q=${encodeURIComponent(query)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch memories');
        return res.json();
      })
      .then(data => {
        setMemories(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchMemories(searchQuery);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const deleteMemory = (id: string) => {
    fetch(`http://localhost:3000/api/memory/${id}`, { method: 'DELETE' })
      .then(res => {
        if (res.ok) {
          setMemories(prev => prev.filter(m => m.id !== id));
        }
      });
  };

  const clearMemory = () => {
    if (confirm('Are you sure you want to clear all long-term memory? This cannot be undone.')) {
      fetch('http://localhost:3000/api/memory', { method: 'DELETE' })
        .then(res => {
          if (res.ok) setMemories([]);
        });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111] border border-white/10 rounded-3xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex-shrink-0 p-6 border-b border-white/5 bg-black/40 flex flex-col space-y-5">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white border border-white/10">
                <HardDrive className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-medium text-white tracking-wide">Long-term Memory</h2>
                <p className="text-sm text-white/50 font-light mt-0.5">Persistent user-approved information across sessions.</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2.5 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search persistent memories..."
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-sm text-white focus:outline-none focus:border-white/30 transition-all placeholder-white/30"
              />
            </div>
            <button 
              onClick={clearMemory}
              disabled={memories.length === 0}
              className="px-5 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-2xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear All</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0a0a0a] custom-scrollbar relative">
          
          <div className="absolute top-4 right-6 text-[10px] uppercase font-bold tracking-widest text-white/30 bg-black/40 px-3 py-1 rounded-full border border-white/5">
            Storage: SQLite Local
          </div>

          {loading ? (
            <div className="h-full flex items-center justify-center space-x-3 text-white/50">
              <div className="w-4 h-4 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium tracking-wide">Retrieving records...</span>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4 text-red-400">
              <AlertCircle className="w-10 h-10 opacity-50" />
              <div className="text-sm">{error}</div>
            </div>
          ) : memories.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4 text-white/30">
              <HardDrive className="w-12 h-12 mb-2 opacity-50" />
              <div className="text-lg font-medium text-white/50">Memory Empty</div>
              <div className="text-sm font-light">Vayris has not saved any permanent context yet.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
              {memories.map(memory => (
                <div key={memory.id} className="bg-[#111] border border-white/5 hover:border-white/10 transition-colors rounded-2xl p-5 flex flex-col group shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Tag className="w-3.5 h-3.5 text-white/40" />
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{memory.category}</span>
                    </div>
                    <button 
                      onClick={() => deleteMemory(memory.id)}
                      className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1 -m-1"
                      title="Forget memory"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-[14px] text-white/80 leading-relaxed font-light mb-4 flex-1">
                    {memory.content}
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] text-white/30 font-mono mt-auto pt-4 border-t border-white/5">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(memory.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
