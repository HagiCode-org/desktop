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
import { PackageSourceConfigManager } from './package-source-config-manager.js';
import { LicenseManager } from './license-manager.js';
import { OnboardingManager } from './onboarding-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Path helper for production builds with asar packaging.
 *
 * In development: __dirname = 'dist/main'
 * In production (asar): __dirname = 'app.asar/dist/main'
 *
 * This helper correctly resolves paths to the dist directory root
 * regardless of whether the app is running in development or production.
 */
function getDistRootPath(): string {
  // In production, we need to go up from 'dist/main' to 'dist'
  // __dirname will be 'app.asar/dist/main' in asar or 'dist/main' in dev
  // Going up two levels gets us to 'dist' or 'app.asar/dist'
  return path.resolve(__dirname, '..');
}

/**
 * Get the application root path (where resources folder is located).
 *
 * In development: returns project root
 * In production (asar): returns app.asar root
 */
function getAppRootPath(): string {
  // __dirname is either 'dist/main' (dev) or 'app.asar/dist/main' (prod)
  // Going up three levels from 'dist/main' gets us to project root
  // Going up three levels from 'app.asar/dist/main' gets us to app.asar root
  return path.resolve(__dirname, '..', '..');
}

let mainWindow: BrowserWindow | null = null;
let serverClient: HagicoServerClient | null = null;
let configManager: ConfigManager;
let statusPollingInterval: NodeJS.Timeout | null = null;
let webServiceManager: PCodeWebServiceManager | null = null;
let dependencyManager: DependencyManager | null = null;
let versionManager: VersionManager | null = null;
let packageSourceConfigManager: PackageSourceConfigManager | null = null;
let webServicePollingInterval: NodeJS.Timeout | null = null;
let menuManager: MenuManager | null = null;
let npmMirrorHelper: NpmMirrorHelper | null = null;
let licenseManager: LicenseManager | null = null;
let onboardingManager: OnboardingManager | null = null;

