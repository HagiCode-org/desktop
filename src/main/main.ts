import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Store from 'electron-store';
import { createTray, destroyTray, setServerStatus, updateTrayMenu } from './tray.js';
import { HagicoServerClient, type ServerStatus } from './server.js';
import { ConfigManager } from './config.js';
import { PCodeWebServiceManager, type ProcessInfo, type WebServiceConfig } from './web-service-manager.js';
import { PCodePackageManager, type PackageInfo, type InstallProgress } from './package-manager.js';
import { DependencyManager, type DependencyCheckResult, DependencyType } from './dependency-manager.js';
import { MenuManager } from './menu-manager.js';
import { NpmMirrorHelper } from './npm-mirror-helper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let serverClient: HagicoServerClient | null = null;
let configManager: ConfigManager;
let statusPollingInterval: NodeJS.Timeout | null = null;
let webServiceManager: PCodeWebServiceManager | null = null;
let packageManager: PCodePackageManager | null = null;
let dependencyManager: DependencyManager | null = null;
let webServicePollingInterval: NodeJS.Timeout | null = null;
let menuManager: MenuManager | null = null;
let npmMirrorHelper: NpmMirrorHelper | null = null;

function createWindow(): void {
  console.log('[Hagico] Creating window...');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Set global reference for IPC communication
  (global as any).mainWindow = mainWindow;

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

// Web Service Management IPC Handlers
ipcMain.handle('get-web-service-status', async () => {
  if (!webServiceManager) {
    return {
      status: 'stopped',
      pid: null,
      uptime: 0,
      startTime: null,
      url: null,
      restartCount: 0,
    } as ProcessInfo;
  }
  try {
    return await webServiceManager.getStatus();
  } catch (error) {
    console.error('Failed to get web service status:', error);
    return {
      status: 'error',
      pid: null,
      uptime: 0,
      startTime: null,
      url: null,
      restartCount: 0,
    } as ProcessInfo;
  }
});

ipcMain.handle('start-web-service', async () => {
  if (!webServiceManager) {
    return false;
  }
  try {
    const result = await webServiceManager.start();
    // Notify renderer of status change
    const status = await webServiceManager.getStatus();
    mainWindow?.webContents.send('web-service-status-changed', status);
    return result;
  } catch (error) {
    console.error('Failed to start web service:', error);
    return false;
  }
});

ipcMain.handle('stop-web-service', async () => {
  if (!webServiceManager) {
    return false;
  }
  try {
    const result = await webServiceManager.stop();
    // Notify renderer of status change
    const status = await webServiceManager.getStatus();
    mainWindow?.webContents.send('web-service-status-changed', status);
    return result;
  } catch (error) {
    console.error('Failed to stop web service:', error);
    return false;
  }
});

ipcMain.handle('restart-web-service', async () => {
  if (!webServiceManager) {
    return false;
  }
  try {
    const result = await webServiceManager.restart();
    // Notify renderer of status change
    const status = await webServiceManager.getStatus();
    mainWindow?.webContents.send('web-service-status-changed', status);
    return result;
  } catch (error) {
    console.error('Failed to restart web service:', error);
    return false;
  }
});

ipcMain.handle('get-web-service-version', async () => {
  if (!webServiceManager) {
    return 'unknown';
  }
  try {
    return await webServiceManager.getVersion();
  } catch (error) {
    console.error('Failed to get web service version:', error);
    return 'unknown';
  }
});

ipcMain.handle('get-web-service-url', async () => {
  if (!webServiceManager) {
    return null;
  }
  try {
    const status = await webServiceManager.getStatus();
    return status.url;
  } catch (error) {
    console.error('Failed to get web service URL:', error);
    return null;
  }
});

// Package Management IPC Handlers
ipcMain.handle('check-package-installation', async () => {
  if (!packageManager) {
    return {
      version: 'none',
      platform: 'unknown',
      installedPath: '',
      isInstalled: false,
    } as PackageInfo;
  }
  try {
    return await packageManager.checkInstalled();
  } catch (error) {
    console.error('Failed to check package installation:', error);
    return {
      version: 'none',
      platform: 'unknown',
      installedPath: '',
      isInstalled: false,
    } as PackageInfo;
  }
});

ipcMain.handle('install-web-service-package', async (_, packageFilename: string) => {
  if (!packageManager || !mainWindow) {
    return false;
  }
  try {
    const result = await packageManager.installPackage(
      packageFilename,
      (progress: InstallProgress) => {
        mainWindow?.webContents.send('package-install-progress', progress);
      }
    );
    return result;
  } catch (error) {
    console.error('Failed to install package:', error);
    return false;
  }
});

ipcMain.handle('get-package-version', async () => {
  if (!packageManager) {
    return 'none';
  }
  try {
    return await packageManager.getInstalledVersion();
  } catch (error) {
    console.error('Failed to get package version:', error);
    return 'none';
  }
});

ipcMain.handle('get-available-versions', async () => {
  if (!packageManager) {
    return [];
  }
  try {
    return await packageManager.getAvailableVersions();
  } catch (error) {
    console.error('Failed to get available versions:', error);
    return [];
  }
});

ipcMain.handle('get-platform', async () => {
  if (!packageManager) {
    return 'unknown';
  }
  return packageManager.getPlatform();
});

// Web Service Port Status Check
ipcMain.handle('check-web-service-port', async () => {
  if (!webServiceManager) {
    return {
      port: 5000,
      available: false,
      error: 'Web service manager not initialized'
    };
  }
  try {
    const available = await webServiceManager.checkPortAvailable();
    // Get the current port from the manager
    const status = await webServiceManager.getStatus();
    const port = status.url ? parseInt(status.url.split(':').pop() || '5000') : 5000;
    return {
      port,
      available,
      error: null
    };
  } catch (error) {
    console.error('Failed to check port:', error);
    return {
      port: 5000,
      available: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Web Service Config Update
ipcMain.handle('set-web-service-config', async (_, config: Partial<WebServiceConfig>) => {
  if (!webServiceManager) {
    return { success: false, error: 'Web service manager not initialized' };
  }
  try {
    await webServiceManager.updateConfig(config);
    return { success: true, error: null };
  } catch (error) {
    console.error('Failed to update web service config:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Dependency Management IPC Handlers
ipcMain.handle('check-dependencies', async () => {
  if (!dependencyManager) {
    return [];
  }
  try {
    return await dependencyManager.checkAllDependencies();
  } catch (error) {
    console.error('Failed to check dependencies:', error);
    return [];
  }
});

ipcMain.handle('install-dependency', async (_, dependencyType: DependencyType) => {
  if (!dependencyManager) {
    return false;
  }
  try {
    const result = await dependencyManager.installDependency(dependencyType);
    // Notify renderer of dependency status change
    const dependencies = await dependencyManager.checkAllDependencies();
    mainWindow?.webContents.send('dependency-status-changed', dependencies);
    return result;
  } catch (error) {
    console.error('Failed to install dependency:', error);
    return false;
  }
});

// View Management IPC Handlers
ipcMain.handle('switch-view', async (_, view: 'system' | 'web') => {
  console.log('[Main] Switch view requested:', view);

  if (view === 'web') {
    // Check if web service is running
    if (!webServiceManager) {
      return {
        success: false,
        reason: 'web-service-not-initialized',
      };
    }

    try {
      const status = await webServiceManager.getStatus();
      if (status.status !== 'running') {
        return {
          success: false,
          reason: 'web-service-not-running',
          canStart: true,
        };
      }

      // Web service is running, allow the switch
      return {
        success: true,
        url: status.url,
      };
    } catch (error) {
      console.error('[Main] Failed to check web service status:', error);
      return {
        success: false,
        reason: 'web-service-check-failed',
      };
    }
  }

  // Switching to system view is always allowed
  return {
    success: true,
  };
});

ipcMain.handle('get-current-view', async () => {
  // This could be persisted in electron-store in the future
  // For now, return the default
  return 'system';
});

// Language change handler
ipcMain.handle('language-changed', async (_, language: string) => {
  if (menuManager) {
    menuManager.updateMenuLanguage(language);
  }
});

// NPM Mirror Status IPC Handlers
ipcMain.handle('mirror:get-status', async () => {
  if (!npmMirrorHelper) {
    return {
      region: null,
      mirrorUrl: '',
      mirrorName: '',
      detectedAt: null,
    };
  }
  try {
    const status = npmMirrorHelper.getMirrorStatus();
    return {
      ...status,
      detectedAt: status.detectedAt?.toISOString() || null,
    };
  } catch (error) {
    console.error('[Main] Failed to get mirror status:', error);
    return {
      region: null,
      mirrorUrl: '',
      mirrorName: '',
      detectedAt: null,
    };
  }
});

ipcMain.handle('mirror:redetect', async () => {
  if (!npmMirrorHelper) {
    return {
      region: null,
      mirrorUrl: '',
      mirrorName: '',
      detectedAt: null,
    };
  }
  try {
    const detection = npmMirrorHelper.redetect();
    const status = npmMirrorHelper.getMirrorStatus();
    console.log(`[Main] Region re-detected: ${detection.region}`);
    return {
      ...status,
      detectedAt: status.detectedAt?.toISOString() || null,
    };
  } catch (error) {
    console.error('[Main] Failed to re-detect region:', error);
    return {
      region: null,
      mirrorUrl: '',
      mirrorName: '',
      detectedAt: null,
    };
  }
});

// Web service status change handler for menu updates
ipcMain.on('web-service-status-for-menu', async (_event, status: ProcessInfo) => {
  if (menuManager) {
    menuManager.updateWebServiceStatus(status.status === 'running');
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

function startWebServiceStatusPolling(): void {
  if (webServicePollingInterval) {
    clearInterval(webServicePollingInterval);
  }

  webServicePollingInterval = setInterval(async () => {
    if (!webServiceManager || !mainWindow) return;

    try {
      const status = await webServiceManager.getStatus();
      mainWindow?.webContents.send('web-service-status-changed', status);

      // Update menu based on web service status
      if (menuManager) {
        menuManager.updateWebServiceStatus(status.status === 'running');
      }
    } catch (error) {
      console.error('Failed to poll web service status:', error);
    }
  }, 5000); // Poll every 5 seconds
}

app.whenReady().then(async () => {
  configManager = new ConfigManager();
  const serverConfig = configManager.getServerConfig();
  serverClient = new HagicoServerClient(serverConfig);

  // Initialize NPM Mirror Helper
  npmMirrorHelper = new NpmMirrorHelper(configManager.getStore() as unknown as Store<Record<string, unknown>>);
  const detection = npmMirrorHelper.detectWithCache();
  console.log(`[App] Region detected: ${detection.region} (method: ${detection.method})`);

  // Initialize Web Service Manager
  const webServiceConfig: WebServiceConfig = {
    host: 'localhost',
    port: 36556, // Default port for embedded web service
  };
  webServiceManager = new PCodeWebServiceManager(webServiceConfig);

  // Initialize Package Manager
  packageManager = new PCodePackageManager();

  // Initialize Dependency Manager with store for NpmMirrorHelper
  dependencyManager = new DependencyManager(configManager.getStore() as unknown as Store<Record<string, unknown>>);

  createWindow();
  createTray();
  setServerStatus('stopped');
  startStatusPolling();
  startWebServiceStatusPolling();

  // Initialize Menu Manager
  if (mainWindow) {
    menuManager = new MenuManager(mainWindow);
    // Get initial language from config or default to zh-CN
    const initialLanguage = configManager.getAll()?.settings?.language || 'zh-CN';
    const initialWebServiceStatus = await webServiceManager.getStatus();
    menuManager.createMenu(initialLanguage, initialWebServiceStatus.status === 'running');
  }

  // Check port availability and send to renderer
  try {
    const portAvailable = await webServiceManager.checkPortAvailable();
    mainWindow?.on('ready-to-show', () => {
      mainWindow?.webContents.send('web-service-port-status', {
        port: webServiceConfig.port,
        available: portAvailable
      });
    });
  } catch (error) {
    console.error('[App] Failed to check port availability:', error);
  }
});

app.on('window-all-closed', () => {
  // Don't quit on window close, keep running in tray
  if (process.platform === 'darwin') {
    // On macOS, keep app running but can quit
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  // Prevent default to allow async cleanup
  event.preventDefault();

  try {
    console.log('[App] Cleaning up before quit...');
    if (webServiceManager) {
      await webServiceManager.cleanup();
    }
    destroyTray();
  } catch (error) {
    console.error('[App] Error during cleanup:', error);
  } finally {
    // Ensure app quits even if cleanup fails
    app.exit(0);
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

export { mainWindow };
