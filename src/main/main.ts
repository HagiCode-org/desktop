import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTray, destroyTray, setServerStatus, updateTrayMenu } from './tray.js';
import { HagicoServerClient, type ServerStatus } from './server.js';
import { ConfigManager } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let serverClient: HagicoServerClient | null = null;
let configManager: ConfigManager;
let statusPollingInterval: NodeJS.Timeout | null = null;

function createWindow(): void {
  console.log('[Hagico] Creating window...');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Log for debugging
  console.log('[Hagico] Window created');

  if (process.env.NODE_ENV === 'development') {
    console.log('[Hagico] Loading dev server at http://localhost:36598');
    mainWindow.loadURL('http://localhost:36598');
    mainWindow.webContents.openDevTools();
  } else {
    const htmlPath = path.join(__dirname, '../renderer/index.html');
    console.log('[Hagico] Loading production build from:', htmlPath);
    mainWindow.loadFile(htmlPath);
    // Also open DevTools in production for debugging
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    console.log('[Hagico] Window ready to show');
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Hagico] Page loaded successfully');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Hagico] Failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('close', (event) => {
    // Close to tray instead of quitting
    if (process.platform !== 'darwin') {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    console.log('[Hagico] Window closed');
    mainWindow = null;
  });
}

// IPC handlers
ipcMain.handle('app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-window', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.handle('hide-window', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.handle('get-server-status', async () => {
  if (!serverClient) {
    return 'stopped' as ServerStatus;
  }
  try {
    const info = await serverClient.getStatus();
    return info.status;
  } catch {
    return 'error' as ServerStatus;
  }
});

ipcMain.handle('start-server', async () => {
  if (!serverClient) {
    return false;
  }
  try {
    const result = await serverClient.startServer();
    if (result) {
      setServerStatus('running');
    }
    return result;
  } catch {
    return false;
  }
});

ipcMain.handle('stop-server', async () => {
  if (!serverClient) {
    return false;
  }
  try {
    const result = await serverClient.stopServer();
    if (result) {
      setServerStatus('stopped');
    }
    return result;
  } catch {
    return false;
  }
});

ipcMain.handle('get-config', () => {
  return configManager?.getAll() || null;
});

ipcMain.handle('set-config', (_, config) => {
  if (configManager) {
    const serverConfig = config.server;
    if (serverConfig) {
      configManager.setServerConfig(serverConfig);
      // Reinitialize server client with new config
      if (serverClient) {
        serverClient.updateConfig(serverConfig);
      }
    }
  }
});

function startStatusPolling(): void {
  if (statusPollingInterval) {
    clearInterval(statusPollingInterval);
  }

  statusPollingInterval = setInterval(async () => {
    if (!serverClient || !mainWindow) return;

    try {
      const info = await serverClient.getStatus();
      setServerStatus(info.status);
      mainWindow?.webContents.send('server-status-changed', info.status);
    } catch (error) {
      console.error('Failed to poll server status:', error);
    }
  }, 5000); // Poll every 5 seconds
}

app.whenReady().then(() => {
  configManager = new ConfigManager();
  const serverConfig = configManager.getServerConfig();
  serverClient = new HagicoServerClient(serverConfig);

  createWindow();
  createTray();
  setServerStatus('stopped');
  startStatusPolling();
});

app.on('window-all-closed', () => {
  // Don't quit on window close, keep running in tray
  if (process.platform === 'darwin') {
    // On macOS, keep app running but can quit
    app.quit();
  }
});

app.on('before-quit', () => {
  destroyTray();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

export { mainWindow };
