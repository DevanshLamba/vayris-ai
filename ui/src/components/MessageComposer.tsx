/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import React, { useRef, useEffect, useState } from 'react';
import { Mic, Send, Square, Image as ImageIcon, X } from 'lucide-react';

export interface ImageAttachment {
  mimeType: string;
  data: string;
  previewUrl: string;
}

export const MessageComposer: React.FC<{
  input: string;
  setInput: (v: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  isProcessing: boolean;
  isCancelling?: boolean;
  isSpeaking: boolean;
  toggleVoice: () => void;
  image: ImageAttachment | null;
  setImage: (img: ImageAttachment | null) => void;
  mode?: 'AUTO' | 'FAST' | 'DEEP';
  setMode?: (mode: 'AUTO' | 'FAST' | 'DEEP') => void;
}> = ({ input, setInput, onSubmit, onCancel, isProcessing, isCancelling = false, isSpeaking, toggleVoice, image, setImage, mode = 'AUTO', setMode }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() || image) onSubmit();
    } else if (e.key === 'Escape') {
      if (isProcessing && onCancel) {
        e.preventDefault();
        onCancel();
      } else {
        textareaRef.current?.blur();
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Only images are supported.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      setError('Image is too large (max 5MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const base64Data = result.split(',')[1];
      setImage({
        mimeType: file.type,
        data: base64Data,
        previewUrl: result
      });
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsDataURL(file);
    
    // reset input
    e.target.value = '';
  };

  return (
    <div className="w-full relative flex flex-col items-center">
      
      {error && (
        <div className="mb-2 px-4 py-1 bg-red-900/30 text-red-300 text-xs tracking-wider uppercase rounded-full border border-red-800/50 backdrop-blur-md">
          {error}
        </div>
      )}

      {image && (
        <div className="mb-4 relative group rounded-2xl border border-white/10 bg-black/50 overflow-hidden w-24 h-24 flex-shrink-0 animate-in fade-in zoom-in slide-in-from-bottom-2 backdrop-blur-md">
          <img src={image.previewUrl} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" alt="Attachment" />
          <button 
            type="button"
            onClick={() => setImage(null)}
            className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}

      <div className="relative group w-full max-w-xl flex items-center transition-all duration-500 ease-out">
        
        {/* Sleek Input Container */}
        <div className="flex-1 flex items-center bg-[#2a0e4a]/40 backdrop-blur-2xl border border-purple-400/30 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.2)] focus-within:bg-[#34115c]/50 focus-within:border-purple-400/70 focus-within:shadow-[0_8px_30px_rgba(168,85,247,0.4)] focus-within:-translate-y-1 transition-all duration-300 overflow-hidden pl-2 pr-2 py-1">
          
          {setMode && (
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'AUTO' | 'FAST' | 'DEEP')}
              className="bg-transparent text-white/50 hover:text-white border-0 text-xs font-mono tracking-widest cursor-pointer px-2 outline-none appearance-none transition-all ml-2"
              title="Execution Mode"
            >
              <option value="AUTO">AUTO</option>
              <option value="FAST">FAST</option>
              <option value="DEEP">DEEP</option>
            </select>
          )}

          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
          >
            {/* Using a Plus icon as in the reference, instead of ImageIcon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/png, image/jpeg, image/webp" 
            className="hidden" 
          />
          
          <textarea 
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything"
            className="flex-1 max-h-32 bg-transparent text-white font-light tracking-wide px-3 py-2.5 resize-none focus:outline-none placeholder-white/50 text-[15px] leading-relaxed self-center flex items-center"
            rows={1}
            disabled={isProcessing && !input}
          />
          
          <div className="p-1 flex-shrink-0">
            {isProcessing ? (
              <button 
                type="button"
                onClick={onCancel}
                disabled={isCancelling}
                title={isCancelling ? 'Stopping...' : 'Stop'}
                className={`p-3 rounded-full transition-all border ${isCancelling ? 'bg-red-900/20 text-red-700 border-red-900/30 cursor-not-allowed opacity-50' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/30'}`}
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (!input.trim() && !image) ? (
              <button 
                type="button" 
                onClick={toggleVoice}
                className={`p-3 rounded-full transition-all flex-shrink-0 ${
                  isSpeaking 
                    ? 'bg-red-500/20 text-red-400 animate-pulse' 
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <Mic className="w-5 h-5 stroke-[1.5px]" />
              </button>
            ) : (
              <button 
                type="button"
                onClick={onSubmit}
                className="p-3 bg-purple-500/20 text-purple-300 rounded-full hover:bg-purple-500/40 hover:text-white transition-all border border-purple-400/30"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
