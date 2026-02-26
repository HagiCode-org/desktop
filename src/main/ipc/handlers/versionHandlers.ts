import { ipcMain, BrowserWindow, shell } from 'electron';
import fs from 'node:fs/promises';
import log from 'electron-log';
import { VersionManager } from '../../version-manager.js';
import { DependencyManager } from '../../dependency-manager.js';
import { PCodeWebServiceManager } from '../../web-service-manager.js';
import { ConfigManager } from '../../config.js';

// Module state
interface VersionHandlerState {
  versionManager: VersionManager | null;
  dependencyManager: DependencyManager | null;
  webServiceManager: PCodeWebServiceManager | null;
  mainWindow: BrowserWindow | null;
  configManager: ConfigManager | null;
}

const state: VersionHandlerState = {
  versionManager: null,
  dependencyManager: null,
  webServiceManager: null,
  mainWindow: null,
  configManager: null,
};

/**
 * Initialize version handlers with dependencies
 */
export function initVersionHandlers(
  versionManager: VersionManager | null,
  dependencyManager: DependencyManager | null,
  webServiceManager: PCodeWebServiceManager | null,
  mainWindow: BrowserWindow | null,
  configManager: ConfigManager | null
): void {
  state.versionManager = versionManager;
  state.dependencyManager = dependencyManager;
  state.webServiceManager = webServiceManager;
  state.mainWindow = mainWindow;
  state.configManager = configManager;
}

/**
 * Register version management IPC handlers
 */
