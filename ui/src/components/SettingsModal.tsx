/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import React, { useEffect, useState } from 'react';
import { X, Save, Key, Globe, Cpu, Folder, Volume2, Mic, Settings2 } from 'lucide-react';

export const SettingsModal: React.FC<{ onClose: () => void, voice: any }> = ({ onClose, voice }) => {
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    fetch('http://localhost:3000/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(() => setConfig({ provider: 'Error', model: 'Error' }));
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="glass-strong rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-start p-6 border-b border-gray-800 bg-gray-900/50 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center text-gray-300 border border-gray-700">
              <Settings2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">System Settings</h2>
              <p className="text-sm text-gray-400">Configure Vayris and local environment.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-10 overflow-y-auto custom-scrollbar">
          {!config ? (
            <div className="flex items-center justify-center py-10 space-x-3 text-gray-500">
              <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm tracking-wide">Loading configuration...</span>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  <span>Your Brain</span>
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start space-x-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <Cpu className="w-5 h-5 text-indigo-400 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Provider</div>
                      <div className="text-sm font-medium text-gray-200 truncate">{config.provider}</div>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <Globe className="w-5 h-5 text-indigo-400 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Model</div>
                      <div className="text-sm font-medium text-gray-200 truncate">{config.model}</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-start space-x-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <Key className="w-5 h-5 text-gray-600 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">API Key</div>
                    <div className="text-sm font-medium text-gray-400 font-mono">••••••••••••••••••••••••••••••••</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Local Environment</span>
                </h3>
                <div className="flex items-start space-x-3 bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <Folder className="w-5 h-5 text-emerald-400 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Workspace Root</div>
                    <div className="text-sm font-medium text-gray-200 font-mono break-all">{config.workspace}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                  <span>Voice Integration</span>
                </h3>
                
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Mic className="w-5 h-5 text-cyan-400" />
                      <div>
                        <div className="text-sm font-bold text-gray-200">Speech Recognition</div>
                        <div className="text-xs text-gray-500 mt-1">Accept voice input</div>
                      </div>
                    </div>
                    <button
                      onClick={() => voice.saveConfig({ ...voice.config, voiceEnabled: !voice.config.voiceEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${voice.config.voiceEnabled ? 'bg-cyan-500' : 'bg-gray-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${voice.config.voiceEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="border-t border-gray-800/80 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <Volume2 className="w-5 h-5 text-cyan-400" />
                        <div className="text-sm font-bold text-gray-200">Speech Rate</div>
                      </div>
                      <span className="text-xs font-mono text-gray-400 px-2 py-1 bg-black rounded">{voice.config.rate}x</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.5" max="2" step="0.1" 
                      value={voice.config.rate}
                      onChange={(e) => voice.saveConfig({ ...voice.config, rate: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-500 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Copyright Attribution */}
          <div className="mt-8 pt-6 border-t border-gray-800/80 text-center space-y-1">
            <div className="text-sm font-semibold text-gray-300">Vayris</div>
            <div className="text-xs text-gray-500">Copyright © 2026 Devansh Lamba</div>
            <div className="text-xs text-gray-600">Licensed under Apache License 2.0</div>
          </div>
        </div>
      </div>
    </div>
  );
};
