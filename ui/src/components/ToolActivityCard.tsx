import React, { useState } from 'react';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, AlertCircle, FileText, Globe, Code, Box, Server, Folder, Image as ImageIcon } from 'lucide-react';

export const ToolActivityCard: React.FC<{
  toolName: string;
  status: 'running' | 'success' | 'failed' | 'denied';
  args?: any;
  result?: any;
  error?: string;
}> = ({ toolName, status, args, result, error }) => {
  const [expanded, setExpanded] = useState(false);

  // Map tools to friendly names and icons
  let icon = <Box className="w-4 h-4" />;
  let category = 'System';
  let action = toolName;
  
  if (toolName.startsWith('browser_')) { icon = <Globe className="w-4 h-4" />; category = 'Browser'; action = toolName.replace('browser_', ''); }
  else if (toolName.startsWith('git_') || toolName === 'run_tests' || toolName === 'run_build') { icon = <Code className="w-4 h-4" />; category = 'Developer'; action = toolName; }
  else if (['read_file', 'write_file', 'list_directory', 'search_files', 'delete_file'].includes(toolName)) { icon = <Folder className="w-4 h-4" />; category = 'Filesystem'; action = toolName.replace('_', ' '); }
  else if (['system_info', 'system_time', 'open_application'].includes(toolName)) { icon = <Server className="w-4 h-4" />; category = 'System'; action = toolName.replace('_', ' '); }
  else if (['capture_screen', 'analyze_image'].includes(toolName)) { icon = <ImageIcon className="w-4 h-4" />; category = 'Vision'; action = toolName.replace('_', ' '); }
  else if (['save_memory', 'search_memory'].includes(toolName)) { icon = <FileText className="w-4 h-4" />; category = 'Memory'; action = toolName.replace('_', ' '); }

  const formatActionName = (str: string) => str.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  let statusText = 'Running';
  if (status === 'success') statusText = 'Completed';
  if (status === 'failed') statusText = 'Failed';
  if (status === 'denied') statusText = 'Denied';

  return (
    <div className="bg-black/20 border border-white/5 rounded-xl overflow-hidden shadow-sm transition-all hover:bg-black/30 w-full mb-3 backdrop-blur-sm">
      <div 
        className="p-3 px-4 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center space-x-3 w-full">
          <div className="flex-shrink-0">
            {status === 'running' && <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />}
            {status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
            {status === 'denied' && <AlertCircle className="w-4 h-4 text-amber-500" />}
          </div>
          
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <span className="text-white/40">{icon}</span>
              <span className="text-[9px] font-mono uppercase tracking-widest text-white/40">{category}</span>
            </div>
            <span className="font-light text-[13px] text-white/80 capitalize truncate tracking-wide">{formatActionName(action)}</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-3 flex-shrink-0 pl-2">
          <span className={`text-[9px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-full border ${
            status === 'running' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
            status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
            'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            {statusText}
          </span>
          <div className="text-white/30">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>
      
      {expanded && (
        <div className="p-4 bg-black/40 border-t border-white/5 text-xs font-mono text-white/50 overflow-x-auto space-y-3">
          {args && (
            <div>
              <div className="text-[9px] text-white/30 uppercase tracking-widest mb-1 font-mono font-bold">Arguments</div>
              <div className="bg-black/60 p-2 rounded-lg border border-white/5 break-all">{JSON.stringify(args, null, 2)}</div>
            </div>
          )}
          {result && (
            <div>
              <div className="text-[9px] text-white/30 uppercase tracking-widest mb-1 font-mono font-bold">Result</div>
              <div className="bg-black/60 p-2 rounded-lg border border-white/5 break-all">
                {result._isImage ? result.message || '[Image Data]' : JSON.stringify(result, null, 2)}
              </div>
            </div>
          )}
          {error && (
            <div>
              <div className="text-[9px] text-red-500/50 uppercase tracking-widest mb-1 font-mono font-bold">Error</div>
              <div className="bg-red-950/20 text-red-400 p-2 rounded-lg border border-red-900/30 break-all">{error}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
