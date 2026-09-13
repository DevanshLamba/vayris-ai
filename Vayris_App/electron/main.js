const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

process.env.ELECTRON_ENV = 'true';

let mainWindow;
let serverInstance = null;

function createWindow() {
  // ── Microphone / Media Permission Grants ─────────────────────────
  // In dev mode (localhost via Vite), Chromium auto-grants media permissions.
  // In the packaged app, there is no stored permission and no user-facing
  // permission prompt in Electron, so Chromium silently denies getUserMedia()
  // and SpeechRecognition, causing the mic to appear to stop immediately.
  // These handlers auto-grant media permissions so voice works in production.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log(`[ELECTRON FORENSIC] Permission requested: ${permission}`);
    const allowed = ['media', 'audioCapture', 'microphone'].includes(permission);
    if (allowed) {
      console.log(`[ELECTRON FORENSIC] Auto-granting permission: ${permission}`);
    } else {
      console.log(`[ELECTRON FORENSIC] Denying permission: ${permission}`);
    }
    callback(allowed);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    console.log(`[ELECTRON FORENSIC] Permission check: ${permission}`);
    if (['media', 'audioCapture', 'microphone'].includes(permission)) {
      return true;
    }
    return true; // Allow all permission checks for our own app
  });

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });


  if (!app.isPackaged) {
    // In dev, assuming Vite runs on 5173
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow.loadURL('http://localhost:3000');
    });
  }
  // In packaged mode, we DON'T load anything yet - we wait for the backend
  // to start, then load from http://localhost:3000 so IndexedDB works
  // (vosk-browser's IDBFS requires a proper HTTP origin, not file://)
}

async function startBackendServer() {
  const userDataPath = app.getPath('userData');
  console.log('UserData Path:', userDataPath);
  
  try {
    const { startServer } = require('../dist/index.js');
    serverInstance = await startServer(userDataPath, app.getAppPath());
    console.log('Backend server started successfully.');
    currentStatus = { status: 'running', message: '' };
    // Load UI from localhost so IndexedDB/IDBFS works for vosk-browser
    if (mainWindow && app.isPackaged) {
      mainWindow.loadURL('http://localhost:3000');
    }
    if (mainWindow) {
      mainWindow.webContents.send('backend-status', currentStatus);
    }
  } catch (error) {
    console.error('Error starting backend:', error.message);
    if (error.message === 'NEEDS_LEGAL') {
      currentStatus = { status: 'needs_legal', message: '' };
      if (mainWindow) {
        mainWindow.webContents.send('backend-status', currentStatus);
      }
    } else if (error.message === 'NEEDS_SETUP' || error.message.startsWith('MISSING_MODELS')) {
      currentStatus = { status: 'needs_setup', message: error.message };
      if (mainWindow) {
        mainWindow.webContents.send('backend-status', currentStatus);
      }
    } else {
      currentStatus = { status: 'error', message: error.message };
      if (mainWindow) {
        mainWindow.webContents.send('backend-status', currentStatus);
      }
    }
  }
}

app.whenReady().then(async () => {
  createWindow();
  await startBackendServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Setup IPC
let currentStatus = { status: 'starting', message: '' };

ipcMain.handle('get-status', () => {
  return currentStatus;
});

ipcMain.handle('get-config', async () => {
  const configPath = path.join(app.getPath('userData'), '.env');
  if (fs.existsSync(configPath)) {
    return fs.readFileSync(configPath, 'utf8');
  }
  return '';
});

ipcMain.handle('save-config', async (event, envContent) => {
  const configPath = path.join(app.getPath('userData'), '.env');
  fs.writeFileSync(configPath, envContent, 'utf8');
  
  // Update process.env
  require('dotenv').config({ path: configPath, override: true });
  
  return true;
});

ipcMain.handle('restart-backend', async () => {
  if (serverInstance) {
    if (serverInstance.server) serverInstance.server.close();
    if (serverInstance.mcpManager) await serverInstance.mcpManager.disconnectAll();
    if (serverInstance.memoryStore) await serverInstance.memoryStore.close();
    if (serverInstance.vectorStore) await serverInstance.vectorStore.close();
  }
  await startBackendServer();
  return currentStatus;
});

const { shell } = require('electron');
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});