function createWindow(): void {
  console.log('[Hagicode] Creating window...');

  // Determine the correct preload path using getDistRootPath helper
  const distRoot = getDistRootPath();
  const appRoot = getAppRootPath();
  const preloadPath = path.join(distRoot, 'preload', 'index.mjs');
  const iconPath = path.join(appRoot, 'resources', 'icon.png');

  console.log('[Hagicode] Using preload path:', preloadPath);
  console.log('[Hagicode] Dist root path:', distRoot);
  console.log('[Hagicode] App root path:', appRoot);
  console.log('[Hagicode] Icon path:', iconPath);
  console.log('[Hagicode] __dirname:', __dirname);

  mainWindow = new BrowserWindow({
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Set global reference for IPC communication
  (global as any).mainWindow = mainWindow;

  // Log for debugging
  console.log('[Hagicode] Window created');

  if (process.env.NODE_ENV === 'development') {
    console.log('[Hagicode] Loading dev server at http://localhost:36598');
    mainWindow.loadURL('http://localhost:36598');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from the correct renderer path
    // The renderer is at dist/renderer/index.html
    const htmlPath = path.join(distRoot, 'renderer', 'index.html');
    console.log('[Hagicode] Loading production build from:', htmlPath);
    console.log('[Hagicode] Resolved absolute path:', path.resolve(htmlPath));

    // Verify file exists for debugging
    fs.access(htmlPath)
      .then(() => console.log('[Hagicode] HTML file verified to exist'))
      .catch((err) => console.error('[Hagicode] HTML file not found:', err));

    // Enable DevTools for production to diagnose white screen issue
    // TODO: Remove this after white screen issue is resolved
    mainWindow.webContents.openDevTools();

    mainWindow.loadFile(htmlPath);
  }

  mainWindow.once('ready-to-show', () => {
    console.log('[Hagicode] Window ready to show');
    mainWindow?.maximize();
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Hagicode] Page loaded successfully');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Hagicode] Failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('close', (event) => {
    // Close to tray instead of quitting
    if (process.platform !== 'darwin') {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    console.log('[Hagicode] Window closed');
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

ipcMain.handle('open-hagicode-in-app', async (_, url: string) => {
  if (!url) {
    console.error('[Main] No URL provided for open-hagicode-in-app');
    return false;
  }
  try {
    console.log('[Main] Opening Hagicode in app window:', url);

    // Use the same path helper for consistency
    const distRoot = getDistRootPath();
    const appRoot = getAppRootPath();
    const preloadPath = path.join(distRoot, 'preload', 'index.mjs');
    const iconPath = path.join(appRoot, 'resources', 'icon.png');

    // Create a new window for Hagicode
    const hagicodeWindow = new BrowserWindow({
      minWidth: 800,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      icon: iconPath,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    console.log('[Main] Hagicode window created');

    // Set up ready-to-show handler before loading URL
    hagicodeWindow.once('ready-to-show', () => {
      console.log('[Main] Hagicode window ready to show, maximizing...');
      hagicodeWindow.maximize();
      hagicodeWindow.show();
      hagicodeWindow.focus();
    });

    // Also set up error handling
    hagicodeWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('[Main] Hagicode window failed to load:', errorCode, errorDescription);
    });

    // Load the Hagicode URL
    await hagicodeWindow.loadURL(url);
    console.log('[Main] Hagicode URL loaded successfully');

    return true;
  } catch (error) {
    console.error('[Main] Failed to open Hagicode in app:', error);
    return false;
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
ipcMain.handle('switch-view', async (_, view: 'system' | 'web' | 'dependency' | 'version' | 'license') => {
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

  // Switching to system, dependency, version, or license views is always allowed
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

// Package Source Management IPC Handlers
ipcMain.handle('package-source:get-config', async () => {
  if (!versionManager) {
    return null;
  }
  try {
    return versionManager.getCurrentSourceConfig();
  } catch (error) {
    console.error('Failed to get package source config:', error);
    return null;
  }
});

ipcMain.handle('package-source:get-all-configs', async () => {
  if (!versionManager) {
    return [];
  }
  try {
    return versionManager.getAllSourceConfigs();
  } catch (error) {
    console.error('Failed to get all package source configs:', error);
    return [];
  }
});

ipcMain.handle('package-source:set-config', async (_, config) => {
  if (!versionManager) {
    return { success: false, error: 'Version manager not initialized' };
  }
  try {
    const success = await versionManager.setSourceConfig(config);
    if (success) {
      // Notify renderer of config change
      const newConfig = versionManager.getCurrentSourceConfig();
      mainWindow?.webContents.send('package-source:configChanged', newConfig);

      // Notify renderer to refresh version list
      mainWindow?.webContents.send('version:list:changed');
    }
    return { success };
  } catch (error) {
    console.error('Failed to set package source config:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('package-source:switch-source', async (_, sourceId: string) => {
  if (!versionManager) {
    return { success: false, error: 'Version manager not initialized' };
  }
  try {
    const success = await versionManager.switchSource(sourceId);
    if (success) {
      // Notify renderer of source change
      const newConfig = versionManager.getCurrentSourceConfig();
      mainWindow?.webContents.send('package-source:configChanged', newConfig);

      // Notify renderer to refresh version list
      mainWindow?.webContents.send('version:list:changed');
    }
    return { success };
  } catch (error) {
    console.error('Failed to switch package source:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('package-source:validate-config', async (_, config) => {
  if (!versionManager) {
    return { valid: false, error: 'Version manager not initialized' };
  }
  try {
    return await versionManager.validateSourceConfig(config);
  } catch (error) {
    console.error('Failed to validate package source config:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('package-source:scan-folder', async (_, folderPath: string) => {
  if (!versionManager) {
    return { success: false, error: 'Version manager not initialized', versions: [] };
  }
  try {
    // Temporarily switch to folder source for scanning
    const tempConfig = {
      type: 'local-folder' as const,
      path: folderPath,
      name: 'Temporary scan',
    };

    const validationResult = await versionManager.validateSourceConfig(tempConfig);
    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.error || 'Invalid folder path',
        versions: []
      };
    }

    // Create a temporary source to scan
    const { LocalFolderPackageSource } = await import('./package-sources/local-folder-source.js');
    const tempSource = new LocalFolderPackageSource(tempConfig);
    const versions = await tempSource.listAvailableVersions();

    return {
      success: true,
      versions,
      count: versions.length
    };
  } catch (error) {
    console.error('Failed to scan folder:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      versions: []
    };
  }
});

ipcMain.handle('package-source:fetch-github', async (_, config: { owner: string; repo: string; token?: string }) => {
  if (!versionManager) {
    return { success: false, error: 'Version manager not initialized', versions: [] };
  }
  try {
    const githubConfig = {
      type: 'github-release' as const,
      ...config,
    };

    const validationResult = await versionManager.validateSourceConfig(githubConfig);
    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.error || 'Invalid GitHub configuration',
        versions: []
      };
    }

    // Create a temporary source to fetch releases
    const { GitHubReleasePackageSource } = await import('./package-sources/github-release-source.js');
    const tempSource = new GitHubReleasePackageSource(githubConfig);
    const versions = await tempSource.listAvailableVersions();

    return {
      success: true,
      versions,
      count: versions.length
    };
  } catch (error) {
    console.error('Failed to fetch GitHub releases:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      versions: []
    };
  }
});

ipcMain.handle('package-source:fetch-http-index', async (_, config: { indexUrl: string; baseUrl?: string; authToken?: string }) => {
  if (!versionManager) {
    return { success: false, error: 'Version manager not initialized', versions: [] };
  }
  try {
    const httpIndexConfig = {
      type: 'http-index' as const,
      ...config,
    };

    const validationResult = await versionManager.validateSourceConfig(httpIndexConfig);
    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.error || 'Invalid HTTP index configuration',
        versions: []
      };
    }

    // Create a temporary source to fetch index
    const { HttpIndexPackageSource } = await import('./package-sources/http-index-source.js');
    const tempSource = new HttpIndexPackageSource(httpIndexConfig);
    const versions = await tempSource.listAvailableVersions();

    return {
      success: true,
      versions,
      count: versions.length
    };
  } catch (error) {
    console.error('Failed to fetch HTTP index:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      versions: []
    };
  }
});

// License Management IPC Handlers
ipcMain.handle('license:get', async () => {
  if (!licenseManager) {
    return null;
  }
  try {
    return licenseManager.getLicense();
  } catch (error) {
    console.error('Failed to get license:', error);
    return null;
  }
});

ipcMain.handle('license:save', async (_, licenseKey: string) => {
  if (!licenseManager) {
    return {
      success: false,
      error: 'License manager not initialized'
    };
  }
  try {
    return licenseManager.saveLicense(licenseKey);
  } catch (error) {
    console.error('Failed to save license:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Onboarding IPC Handlers
ipcMain.handle('onboarding:check-trigger', async () => {
  if (!onboardingManager) {
    return { shouldShow: false, reason: 'not-initialized' };
  }
  try {
    return await onboardingManager.checkTriggerCondition();
  } catch (error) {
    console.error('Failed to check onboarding trigger:', error);
    return { shouldShow: false, reason: 'error' };
  }
});

ipcMain.handle('onboarding:get-state', async () => {
  if (!onboardingManager) {
    return null;
  }
  try {
    return onboardingManager.getStoredState();
  } catch (error) {
    console.error('Failed to get onboarding state:', error);
    return null;
  }
});

ipcMain.handle('onboarding:skip', async () => {
  if (!onboardingManager) {
    return { success: false, error: 'Onboarding manager not initialized' };
  }
  try {
    await onboardingManager.skipOnboarding();
    return { success: true };
  } catch (error) {
    console.error('Failed to skip onboarding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('onboarding:download-package', async () => {
  if (!onboardingManager) {
    return { success: false, error: 'Onboarding manager not initialized' };
  }
  try {
    const result = await onboardingManager.downloadLatestPackage((progress) => {
      mainWindow?.webContents.send('onboarding:download-progress', progress);
    });
    return result;
  } catch (error) {
    console.error('Failed to download package:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('onboarding:install-dependencies', async (_, versionId: string) => {
  if (!onboardingManager) {
    return { success: false, error: 'Onboarding manager not initialized' };
  }
  try {
    const result = await onboardingManager.installDependencies(versionId, (status) => {
      mainWindow?.webContents.send('onboarding:dependency-progress', status);
    });
    return result;
  } catch (error) {
    console.error('Failed to install dependencies:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('onboarding:check-dependencies', async (_, versionId: string) => {
  if (!onboardingManager) {
    return { success: false, error: 'Onboarding manager not initialized' };
  }
  try {
    const result = await onboardingManager.checkDependenciesStatus(versionId, (status) => {
      mainWindow?.webContents.send('onboarding:dependency-progress', status);
    });
    return result;
  } catch (error) {
    console.error('Failed to check dependencies:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('onboarding:start-service', async (_, versionId: string) => {
  if (!onboardingManager) {
    return { success: false, error: 'Onboarding manager not initialized' };
  }
  try {
    const result = await onboardingManager.startWebService(versionId, (progress) => {
      mainWindow?.webContents.send('onboarding:service-progress', progress);
    });
    return result;
  } catch (error) {
    console.error('Failed to start service:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('onboarding:complete', async (_, versionId: string) => {
  if (!onboardingManager) {
    return { success: false, error: 'Onboarding manager not initialized' };
  }
  try {
    await onboardingManager.completeOnboarding(versionId);
    return { success: true };
  } catch (error) {
    console.error('Failed to complete onboarding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('onboarding:reset', async () => {
  if (!onboardingManager) {
    return { success: false, error: 'Onboarding manager not initialized' };
  }
  try {
    await onboardingManager.resetOnboarding();
    return { success: true };
  } catch (error) {
    console.error('Failed to reset onboarding:', error);
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

  // Initialize Package Source Configuration Manager
  packageSourceConfigManager = new PackageSourceConfigManager(configManager.getStore() as unknown as Store);

  // Initialize Version Manager with package source config manager
  versionManager = new VersionManager(dependencyManager, packageSourceConfigManager);

  // Initialize License Manager
  licenseManager = LicenseManager.getInstance(configManager);

  // Initialize Onboarding Manager
  if (dependencyManager && versionManager && webServiceManager) {
    onboardingManager = new OnboardingManager(
      versionManager,
      dependencyManager,
      webServiceManager,
      configManager.getStore() as unknown as Store<Record<string, unknown>>
    );
    log.info('[App] Onboarding Manager initialized');
  }

  // Register license sync status callback to forward to renderer
  licenseManager.onSyncStatus((status) => {
    log.info('[App] License sync status:', status);
    mainWindow?.webContents.send('license:syncStatus', status);
  });

  // Initialize license (async operation)
  licenseManager.initializeDefaultLicense().catch(error => {
    log.error('[App] Failed to initialize license:', error);
  });
  log.info('[App] License Manager initialized');

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
