import React, { useState } from 'react';
import { motion } from 'framer-motion';

export function SetupModal({ onComplete }: { onComplete: () => void }) {
  const [provider, setProvider] = useState('openai-compatible');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434/v1');
  const [apiKey, setApiKey] = useState('ollama');
  const [fastModel, setFastModel] = useState('llama3.2');
  const [deepModel, setDeepModel] = useState('qwen2.5-coder:7b');
  
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    const envContent = `
VAYRIS_PROVIDER=${provider}
VAYRIS_API_KEY=${apiKey}
VAYRIS_BASE_URL=${baseUrl}
FAST_MODEL=${fastModel}
DEEP_MODEL=${deepModel}
RAG_EMBEDDING_MODEL=nomic-embed-text
    `.trim();

    try {
      if ((window as any).electronAPI) {
        await (window as any).electronAPI.saveConfig(envContent);
        const status = await (window as any).electronAPI.restartBackend();
        if (status && status.status !== 'running') {
          throw new Error(status.message || 'Failed to start backend with this configuration.');
        }
        onComplete();
      } else {
        // Fallback for non-electron environment (shouldn't happen in packaged app)
        setError('Electron API not found. Please run Vayris from the desktop shortcut.');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-strong rounded-2xl w-full max-w-lg overflow-hidden border border-white/10 p-6 flex flex-col gap-4 text-white"
      >
        <h2 className="text-xl font-light">First-Run Setup</h2>
        <p className="text-sm text-white/60">Configure your AI provider to get started. You can use a local model like Ollama (recommended for privacy) or a cloud provider.</p>
        
        {error && <div className="text-red-400 text-sm p-2 bg-red-400/10 rounded">{error}</div>}

        <div className="flex flex-col gap-2">
          <label className="text-xs text-white/50 uppercase tracking-wider">Provider</label>
          <select value={provider} onChange={e => setProvider(e.target.value)} className="bg-black/40 border border-white/10 rounded p-2 outline-none">
            <option value="openai-compatible">Local Model (Ollama / LM Studio)</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>

        {provider === 'openai-compatible' && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-white/50 uppercase tracking-wider">Base URL (e.g. Ollama)</label>
            <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className="bg-black/40 border border-white/10 rounded p-2 outline-none" />
          </div>
        )}

        {provider === 'gemini' && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-white/50 uppercase tracking-wider">API Key</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="bg-black/40 border border-white/10 rounded p-2 outline-none" placeholder="AI Studio Key" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-white/50 uppercase tracking-wider">Fast Model</label>
            <input type="text" value={fastModel} onChange={e => setFastModel(e.target.value)} className="bg-black/40 border border-white/10 rounded p-2 outline-none" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-white/50 uppercase tracking-wider">Deep Model</label>
            <input type="text" value={deepModel} onChange={e => setDeepModel(e.target.value)} className="bg-black/40 border border-white/10 rounded p-2 outline-none" />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-indigo-500/80 hover:bg-indigo-500 text-white rounded transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save & Start'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