export function registerVersionHandlers(deps: {
  versionManager: VersionManager | null;
  dependencyManager: DependencyManager | null;
  webServiceManager: PCodeWebServiceManager | null;
  mainWindow: BrowserWindow | null;
  configManager: ConfigManager | null;
}): void {
  state.versionManager = deps.versionManager;
  state.dependencyManager = deps.dependencyManager;
  state.webServiceManager = deps.webServiceManager;
  state.mainWindow = deps.mainWindow;
  state.configManager = deps.configManager;

  // Version list handler
  ipcMain.handle('version:list', async () => {
    if (!state.versionManager) {
      return [];
    }
    try {
      return await state.versionManager.listVersions();
    } catch (error) {
      console.error('Failed to list versions:', error);
      return [];
    }
  });

  // Version getInstalled handler
  ipcMain.handle('version:getInstalled', async () => {
    if (!state.versionManager) {
      return [];
    }
    try {
      return await state.versionManager.getInstalledVersions();
    } catch (error) {
      console.error('Failed to get installed versions:', error);
      return [];
    }
  });

  // Version getActive handler
  ipcMain.handle('version:getActive', async () => {
    if (!state.versionManager) {
      return null;
    }
    try {
      return await state.versionManager.getActiveVersion();
    } catch (error) {
      console.error('Failed to get active version:', error);
      return null;
    }
  });

  // Version install handler
  ipcMain.handle('version:install', async (_, versionId: string) => {
    if (!state.versionManager || !state.mainWindow || !state.webServiceManager) {
      return { success: false, error: 'Version manager not initialized' };
    }
    try {
      const result = await state.versionManager.installVersion(versionId);

      if (result.success) {
        const activeVersion = await state.versionManager.getActiveVersion();
        if (activeVersion) {
          state.webServiceManager.setActiveVersion(activeVersion.id);
        }
      }

      const installedVersions = await state.versionManager.getInstalledVersions();
      state.mainWindow?.webContents.send('version:installedVersionsChanged', installedVersions);

      return result;
    } catch (error) {
      console.error('Failed to install version:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Version uninstall handler
  ipcMain.handle('version:uninstall', async (_, versionId: string) => {
    if (!state.versionManager || !state.mainWindow || !state.webServiceManager) {
      return false;
    }
    try {
      const activeVersion = await state.versionManager.getActiveVersion();
      const isActive = activeVersion?.id === versionId;

      const result = await state.versionManager.uninstallVersion(versionId);

      if (result && isActive) {
        state.webServiceManager.clearActiveVersion();
      }

      const installedVersions = await state.versionManager.getInstalledVersions();
      state.mainWindow?.webContents.send('version:installedVersionsChanged', installedVersions);

      return result;
    } catch (error) {
      console.error('Failed to uninstall version:', error);
      return false;
    }
  });

  // Version reinstall handler
  ipcMain.handle('version:reinstall', async (_, versionId: string) => {
    if (!state.versionManager || !state.mainWindow || !state.webServiceManager) {
      return false;
    }
    try {
      const result = await state.versionManager.reinstallVersion(versionId);

      const installedVersions = await state.versionManager.getInstalledVersions();
      state.mainWindow?.webContents.send('version:installedVersionsChanged', installedVersions);

      const activeVersion = await state.versionManager.getActiveVersion();
      state.mainWindow?.webContents.send('version:activeVersionChanged', activeVersion);

      return result.success;
    } catch (error) {
      console.error('Failed to reinstall version:', error);
      return false;
    }
  });

  // Version switch handler
  ipcMain.handle('version:switch', async (_, versionId: string) => {
    if (!state.versionManager || !state.mainWindow || !state.webServiceManager) {
      return false;
    }
    try {
      const result = await state.versionManager.switchVersion(versionId);

      if (result.success) {
        state.webServiceManager.setActiveVersion(versionId);

        const activeVersion = await state.versionManager.getActiveVersion();
        state.mainWindow?.webContents.send('version:activeVersionChanged', activeVersion);

        if (result.warning) {
          state.mainWindow?.webContents.send('version:dependencyWarning', result.warning);
        }
      }

      return result.success;
    } catch (error) {
      console.error('Failed to switch version:', error);
      return false;
    }
  });

  // Version checkDependencies handler
  ipcMain.handle('version:checkDependencies', async (_, versionId: string) => {
    if (!state.versionManager) {
      return [];
    }
    try {
      const dependencies = await state.versionManager.checkVersionDependencies(versionId);

      const debugMode = state.configManager?.getStore().get('debugMode') as { ignoreDependencyCheck: boolean } | undefined;
      if (debugMode?.ignoreDependencyCheck) {
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

  // Version openLogs handler
  ipcMain.handle('version:openLogs', async (_, versionId: string) => {
    if (!state.versionManager) {
      return {
        success: false,
        error: 'Version manager not initialized'
      };
    }

    try {
      const logsPath = state.versionManager.getLogsPath(versionId);

      try {
        await fs.access(logsPath);
      } catch {
        log.warn('[VersionHandlers] Logs directory not found:', logsPath);
        return {
          success: false,
          error: 'logs_not_found'
        };
      }

      await shell.openPath(logsPath);
      log.info('[VersionHandlers] Opened logs folder:', logsPath);

      return { success: true };
    } catch (error) {
      log.error('[VersionHandlers] Failed to open logs folder:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Version setChannel handler
  ipcMain.handle('version:setChannel', async (_, channel: string) => {
    if (!state.versionManager) {
      return {
        success: false,
        error: 'Version manager not initialized'
      };
    }
    try {
      const currentConfig = state.versionManager.getCurrentSourceConfig();
      if (!currentConfig) {
        return {
          success: false,
          error: 'No active package source'
        };
      }

      const packageSourceConfigManager = (state.versionManager as any).packageSourceConfigManager;
      packageSourceConfigManager.updateSource(currentConfig.id, {
        defaultChannel: channel
      });

      log.info('[VersionHandlers] Channel preference saved:', channel);
      return { success: true };
    } catch (error) {
      log.error('[VersionHandlers] Failed to set channel preference:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Install web service package handler
  ipcMain.handle('install-web-service-package', async (_, version: string) => {
    if (!state.versionManager || !state.mainWindow || !state.webServiceManager) {
      return false;
    }
    try {
      console.log('[VersionHandlers] Installing/reinstalling web service package:', version);

      const installedVersions = await state.versionManager.getInstalledVersions();
      const isInstalled = installedVersions.some((v: any) => v.id === version);

      let success = false;

      if (isInstalled) {
        console.log('[VersionHandlers] Version already installed, performing reinstall');
        const reinstallResult = await state.versionManager.reinstallVersion(version);
        success = reinstallResult.success;
      } else {
        const installResult = await state.versionManager.installVersion(version);
        success = installResult.success;
      }

      if (success) {
        const activeVersion = await state.versionManager.getActiveVersion();
        if (activeVersion) {
          state.webServiceManager.setActiveVersion(activeVersion.id);
        }

        const updatedVersions = await state.versionManager.getInstalledVersions();
        state.mainWindow?.webContents.send('version:installedVersionsChanged', updatedVersions);
      }

      return success;
    } catch (error) {
      console.error('Failed to install/reinstall web service package:', error);
      return false;
    }
  });

  // Check package installation handler
  ipcMain.handle('check-package-installation', async () => {
    if (!state.versionManager) {
      return {
        version: 'none',
        platform: 'unknown',
        installedPath: '',
        isInstalled: false,
      };
    }
    try {
      const activeVersion = await state.versionManager.getActiveVersion();
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

  // Get available versions handler
  ipcMain.handle('get-available-versions', async () => {
    if (!state.versionManager) {
      return [];
    }
    try {
      const versions = await state.versionManager.listVersions();
      return versions.map(v => v.id);
    } catch (error) {
      console.error('Failed to get available versions:', error);
      return [];
    }
  });

  // Get platform handler
  ipcMain.handle('get-platform', async () => {
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

  console.log('[IPC] Version handlers registered');
}
