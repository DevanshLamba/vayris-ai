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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center z-50 p-4">
      <div className="glass-strong rounded-2xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex-shrink-0 p-6 border-b border-gray-800 bg-gray-900/50 flex flex-col space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                <HardDrive className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-wide">Long-term Memory</h2>
                <p className="text-sm text-gray-400">Persistent user-approved information across sessions.</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-xl transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search persistent memories..."
                className="w-full bg-black border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-gray-600"
              />
            </div>
            <button 
              onClick={clearMemory}
              disabled={memories.length === 0}
              className="px-4 py-3 bg-red-950/30 hover:bg-red-900/40 text-red-400 border border-red-900/30 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear All</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-black custom-scrollbar relative">
          
          <div className="absolute top-4 right-6 text-[10px] uppercase font-bold tracking-widest text-gray-600 bg-gray-900/50 px-3 py-1 rounded-full border border-gray-800">
            Storage: SQLite Local
          </div>

          {loading ? (
            <div className="h-full flex items-center justify-center space-x-3 text-gray-500">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium tracking-wide">Retrieving records...</span>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4 text-red-400">
              <AlertCircle className="w-10 h-10 opacity-50" />
              <div className="text-sm">{error}</div>
            </div>
          ) : memories.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4 text-gray-600 opacity-60">
              <HardDrive className="w-12 h-12 mb-2" />
              <div className="text-lg font-medium text-gray-400">Memory Empty</div>
              <div className="text-sm">Vayris has not saved any permanent context yet.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
              {memories.map(memory => (
                <div key={memory.id} className="bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors rounded-xl p-5 flex flex-col group shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Tag className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{memory.category}</span>
                    </div>
                    <button 
                      onClick={() => deleteMemory(memory.id)}
                      className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1 -m-1"
                      title="Forget memory"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-sm text-gray-200 leading-relaxed font-medium mb-4 flex-1">
                    {memory.content}
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] text-gray-600 font-mono mt-auto pt-4 border-t border-gray-800">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(memory.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-800 bg-gray-900/50 flex justify-end flex-shrink-0">
          <button 
            onClick={clearMemory}
            disabled={memories.length === 0 || loading}
            className="flex items-center space-x-2 px-4 py-2 bg-red-600/10 text-red-500 hover:bg-red-600/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear All Memories</span>
          </button>
        </div>
      </div>
    </div>
  );
};
