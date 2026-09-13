import React, { useState } from 'react';
import { motion } from 'framer-motion';

export function LegalModal({ onComplete, error }: { onComplete: () => void, error?: string }) {
  const [accepted, setAccepted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localError, setLocalError] = useState('');

  const displayError = error || localError;

  const handleOpenLink = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    if ((window as any).electronAPI) {
      (window as any).electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const handleAccept = async () => {
    setIsSaving(true);
    setLocalError('');
    try {
      if ((window as any).electronAPI) {
        // Read current config to avoid overwriting existing properties if any
        const currentConfig = await (window as any).electronAPI.getConfig();
        const updatedConfig = currentConfig + '\nVAYRIS_TERMS_ACCEPTED=true\n';
        
        await (window as any).electronAPI.saveConfig(updatedConfig.trim());
        const status = await (window as any).electronAPI.restartBackend();
        
        // As long as it is not an actual error, we consider the legal phase completed.
        // It might be 'needs_setup' or 'running', both mean legal check passed.
        if (status && status.status === 'error') {
          throw new Error(status.message || 'Failed to start backend.');
        }
        
        onComplete();
      } else {
        setLocalError('Electron API not found. Please run Vayris from the desktop shortcut.');
      }
    } catch (e: any) {
      setLocalError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-strong rounded-2xl w-full max-w-lg overflow-hidden border border-white/10 p-6 flex flex-col gap-6 text-white text-center"
      >
        <div className="flex flex-col items-center gap-2">
          {/* Using a placeholder SVG or existing logo icon */}
          <div className="w-48 h-auto flex items-center justify-center mb-2 overflow-hidden">
            <img src="./logo-transparent.png" alt="Vayris Logo" className="w-full h-full object-contain" />
          </div>
          <h2 className="text-2xl font-light tracking-wide">Welcome to Vayris</h2>
        </div>

        <p className="text-sm text-white/60">
          Before using Vayris, please review our Terms & Conditions and Privacy Policy.
        </p>
        
        {displayError && <div className="text-red-400 text-sm p-2 bg-red-400/10 rounded">{displayError}</div>}

        <div className="flex flex-col gap-3 items-center">
          <a 
            href="#" 
            onClick={(e) => handleOpenLink(e, 'https://example.com/terms-required')}
            className="text-indigo-400 hover:text-indigo-300 text-sm underline transition-colors"
          >
            Terms & Conditions
          </a>
          <a 
            href="#" 
            onClick={(e) => handleOpenLink(e, 'https://example.com/privacy-required')}
            className="text-indigo-400 hover:text-indigo-300 text-sm underline transition-colors"
          >
            Privacy Policy
          </a>
        </div>

        <div className="flex items-center justify-center gap-3 mt-2">
          <input 
            type="checkbox" 
            id="terms-checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="w-4 h-4 bg-black/40 border border-white/20 rounded accent-indigo-500 cursor-pointer"
          />
          <label htmlFor="terms-checkbox" className="text-sm text-white/80 cursor-pointer select-none">
            I agree to the Terms & Conditions and Privacy Policy
          </label>
        </div>

        <div className="mt-4">
          <button
            onClick={handleAccept}
            disabled={!accepted || isSaving}
            className="w-full py-3 bg-indigo-500/80 hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Processing...' : 'Accept & Continue'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
