import React, { useEffect, useRef } from 'react';
import { ShieldAlert, Terminal, Globe, Code } from 'lucide-react';

interface PermissionModalProps {
  toolName: string;
  args: any;
  onRespond: (allowed: boolean, data: any) => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({ toolName, args, onRespond }) => {
  const denyRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    denyRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRespond(false, null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRespond]);

  const getRiskLevel = () => {
    if (toolName.includes('delete') || toolName.includes('write')) return { level: 'HIGH IMPACT', color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20' };
    if (toolName.includes('capture') || toolName.includes('run_')) return { level: 'MODERATE', color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' };
    return { level: 'LOW RISK', color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/20' };
  };
  const risk = getRiskLevel();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="glass-strong rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${risk.bg} ${risk.color}`}>
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-wide">Approval Required</h2>
                <div className={`text-[10px] uppercase font-bold tracking-widest mt-1 ${risk.color}`}>{risk.level}</div>
              </div>
            </div>
          </div>
          
          <p className="text-gray-300 text-sm mb-6 leading-relaxed">
            {toolName === 'capture_screen' 
              ? 'VAYRIS wants to capture your screen. The resulting image will be sent to your configured model provider for visual analysis.'
              : 'Vayris wants to execute a sensitive operation on your local environment.'}
          </p>

          <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 mb-6 shadow-inner">
            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1 font-sans">Action</div>
            <div className="text-sm font-mono text-gray-200 mb-4 bg-gray-900 px-3 py-2 rounded">{toolName}</div>
            
            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1 font-sans">Arguments</div>
            <div className="text-xs font-mono text-gray-400 break-all bg-black p-3 rounded border border-gray-900 overflow-y-auto max-h-40 custom-scrollbar">
              {JSON.stringify(args, null, 2)}
            </div>
          </div>

          <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3 justify-end">
            <button
              ref={denyRef}
              onClick={() => onRespond(false, null)}
              className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-semibold transition-colors focus:ring-2 focus:ring-gray-500 outline-none w-full sm:w-auto"
            >
              {toolName === 'capture_screen' ? 'Cancel' : 'Deny Action'}
            </button>
            <button
              onClick={async () => {
                if (toolName === 'capture_screen') {
                  try {
                    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                    const track = stream.getVideoTracks()[0];
                    const imageCapture = new (window as any).ImageCapture(track);
                    const bitmap = await imageCapture.grabFrame();
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = bitmap.width;
                    canvas.height = bitmap.height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(bitmap, 0, 0);
                    
                    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                    track.stop();
                    
                    onRespond(true, { image: base64, mimeType: 'image/jpeg', alwaysAllowSession: true });
                  } catch (e) {
                    onRespond(false, null);
                  }
                } else {
                  onRespond(true, { alwaysAllowSession: true });
                }
              }}
              className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-semibold transition-colors focus:ring-2 focus:ring-gray-500 outline-none w-full sm:w-auto"
            >
              Always Allow (Session)
            </button>
            <button
              onClick={async () => {
                if (toolName === 'capture_screen') {
                  try {
                    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                    const track = stream.getVideoTracks()[0];
                    const imageCapture = new (window as any).ImageCapture(track);
                    const bitmap = await imageCapture.grabFrame();
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = bitmap.width;
                    canvas.height = bitmap.height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(bitmap, 0, 0);
                    
                    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                    track.stop();
                    
                    onRespond(true, { image: base64, mimeType: 'image/jpeg' });
                  } catch (e) {
                    onRespond(false, null);
                  }
                } else {
                  onRespond(true, null);
                }
              }}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-auto shadow-lg shadow-indigo-900/50"
            >
              Allow Once
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
