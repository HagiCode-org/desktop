import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import Store from 'electron-store';
import log from 'electron-log';
import { createTray, destroyTray, setServerStatus, setServiceUrl, updateTrayMenu, setWebServiceManagerRef } from './tray.js';
import { HagicoServerClient, type ServerStatus } from './server.js';
import { ConfigManager } from './config.js';
import { PCodeWebServiceManager, type ProcessInfo, type WebServiceConfig } from './web-service-manager.js';
import { DependencyManager, type DependencyCheckResult, DependencyType } from './dependency-manager.js';
import { MenuManager } from './menu-manager.js';
import { NpmMirrorHelper } from './npm-mirror-helper.js';
import { VersionManager } from './version-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let serverClient: HagicoServerClient | null = null;
let configManager: ConfigManager;
let statusPollingInterval: NodeJS.Timeout | null = null;
let webServiceManager: PCodeWebServiceManager | null = null;
let dependencyManager: DependencyManager | null = null;
let versionManager: VersionManager | null = null;
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
    autoHideMenuBar: true,
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

ipcMain.handle('start-web-service', async (_, force?: boolean) => {
  if (!webServiceManager) {
    return {
      success: false,
      error: { type: 'manager-not-initialized', details: 'Web service manager not initialized' }
    };
  }

  if (!versionManager) {
    return {
      success: false,
      error: { type: 'version-manager-not-initialized', details: 'Version manager not initialized' }
    };
  }

  try {
    // Get active version before starting
    const activeVersion = await versionManager.getActiveVersion();

    if (!activeVersion) {
      log.warn('[Main] No active version found, cannot start web service');
      return {
        success: false,
        error: { type: 'no-active-version', details: 'No active version found. Please install and activate a version first.' }
      };
    }

    // Check version status for warning (non-blocking)
    const missingDependencies: DependencyCheckResult[] = [];
    if (activeVersion.status !== 'installed-ready' && !force) {
      log.warn('[Main] Active version is not ready:', activeVersion.status);

      // Collect missing dependencies for the warning
      if (activeVersion.dependencies) {
        for (const dep of activeVersion.dependencies) {
          if (!dep.installed || dep.versionMismatch) {
            missingDependencies.push(dep);
          }
        }
      }

      // Return warning to frontend for confirmation dialog
      return {
        success: false,
        warning: {
          type: 'missing-dependencies',
          missing: missingDependencies
        }
      };
    }

    // Log dependency status for audit
    if (missingDependencies.length > 0) {
      log.info('[Main] Starting service with missing dependencies:', {
        missingCount: missingDependencies.length,
        dependencies: missingDependencies.map(d => ({ name: d.name, type: d.type, installed: d.installed }))
      });
    }

    // Set the active version path in web service manager
    webServiceManager.setActiveVersion(activeVersion.id);
    log.info('[Main] Starting web service with version:', activeVersion.id, 'at path:', activeVersion.installedPath);

    const result = await webServiceManager.start();

    // Notify renderer of status change
    const status = await webServiceManager.getStatus();
    mainWindow?.webContents.send('web-service-status-changed', status);

    // Update tray status and URL
    setServerStatus(status.status, status.url);
    setServiceUrl(status.url);

    return { success: result };
  } catch (error) {
    log.error('Failed to start web service:', error);
    return {
      success: false,
      error: {
        type: 'unknown',
        details: error instanceof Error ? error.message : String(error)
      }
    };
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

    // Update tray status and clear URL
    setServerStatus(status.status);
    setServiceUrl(null);

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

    // Update tray status and URL
    setServerStatus(status.status, status.url);
    setServiceUrl(status.url);

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

    // Also notify version updates since dependencies affect version status
    if (versionManager) {
      const installedVersions = await versionManager.getInstalledVersions();
      mainWindow?.webContents.send('version:installedVersionsChanged', installedVersions);
    }

    return result;
  } catch (error) {
    console.error('Failed to install dependency:', error);
    return false;
  }
});

// Version Management IPC Handlers
ipcMain.handle('version:list', async () => {
  if (!versionManager) {
    return [];
  }
  try {
    return await versionManager.listVersions();
  } catch (error) {
    console.error('Failed to list versions:', error);
    return [];
  }
});

ipcMain.handle('version:getInstalled', async () => {
  if (!versionManager) {
    return [];
  }
  try {
    return await versionManager.getInstalledVersions();
  } catch (error) {
    console.error('Failed to get installed versions:', error);
    return [];
  }
});

