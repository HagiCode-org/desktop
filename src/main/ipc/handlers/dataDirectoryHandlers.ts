import { ipcMain, BrowserWindow, dialog } from 'electron';
import log from 'electron-log';
import { PathManager } from '../../path-manager.js';
import { ConfigManager as YamlConfigManager } from '../../config-manager.js';
import { ConfigManager } from '../../config.js';
import type {
  DataDirectoryMutationResult,
  DataDirectoryValidationPayload,
} from '../../../types/bootstrap.js';
import { resolveWebServiceConfigMode } from '../../web-service-env.js';

// Module state
interface DataDirectoryHandlerState {
  pathManager: PathManager | null;
  yamlConfigManager: YamlConfigManager | null;
  configManager: ConfigManager | null;
  mainWindow: BrowserWindow | null;
  invalidateBootstrapSnapshot?: (() => void) | null;
}

const state: DataDirectoryHandlerState = {
  pathManager: null,
  yamlConfigManager: null,
  configManager: null,
  mainWindow: null,
  invalidateBootstrapSnapshot: null,
};

/**
 * Initialize data directory handlers with dependencies
 */
export function initDataDirectoryHandlers(
  pathManager: PathManager | null,
  yamlConfigManager: YamlConfigManager | null,
  configManager: ConfigManager | null,
  mainWindow: BrowserWindow | null,
  invalidateBootstrapSnapshot?: (() => void) | null,
): void {
  state.pathManager = pathManager;
  state.yamlConfigManager = yamlConfigManager;
  state.configManager = configManager;
  state.mainWindow = mainWindow;
  state.invalidateBootstrapSnapshot = invalidateBootstrapSnapshot ?? state.invalidateBootstrapSnapshot ?? null;
}

/**
 * Register data directory IPC handlers
 */
