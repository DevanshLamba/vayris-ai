/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import React, { useEffect, useState } from 'react';
import { X, ShieldAlert, ShieldCheck, Shield } from 'lucide-react';

export const CapabilitiesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tools, setTools] = useState<any[]>([]);

  useEffect(() => {
    fetch('http://localhost:3000/api/tools')
      .then(res => res.json())
      .then(data => setTools(data))
      .catch(() => setTools([]));
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center z-50 p-4">
      <div className="glass-strong rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-gray-800 flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">System Capabilities</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {tools.length === 0 ? (
            <div className="text-gray-500 animate-pulse text-center py-12">Loading capabilities...</div>
          ) : (
            <div className="space-y-4">
              {tools.map((tool, i) => (
                <div key={i} className="flex items-start space-x-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <div className="mt-1">
                    {tool.permissionLevel === 'safe' ? (
                      <ShieldCheck className="w-5 h-5 text-emerald-500" title="Safe" />
                    ) : tool.permissionLevel === 'confirm' ? (
                      <ShieldAlert className="w-5 h-5 text-amber-500" title="Requires Confirmation" />
                    ) : (
                      <Shield className="w-5 h-5 text-red-500" title="Restricted" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-1">
                      <span className="text-sm font-bold text-gray-200 tracking-wide">{tool.name}</span>
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                        {tool.permissionLevel}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{tool.description}</p>
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
