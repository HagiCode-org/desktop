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
import { RegionDetector } from './region-detector.js';
import { LlmInstallationManager } from './llm-installation-manager.js';
import { VersionManager } from './version-manager.js';
import { PackageSourceConfigManager } from './package-source-config-manager.js';
import { LicenseManager } from './license-manager.js';
import { OnboardingManager } from './onboarding-manager.js';
import { manifestReader } from './manifest-reader.js';
import { RSSFeedManager, DEFAULT_RSS_FEED_URL } from './rss-feed-manager.js';
import type { RSSFeedItem } from './types/rss-types.js';
import { ClaudeConfigManager } from './claude-config-manager.js';
import type { ClaudeProvider } from '../types/claude-config.js';
import { initializePresetServices, getPresetLoader, presetFetchHandler, presetRefreshHandler, presetClearCacheHandler, presetGetProviderHandler, presetGetAllProvidersHandler, presetGetCacheStatsHandler } from '../ipc/handlers/preset-handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Single Instance Lock
 *
 * Prevent multiple instances of the application from running simultaneously.
 * When a second instance is launched, it exits immediately and focuses the
 * existing instance's main window.
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  log.info('[App] Single instance lock failed - another instance is already running');
  app.quit();
} else {
  log.info('[App] Single instance lock acquired successfully');
}

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
let regionDetector: RegionDetector | null = null;
let llmInstallationManager: LlmInstallationManager | null = null;
let licenseManager: LicenseManager | null = null;
let onboardingManager: OnboardingManager | null = null;
let rssFeedManager: RSSFeedManager | null = null;
let claudeConfigManager: ClaudeConfigManager | null = null;

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
      devTools: !app.isPackaged,
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
        devTools: !app.isPackaged,
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

    // No blocking principle: don't check dependency status before starting
    // Users confirm via dialog, not via status check
    // The service will handle missing dependencies at runtime

    // Set the active version path in web service manager
    webServiceManager.setActiveVersion(activeVersion.id);

    // Read manifest and set entryPoint
    const manifest = await manifestReader.readManifest(activeVersion.installedPath);
    if (manifest) {
      const entryPoint = manifestReader.parseEntryPoint(manifest);
      webServiceManager.setEntryPoint(entryPoint);
    } else {
      log.warn('[Main] No manifest found, entryPoint may not be available');
      webServiceManager.setEntryPoint(null);
    }

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
    const dependencies = await dependencyManager.checkAllDependencies();

    // Check if debug mode is enabled (ignore dependency check)
    const debugMode = configManager.getStore().get('debugMode') as { ignoreDependencyCheck: boolean } | undefined;
    if (debugMode?.ignoreDependencyCheck) {
      // Force all dependencies to appear as not installed
      return dependencies.map(dep => ({
        ...dep,
        installed: false,
      }));
    }

    return dependencies;
  } catch (error) {
    console.error('Failed to check dependencies:', error);
    return [];
  }
});

// Manifest-based Dependency Installation IPC Handlers
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
    const dependencies = await versionManager.checkVersionDependencies(versionId);

    // Check if debug mode is enabled (ignore dependency check)
    const debugMode = configManager.getStore().get('debugMode') as { ignoreDependencyCheck: boolean } | undefined;
    if (debugMode?.ignoreDependencyCheck) {
      // Force all dependencies to appear as not installed
      return dependencies.map(dep => ({
        ...dep,
        installed: false,
      }));
    }

    return dependencies;
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