export function registerDataDirectoryHandlers(deps: {
  pathManager: PathManager | null;
  yamlConfigManager: YamlConfigManager | null;
  configManager: ConfigManager | null;
  mainWindow: BrowserWindow | null;
  invalidateBootstrapSnapshot?: (() => void) | null;
}): void {
  state.pathManager = deps.pathManager;
  state.yamlConfigManager = deps.yamlConfigManager;
  state.configManager = deps.configManager;
  state.mainWindow = deps.mainWindow;
  state.invalidateBootstrapSnapshot = deps.invalidateBootstrapSnapshot ?? null;

  // Data directory open picker handler
  ipcMain.handle('data-directory:open-picker', async () => {
    try {
      if (!state.mainWindow) {
        return {
          canceled: true,
          error: 'Main window not available'
        };
      }

      const result = await dialog.showOpenDialog(state.mainWindow, {
        title: 'Select Data Directory',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Select Folder',
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { canceled: true };
      }

      return {
        canceled: false,
        filePath: result.filePaths[0]
      };
    } catch (error) {
      console.error('[DataDirectoryHandlers] Failed to open directory picker:', error);
      return {
        canceled: true,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Data directory get handler
  ipcMain.handle('data-directory:get', async () => {
    try {
      const currentPath = state.pathManager?.getDataDirectory() || '';
      return currentPath;
    } catch (error) {
      console.error('[DataDirectoryHandlers] Failed to get data directory:', error);
      throw error;
    }
  });

  // Data directory set handler
  ipcMain.handle('data-directory:set', async (_, dataDirPath: string): Promise<DataDirectoryMutationResult> => {
    try {
      if (!state.pathManager || !state.yamlConfigManager) {
        throw new Error('PathManager or YamlConfigManager not initialized');
      }

      const preparation = await state.pathManager.prepareDataDirectoryForBootstrap(dataDirPath, {
        source: 'configured',
        requestedPath: dataDirPath,
        defaultPath: state.pathManager.getDefaultDataDirectory(),
      });

      if (!preparation.isReady) {
        return {
          success: false,
          error: preparation.validation.message,
          diagnostic: preparation.diagnostic,
        };
      }

      state.configManager?.setDataDirectoryPath(preparation.context.normalizedPath);
      state.pathManager.applyDataDirectoryPath(preparation.context.normalizedPath);

      try {
        if (resolveWebServiceConfigMode(process.env.HAGICODE_WEB_SERVICE_CONFIG_MODE) === 'legacy-yaml') {
          const updatedVersions = await state.yamlConfigManager.updateAllDataDirs(preparation.context.normalizedPath);
          log.info('[DataDirectoryHandlers] Updated appsettings.yml for versions:', updatedVersions);
        } else {
          log.info('[DataDirectoryHandlers] Skipped YAML synchronization in env-managed mode.');
        }
      } catch (yamlError) {
        log.warn('[DataDirectoryHandlers] Failed to update appsettings.yml:', yamlError);
      }

      state.invalidateBootstrapSnapshot?.();

      return {
        success: true,
        path: preparation.context.normalizedPath,
      };
    } catch (error) {
      console.error('[DataDirectoryHandlers] Failed to set data directory:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Data directory validate handler
  ipcMain.handle('data-directory:validate', async (_, dataDirPath: string): Promise<DataDirectoryValidationPayload> => {
    try {
      if (!state.pathManager) {
        throw new Error('PathManager not initialized');
      }

      const validation = await state.pathManager.validatePath(dataDirPath);
      return {
        isValid: validation.isValid,
        message: validation.message,
        warnings: validation.warnings || [],
        normalizedPath: validation.normalizedPath,
        diagnostic: validation.diagnostic,
      };
    } catch (error) {
      console.error('[DataDirectoryHandlers] Failed to validate path:', error);
      return {
        isValid: false,
        message: error instanceof Error ? error.message : String(error),
        warnings: []
      };
    }
  });

  // Data directory get storage info handler
  ipcMain.handle('data-directory:get-storage-info', async (_, dataDirPath?: string) => {
    try {
      if (!state.pathManager) {
        throw new Error('PathManager not initialized');
      }

      const targetPath = dataDirPath || state.pathManager.getDataDirectory();
      const storageInfo = await state.pathManager.getStorageInfo(targetPath);
      return storageInfo;
    } catch (error) {
      console.error('[DataDirectoryHandlers] Failed to get storage info:', error);
      throw error;
    }
  });

  // Data directory restore default handler
  ipcMain.handle('data-directory:restore-default', async (): Promise<DataDirectoryMutationResult> => {
    try {
      if (!state.pathManager) {
        throw new Error('PathManager not initialized');
      }

      state.configManager?.clearDataDirectoryPath();
      const defaultPath = state.pathManager.getDefaultDataDirectory();
      const preparation = await state.pathManager.prepareDataDirectoryForBootstrap(defaultPath, {
        source: 'default',
        requestedPath: defaultPath,
        defaultPath,
      });

      if (!preparation.isReady) {
        return {
          success: false,
          error: preparation.validation.message,
          diagnostic: preparation.diagnostic,
        };
      }

      state.pathManager.applyDataDirectoryPath(preparation.context.normalizedPath);

      try {
        if (
          state.yamlConfigManager
          && resolveWebServiceConfigMode(process.env.HAGICODE_WEB_SERVICE_CONFIG_MODE) === 'legacy-yaml'
        ) {
          const updatedVersions = await state.yamlConfigManager.updateAllDataDirs(preparation.context.normalizedPath);
          log.info('[DataDirectoryHandlers] Restored default and updated appsettings.yml for versions:', updatedVersions);
        } else {
          log.info('[DataDirectoryHandlers] Skipped YAML synchronization while restoring default path.');
        }
      } catch (yamlError) {
        log.warn('[DataDirectoryHandlers] Failed to update appsettings.yml:', yamlError);
      }

      state.invalidateBootstrapSnapshot?.();

      return {
        success: true,
        path: preparation.context.normalizedPath,
      };
    } catch (error) {
      console.error('[DataDirectoryHandlers] Failed to restore default:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  console.log('[IPC] Data directory handlers registered');
}
