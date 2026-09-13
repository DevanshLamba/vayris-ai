const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (envContent) => ipcRenderer.invoke('save-config', envContent),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onBackendStatus: (callback) => {
    ipcRenderer.on('backend-status', (event, data) => callback(data));
  }
});