ipcMain.handle('version:getActive', async () => {
  if (!versionManager) {
    return null;
  }
  try {
    return await versionManager.getActiveVersion();
  } catch (error) {
    console.error('Failed to get active version:', error);
    return null;
  }
});

ipcMain.handle('version:install', async (_, versionId: string) => {
  if (!versionManager || !mainWindow || !webServiceManager) {
    return { success: false, error: 'Version manager not initialized' };
  }
  try {
    const result = await versionManager.installVersion(versionId);

    if (result.success) {
      // Check if this is the first installed version (now active)
      const activeVersion = await versionManager.getActiveVersion();
      if (activeVersion) {
        webServiceManager.setActiveVersion(activeVersion.id);
      }
    }

    // Notify renderer of installed versions change
    const installedVersions = await versionManager.getInstalledVersions();
    mainWindow?.webContents.send('version:installedVersionsChanged', installedVersions);

    return result;
  } catch (error) {
    console.error('Failed to install version:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle('version:uninstall', async (_, versionId: string) => {
  if (!versionManager || !mainWindow || !webServiceManager) {
    return false;
  }
  try {
    // Check if this is the active version before uninstalling
    const activeVersion = await versionManager.getActiveVersion();
    const isActive = activeVersion?.id === versionId;

    const result = await versionManager.uninstallVersion(versionId);

    if (result && isActive) {
      // Clear active version in web service manager
      webServiceManager.clearActiveVersion();
    }

    // Notify renderer of installed versions change
    const installedVersions = await versionManager.getInstalledVersions();
    mainWindow?.webContents.send('version:installedVersionsChanged', installedVersions);

    return result;
  } catch (error) {
    console.error('Failed to uninstall version:', error);
    return false;
  }
});

ipcMain.handle('version:reinstall', async (_, versionId: string) => {
  if (!versionManager || !mainWindow || !webServiceManager) {
    return false;
  }
  try {
    const result = await versionManager.reinstallVersion(versionId);

    // Notify renderer of installed versions change
    const installedVersions = await versionManager.getInstalledVersions();
    mainWindow?.webContents.send('version:installedVersionsChanged', installedVersions);

    // Notify active version change if it was the active version
    const activeVersion = await versionManager.getActiveVersion();
    mainWindow?.webContents.send('version:activeVersionChanged', activeVersion);

    return result.success;
  } catch (error) {
    console.error('Failed to reinstall version:', error);
    return false;
  }
});

ipcMain.handle('version:switch', async (_, versionId: string) => {
  if (!versionManager || !mainWindow || !webServiceManager) {
    return false;
  }
  try {
    const result = await versionManager.switchVersion(versionId);

    if (result.success) {
      // Update web service manager with new active version
      webServiceManager.setActiveVersion(versionId);

      // Notify renderer of active version change
      const activeVersion = await versionManager.getActiveVersion();
      mainWindow?.webContents.send('version:activeVersionChanged', activeVersion);

      // If there's a warning (missing dependencies), send it to renderer
      if (result.warning) {
        mainWindow?.webContents.send('version:dependencyWarning', result.warning);
      }
    }

    return result.success;
  } catch (error) {
    console.error('Failed to switch version:', error);
    return false;
  }
});

ipcMain.handle('version:checkDependencies', async (_, versionId: string) => {
  if (!versionManager) {
    return [];
  }
  try {
    return await versionManager.checkVersionDependencies(versionId);
  } catch (error) {
    console.error('Failed to check version dependencies:', error);
    return [];
  }
});

ipcMain.handle('version:openLogs', async (_, versionId: string) => {
  if (!versionManager) {
    return {
      success: false,
      error: 'Version manager not initialized'
    };
  }

  try {
    // Get logs path
    const logsPath = versionManager.getLogsPath(versionId);

    // Check if logs directory exists
    try {
      await fs.access(logsPath);
    } catch {
      log.warn('[Main] Logs directory not found:', logsPath);
      return {
        success: false,
        error: 'logs_not_found'
      };
    }

    // Open the folder in system file manager
    await shell.openPath(logsPath);
    log.info('[Main] Opened logs folder:', logsPath);

    return { success: true };
  } catch (error) {
    log.error('[Main] Failed to open logs folder:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Package Management IPC Handlers (for web service packages)
ipcMain.handle('install-web-service-package', async (_, version: string) => {
  if (!versionManager || !mainWindow || !webServiceManager) {
    return false;
  }
  try {
    console.log('[Main] Installing/reinstalling web service package:', version);

    // Check if the version is already installed
    const installedVersions = await versionManager.getInstalledVersions();
    const isInstalled = installedVersions.some((v: any) => v.id === version);

    let success = false;

    if (isInstalled) {
      // Version is already installed, use reinstall
      console.log('[Main] Version already installed, performing reinstall');
      const reinstallResult = await versionManager.reinstallVersion(version);
      success = reinstallResult.success;
    } else {
      // New installation
      const installResult = await versionManager.installVersion(version);
      success = installResult.success;
    }

    if (success) {
      // Update active version in web service manager
      const activeVersion = await versionManager.getActiveVersion();
      if (activeVersion) {
        webServiceManager.setActiveVersion(activeVersion.id);
      }

      // Notify renderer of installed versions change
      const updatedVersions = await versionManager.getInstalledVersions();
      mainWindow?.webContents.send('version:installedVersionsChanged', updatedVersions);
    }

    return success;
  } catch (error) {
    console.error('Failed to install/reinstall web service package:', error);
    return false;
  }
});

ipcMain.handle('check-package-installation', async () => {
  if (!versionManager) {
    return {
      version: 'none',
      platform: 'unknown',
      installedPath: '',
      isInstalled: false,
    };
  }
  try {
    const activeVersion = await versionManager.getActiveVersion();
    if (!activeVersion) {
      return {
        version: 'none',
        platform: 'unknown',
        installedPath: '',
        isInstalled: false,
      };
    }

    return {
      version: activeVersion.version,
      platform: activeVersion.platform,
      installedPath: activeVersion.installedPath,
      isInstalled: true,
    };
  } catch (error) {
    console.error('Failed to check package installation:', error);
    return {
      version: 'none',
      platform: 'unknown',
      installedPath: '',
      isInstalled: false,
    };
  }
});

ipcMain.handle('get-available-versions', async () => {
  if (!versionManager) {
    return [];
  }
  try {
    const versions = await versionManager.listVersions();
    return versions.map(v => v.id);
  } catch (error) {
    console.error('Failed to get available versions:', error);
    return [];
  }
});

ipcMain.handle('get-platform', async () => {
  // Return the platform identifier used by VersionManager
  const platform = process.platform;
  switch (platform) {
    case 'linux':
      return 'linux';
    case 'darwin':
      return 'osx';
    case 'win32':
      return 'windows';
    default:
      return platform;
  }
});

// Manifest-based Dependency Installation IPC Handlers
ipcMain.handle('dependency:install-from-manifest', async (_, versionId: string) => {
  if (!versionManager || !dependencyManager) {
    return {
      success: false,
      error: 'Version manager or dependency manager not initialized'
    };
  }

  try {
    log.info('[Main] Installing dependencies from manifest for version:', versionId);

    // Get the installed version
    const installedVersions = await versionManager.getInstalledVersions();
    const targetVersion = installedVersions.find(v => v.id === versionId);

    if (!targetVersion) {
      return {
        success: false,
        error: 'Version not installed'
      };
    }

    // Read manifest
    const { manifestReader } = await import('./manifest-reader.js');
    const manifest = await manifestReader.readManifest(targetVersion.installedPath);

    if (!manifest) {
      return {
        success: false,
        error: 'Manifest not found'
      };
    }

    // Parse dependencies
    const dependencies = manifestReader.parseDependencies(manifest);

    // Install using dependency manager
    const result = await dependencyManager.installFromManifest(
      manifest,
      dependencies,
      (progress) => {
        // Send progress update to renderer
        mainWindow?.webContents.send('dependency:install-progress', progress);
      }
    );

    // Refresh version dependency status after installation
    await versionManager.checkVersionDependencies(versionId);

    // Notify renderer of dependency status change
    const updatedDependencies = await versionManager.checkVersionDependencies(versionId);
    mainWindow?.webContents.send('dependency-status-changed', updatedDependencies);

    // Also notify version updates since dependencies affect version status
    const allInstalledVersions = await versionManager.getInstalledVersions();
    mainWindow?.webContents.send('version:installedVersionsChanged', allInstalledVersions);

    return {
      success: true,
      result
    };
  } catch (error) {
    log.error('[Main] Failed to install dependencies from manifest:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('dependency:install-single', async (_, dependencyKey: string, versionId: string) => {
  if (!versionManager || !dependencyManager) {
    return {
      success: false,
      error: 'Version manager or dependency manager not initialized'
    };
  }

  try {
    log.info('[Main] Installing single dependency:', dependencyKey, 'for version:', versionId);

    // Get the installed version
    const installedVersions = await versionManager.getInstalledVersions();
    const targetVersion = installedVersions.find(v => v.id === versionId);

    if (!targetVersion) {
      return {
        success: false,
        error: 'Version not installed'
      };
    }

    // Read manifest
    const { manifestReader } = await import('./manifest-reader.js');
    const manifest = await manifestReader.readManifest(targetVersion.installedPath);

    if (!manifest) {
      return {
        success: false,
        error: 'Manifest not found'
      };
    }

    // Parse dependencies and find the target one
    const dependencies = manifestReader.parseDependencies(manifest);
    const targetDep = dependencies.find(d => d.key === dependencyKey);

    if (!targetDep) {
      return {
        success: false,
        error: `Dependency ${dependencyKey} not found in manifest`
      };
    }

    // Install single dependency
    await dependencyManager.installSingleDependency(targetDep);

    // Refresh version dependency status after installation
    await versionManager.checkVersionDependencies(versionId);

    // Notify renderer of dependency status change
    const updatedDependencies = await versionManager.checkVersionDependencies(versionId);
    mainWindow?.webContents.send('dependency-status-changed', updatedDependencies);

    // Also notify version updates
    const allInstalledVersions = await versionManager.getInstalledVersions();
    mainWindow?.webContents.send('version:installedVersionsChanged', allInstalledVersions);

    return {
      success: true
    };
  } catch (error) {
    log.error('[Main] Failed to install single dependency:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('dependency:get-missing', async (_, versionId: string) => {
  if (!versionManager) {
    return [];
  }

  try {
    const dependencies = await versionManager.checkVersionDependencies(versionId);
    return dependencies.filter(dep => !dep.installed || dep.versionMismatch);
  } catch (error) {
    log.error('[Main] Failed to get missing dependencies:', error);
    return [];
  }
});

// View Management IPC Handlers
ipcMain.handle('switch-view', async (_, view: 'system' | 'web' | 'dependency' | 'version') => {
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

  // Switching to system, dependency, or version views is always allowed
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

// Open external link handler
ipcMain.handle('open-external', async (_event, url: string) => {
  try {
    // URL security validation
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return {
        success: false,
        error: 'Invalid URL format'
      };
    }

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        success: false,
        error: 'Invalid URL protocol'
      };
    }

    // URL whitelist validation
    const allowedDomains = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      'hagicode.com',
      'qq.com',
      'github.com',
      'qm.qq.com'
    ];

    const isAllowed = allowedDomains.some(domain =>
      parsedUrl.hostname === domain ||
      parsedUrl.hostname.endsWith('.' + domain)
    );

    if (!isAllowed) {
      return {
        success: false,
        error: 'Domain not allowed'
      };
    }

    // Open external link
    await shell.openExternal(url);

    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to open external URL:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
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
        const isRunning = status.status === 'running';
        menuManager.updateWebServiceStatus(isRunning);
      }

      // Update tray status and URL
      setServerStatus(status.status, status.url);
      setServiceUrl(status.url);
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

  // Set webServiceManager reference for tray
  setWebServiceManagerRef(webServiceManager);

  // Initialize Dependency Manager with store for NpmMirrorHelper
  dependencyManager = new DependencyManager(configManager.getStore() as unknown as Store<Record<string, unknown>>);

  // Initialize Version Manager (no longer needs PackageManager)
  versionManager = new VersionManager(dependencyManager);

  // Set active version in web service manager
  (async () => {
    try {
      const activeVersion = await versionManager.getActiveVersion();
      if (activeVersion) {
        webServiceManager.setActiveVersion(activeVersion.id);
        log.info('Active version set in web service manager:', activeVersion.id);
      } else {
        webServiceManager.clearActiveVersion();
        log.info('No active version found, web service manager cleared');
      }
    } catch (error) {
      log.error('Failed to set active version in web service manager:', error);
    }
  })();

  createWindow();
  createTray();
  setServerStatus('stopped');
  startStatusPolling();

  // Get initial web service status and update tray before starting polling
  try {
    const initialStatus = await webServiceManager.getStatus();
    setServerStatus(initialStatus.status, initialStatus.url);
    setServiceUrl(initialStatus.url);
  } catch (error) {
    console.error('Failed to get initial web service status:', error);
  }

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