// Channel Selection IPC Handler
ipcMain.handle('version:setChannel', async (_, channel: string) => {
  if (!versionManager) {
    return {
      success: false,
      error: 'Version manager not initialized'
    };
  }
  try {
    // Get current package source config
    const currentConfig = versionManager.getCurrentSourceConfig();
    if (!currentConfig) {
      return {
        success: false,
        error: 'No active package source'
      };
    }

    // Update defaultChannel in the source config
    const packageSourceConfigManager = (versionManager as any).packageSourceConfigManager;
    packageSourceConfigManager.updateSource(currentConfig.id, {
      defaultChannel: channel
    });

    log.info('[Main] Channel preference saved:', channel);
    return { success: true };
  } catch (error) {
    log.error('[Main] Failed to set channel preference:', error);
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

    // Parse all dependencies from manifest
    const allDependencies = manifestReader.parseDependencies(manifest);
    const entryPoint = manifestReader.parseEntryPoint(manifest);

    // Set working directory and manifest for dependency manager
    dependencyManager.setWorkingDirectory(targetVersion.installedPath);
    dependencyManager.setManifest(manifest);

    // Check which dependencies are actually missing
    const checkedDependencies = await dependencyManager.checkFromManifest(allDependencies, entryPoint);

    // Filter to only install dependencies that are not installed or have version mismatch
    const missingDependencies = allDependencies.filter((dep) => {
      const checkedDep = checkedDependencies.find(cd => cd.name === dep.name);
      // Include dependency if it's not installed, has version mismatch, or we couldn't check it
      return !checkedDep || !checkedDep.installed || checkedDep.versionMismatch;
    });

    log.info('[Main] Total dependencies:', allDependencies.length, 'Missing:', missingDependencies.length);

    if (missingDependencies.length === 0) {
      log.info('[Main] All dependencies are already installed');
      return {
        success: true,
        result: {
          success: [],
          failed: []
        }
      };
    }

    // Install only missing dependencies using dependency manager
    const result = await dependencyManager.installFromManifest(
      manifest,
      missingDependencies,
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

    // Use entryPoint script for installation
    dependencyManager.setWorkingDirectory(targetVersion.installedPath);
    dependencyManager.setManifest(manifest);

    const entryPoint = manifestReader.parseEntryPoint(manifest);
    if (!entryPoint) {
      throw new Error('No entryPoint found in manifest');
    }

    // Send initial progress
    mainWindow?.webContents.send('dependency:command-progress', {
      type: 'command-info',
      checkCommand: targetDep.checkCommand,
      installCommand: entryPoint.install,
    });

    // Install using entryPoint script
    const installResult = await dependencyManager.installSingleDependency(targetDep, entryPoint);

    if (!installResult.success) {
      const errorMsg = installResult.parsedResult.errorMessage || 'Installation failed';
      return {
        success: false,
        error: errorMsg,
      };
    }

    // Refresh version dependency status after installation
    await versionManager.checkVersionDependencies(versionId);

    // Notify renderer of dependency status change
    const updatedDependencies = await versionManager.checkVersionDependencies(versionId);
    mainWindow?.webContents.send('dependency-status-changed', updatedDependencies);

    // Also notify version updates
    const allInstalledVersions = await versionManager.getInstalledVersions();
    mainWindow?.webContents.send('version:installedVersionsChanged', allInstalledVersions);

    return {
      success: true,
      checkCommand: targetDep.checkCommand, // Include check command in response
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
    let dependencies = await versionManager.checkVersionDependencies(versionId);

    // Check if debug mode is enabled (ignore dependency check)
    const debugMode = configManager.getStore().get('debugMode') as { ignoreDependencyCheck: boolean } | undefined;
    if (debugMode?.ignoreDependencyCheck) {
      // Force all dependencies to appear as not installed (missing)
      // This ensures all dependencies are shown as installable
      return dependencies.map(dep => ({
        ...dep,
        installed: false,
        versionMismatch: true, // Also set versionMismatch to ensure they appear as missing
      }));
    }

    return dependencies.filter(dep => !dep.installed || dep.versionMismatch);
  } catch (error) {
    log.error('[Main] Failed to get missing dependencies:', error);
    return [];
  }
});

// Get all dependencies (including installed ones) for onboarding display
ipcMain.handle('dependency:get-all', async (_, versionId: string) => {
  if (!versionManager) {
    return [];
  }

  try {
    let dependencies = await versionManager.checkVersionDependencies(versionId);

    // Check if debug mode is enabled (ignore dependency check)
    const debugMode = configManager.getStore().get('debugMode') as { ignoreDependencyCheck: boolean } | undefined;
    if (debugMode?.ignoreDependencyCheck) {
      // Force all dependencies to appear as not installed (missing)
      // This ensures all dependencies are shown as installable
      return dependencies.map(dep => ({
        ...dep,
        installed: false,
        versionMismatch: true, // Also set versionMismatch to ensure they appear as missing
      }));
    }

    // Return ALL dependencies, not just missing ones
    return dependencies;
  } catch (error) {
    log.error('[Main] Failed to get all dependencies:', error);
    return [];
  }
});

// Get dependency list from manifest without checking installation status (fast)
ipcMain.handle('dependency:get-list', async (_, versionId: string) => {
  if (!versionManager) {
    return [];
  }

  try {
    const dependencies = await versionManager.getDependencyListFromManifest(versionId);
    return dependencies;
  } catch (error) {
    log.error('[Main] Failed to get dependency list:', error);
    return [];
  }
});

// Execute install commands with progress
ipcMain.handle('dependency:execute-commands', async (_, commands: string[], workingDirectory?: string) => {
  if (!dependencyManager) {
    return {
      success: false,
      error: 'Dependency manager not initialized'
    };
  }

  try {
    log.info('[Main] Executing install commands:', commands.length, 'commands');

    // Determine working directory
    let workDir = workingDirectory;
    if (!workDir) {
      // Use version manager's data directory if no working directory specified
      const activeVersion = await versionManager?.getActiveVersion();
      if (activeVersion) {
        workDir = activeVersion.installedPath;
      } else {
        // Fallback to app data directory
        workDir = app.getPath('userData');
      }
    }

    // Execute commands with progress reporting
    const result = await dependencyManager.executeCommandsWithProgress(
      commands,
      workDir,
      (progress) => {
        // Send progress to renderer
        mainWindow?.webContents.send('dependency:command-progress', progress);
      }
    );

    return result;
  } catch (error) {
    log.error('[Main] Failed to execute install commands:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
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

// Region Detection IPC Handlers
ipcMain.handle('region:get-status', async () => {
  if (!regionDetector) {
    return {
      region: null,
      detectedAt: null,
    };
  }
  try {
    const status = regionDetector.getStatus();
    return {
      ...status,
      detectedAt: status.detectedAt?.toISOString() || null,
    };
  } catch (error) {
    console.error('[Main] Failed to get region status:', error);
    return {
      region: null,
      detectedAt: null,
    };
  }
});

ipcMain.handle('region:redetect', async () => {
  if (!regionDetector) {
    return {
      region: null,
      detectedAt: null,
    };
  }
  try {
    const detection = regionDetector.redetect();
    console.log(`[Main] Region re-detected: ${detection.region}`);
    return {
      region: detection.region,
      detectedAt: detection.detectedAt.toISOString(),
    };
  } catch (error) {
    console.error('[Main] Failed to re-detect region:', error);
    return {
      region: null,
      detectedAt: null,
    };
  }
});

// LLM Installation Manager IPC Handlers

ipcMain.handle('llm:load-prompt', async (_event, manifestPath: string, region?: 'cn' | 'international') => {
  if (!llmInstallationManager) {
    return {
      success: false,
      error: 'LLM Installation Manager not initialized',
    };
  }
  try {
    const prompt = await llmInstallationManager.loadPrompt(manifestPath, region);
    return {
      success: true,
      prompt: {
        version: prompt.version,
        content: prompt.content,
        region: prompt.region,
        filePath: prompt.filePath, // Include file path in response
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Main] Failed to load LLM prompt:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
});

ipcMain.handle('llm:call-api', async (event, manifestPath: string, region?: 'cn' | 'international') => {
  if (!llmInstallationManager) {
    return {
      success: false,
      error: 'LLM Installation Manager not initialized',
    };
  }
  try {
    // Load the prompt with the specified region (or auto-detect if not provided)
    const prompt = await llmInstallationManager.loadPrompt(manifestPath, region);

    // Call Claude API with the loaded prompt file path
    const result = await llmInstallationManager.callClaudeAPI(prompt.filePath, event.sender);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Main] Failed to call LLM API:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
});

ipcMain.handle('llm:detect-config', async () => {
  if (!llmInstallationManager) {
    return {
      exists: false,
      source: 'none',
      error: 'LLM Installation Manager not initialized',
    };
  }
  try {
    const config = await llmInstallationManager.detectClaudeConfig();
    return config;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Main] Failed to detect Claude config:', errorMessage);
    return {
      exists: false,
      source: 'none',
      error: errorMessage,
    };
  }
});

ipcMain.handle('llm:get-region', async () => {
  if (!llmInstallationManager) {
    return { region: null };
  }
  return {
    region: llmInstallationManager.getRegion(),
  };
});

ipcMain.handle('llm:get-manifest-path', async (_event, versionId: string) => {
  try {
    const pathManager = (await import('./path-manager.js')).PathManager.getInstance();
    const versionPath = pathManager.getInstalledVersionPath(versionId);
    const manifestPath = `${versionPath}/manifest.json`;
    console.log('[Main] Getting manifest path for version:', versionId, '->', manifestPath);
    return {
      success: true,
      manifestPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Main] Failed to get manifest path:', errorMessage);
    return {
      success: false,
      error: errorMessage,
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

    // Open external link with activate option to ensure browser window is focused
    await shell.openExternal(url, { activate: true });

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
    // Notify renderer to show onboarding wizard
    mainWindow?.webContents.send('onboarding:show');
    return { success: true };
  } catch (error) {
    console.error('Failed to reset onboarding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Claude Config IPC Handlers
ipcMain.handle('claude:detect', async () => {
  if (!claudeConfigManager) {
    return {
      exists: false,
      source: 'none',
      error: 'Claude Config Manager not initialized'
    };
  }
  try {
    return await claudeConfigManager.detectExistingConfig();
  } catch (error) {
    console.error('Failed to detect Claude config:', error);
    return {
      exists: false,
      source: 'none',
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('claude:validate', async (_, provider: string, apiKey: string, endpoint?: string) => {
  if (!claudeConfigManager) {
    return {
      success: false,
      error: 'Claude Config Manager not initialized'
    };
  }
  try {
    return await claudeConfigManager.validateApiKey(provider as ClaudeProvider, apiKey, endpoint);
  } catch (error) {
    console.error('Failed to validate Claude API key:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('claude:verify-cli', async () => {
  if (!claudeConfigManager) {
    return {
      installed: false,
      error: 'Claude Config Manager not initialized'
    };
  }
  try {
    return await claudeConfigManager.verifyCliInstallation();
  } catch (error) {
    console.error('Failed to verify Claude CLI:', error);
    return {
      installed: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('claude:save', async (_, config: any) => {
  if (!claudeConfigManager) {
    return {
      success: false,
      error: 'Claude Config Manager not initialized'
    };
  }
  try {
    return await claudeConfigManager.saveConfig(config);
  } catch (error) {
    console.error('Failed to save Claude config:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('claude:get-stored', async () => {
  if (!claudeConfigManager) {
    return null;
  }
  try {
    return claudeConfigManager.getStoredConfig();
  } catch (error) {
    console.error('Failed to get stored Claude config:', error);
    return null;
  }
});

ipcMain.handle('claude:delete', async () => {
  if (!claudeConfigManager) {
    return { success: false, error: 'Claude Config Manager not initialized' };
  }
  try {
    claudeConfigManager.deleteStoredConfig();
    return { success: true };
  } catch (error) {
    console.error('Failed to delete Claude config:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('claude:test', async () => {
  if (!claudeConfigManager) {
    return { success: false, error: 'Claude Config Manager not initialized' };
  }
  try {
    return await claudeConfigManager.testConfiguration();
  } catch (error) {
    console.error('Failed to test Claude config:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('claude:list-backups', async () => {
  if (!claudeConfigManager) {
    return { success: false, error: 'Claude Config Manager not initialized', backups: [] };
  }
  try {
    const backups = await claudeConfigManager.listBackups();
    return { success: true, backups };
  } catch (error) {
    console.error('Failed to list Claude config backups:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      backups: []
    };
  }
});

ipcMain.handle('claude:restore-backup', async (_, backupPath: string) => {
  if (!claudeConfigManager) {
    return { success: false, error: 'Claude Config Manager not initialized' };
  }
  try {
    return await claudeConfigManager.restoreFromBackup(backupPath);
  } catch (error) {
    console.error('Failed to restore Claude config from backup:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Preset Management IPC Handlers
ipcMain.handle('preset:fetch', presetFetchHandler);
ipcMain.handle('preset:refresh', presetRefreshHandler);
ipcMain.handle('preset:clear-cache', presetClearCacheHandler);
ipcMain.handle('preset:get-provider', presetGetProviderHandler);
ipcMain.handle('preset:get-all-providers', presetGetAllProvidersHandler);
ipcMain.handle('preset:get-cache-stats', presetGetCacheStatsHandler);

// Debug Mode IPC Handlers
ipcMain.handle('set-debug-mode', async (_, mode: { ignoreDependencyCheck: boolean }) => {
  try {
    // Store debug mode in electron-store
    const storeKey = 'debugMode';
    configManager.getStore().set(storeKey, mode);
    // Notify renderer of debug mode change
    mainWindow?.webContents.send('debug-mode-changed', mode);
    return { success: true };
  } catch (error) {
    console.error('Failed to set debug mode:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

ipcMain.handle('get-debug-mode', async () => {
  try {
    const storeKey = 'debugMode';
    const mode = configManager.getStore().get(storeKey, { ignoreDependencyCheck: false }) as { ignoreDependencyCheck: boolean };
    return mode;
  } catch (error) {
    console.error('Failed to get debug mode:', error);
    return { ignoreDependencyCheck: false };
  }
});

// RSS Feed IPC Handlers
ipcMain.handle('rss-get-feed-items', async () => {
  if (!rssFeedManager) {
    return [];
  }
  try {
    const items = await rssFeedManager.getFeedItems();
    return items;
  } catch (error) {
    console.error('Failed to get RSS feed items:', error);
    return [];
  }
});

ipcMain.handle('rss-refresh-feed', async () => {
  if (!rssFeedManager) {
    return [];
  }
  try {
    const items = await rssFeedManager.refreshFeed();
    return items;
  } catch (error) {
    console.error('Failed to refresh RSS feed:', error);
    return [];
  }
});

ipcMain.handle('rss-get-last-update', async () => {
  if (!rssFeedManager) {
    return null;
  }
  try {
    return rssFeedManager.getLastUpdateTime();
  } catch (error) {
    console.error('Failed to get last RSS update time:', error);
    return null;
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

/**
 * Handle second-instance event
 *
 * When a user tries to launch a second instance, this event is fired in the
 * primary instance. We focus the existing main window instead of creating a new one.
 */
app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
  log.info('[App] Second instance launch detected, focusing existing window');

  // Restore and focus the main window
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
      log.info('[App] Window was minimized, restored');
    }
    mainWindow.show();
    mainWindow.focus();
    log.info('[App] Main window focused');
  } else {
    log.warn('[App] No main window found to focus');
  }
});

app.whenReady().then(async () => {
  configManager = new ConfigManager();
  const serverConfig = configManager.getServerConfig();
  serverClient = new HagicoServerClient(serverConfig);

  // Initialize Region Detector
  regionDetector = new RegionDetector(configManager.getStore() as unknown as Store<Record<string, unknown>>);
  const detection = regionDetector.detectWithCache();
  console.log(`[App] Region detected: ${detection.region} (method: ${detection.method})`);

  // Initialize LLM Installation Manager (after ClaudeConfigManager is initialized later)
  // Will be properly initialized after ClaudeConfigManager

  // Initialize Web Service Manager
  const webServiceConfig: WebServiceConfig = {
    host: 'localhost',
    port: 36556, // Default port for embedded web service
  };
  webServiceManager = new PCodeWebServiceManager(webServiceConfig);

  // Set webServiceManager reference for tray
  setWebServiceManagerRef(webServiceManager);

  // Initialize Dependency Manager with store
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

  // Initialize Preset Services first (before ClaudeConfigManager)
  initializePresetServices();
  log.info('[App] Preset services initialized');

  // Initialize Claude Config Manager with PresetLoader
  const presetLoader = getPresetLoader();
  claudeConfigManager = new ClaudeConfigManager(
    configManager.getStore() as unknown as Store<Record<string, unknown>>,
    presetLoader || undefined
  );
  log.info('[App] Claude Config Manager initialized');

  // Initialize LLM Installation Manager (after ClaudeConfigManager)
  llmInstallationManager = new LlmInstallationManager(
    regionDetector,
    claudeConfigManager
  );
  log.info('[App] LLM Installation Manager initialized');

  // Initialize RSS Feed Manager
  rssFeedManager = RSSFeedManager.getInstance(
    {
      feedUrl: DEFAULT_RSS_FEED_URL,
      refreshInterval: 24 * 60 * 60 * 1000, // 24 hours
      maxItems: 20,
      storeKey: 'rssFeed',
    },
    configManager.getStore() as unknown as Store
  );
  log.info('[App] RSS Feed Manager initialized');

  // Start auto-refresh for RSS feed
  rssFeedManager.startAutoRefresh();

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
    if (rssFeedManager) {
      rssFeedManager.destroy();
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
