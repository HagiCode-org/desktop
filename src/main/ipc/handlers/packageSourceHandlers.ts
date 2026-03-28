import { ipcMain, BrowserWindow } from 'electron';
import { VersionManager } from '../../version-manager.js';

interface PackageSourceHandlerState {
  versionManager: VersionManager | null;
  mainWindow: BrowserWindow | null;
}

const state: PackageSourceHandlerState = {
  versionManager: null,
  mainWindow: null,
};

export function initPackageSourceHandlers(
  versionManager: VersionManager | null,
  mainWindow: BrowserWindow | null,
): void {
  state.versionManager = versionManager;
  state.mainWindow = mainWindow;
}

export function registerPackageSourceHandlers(deps: {
  versionManager: VersionManager | null;
  mainWindow: BrowserWindow | null;
}): void {
  state.versionManager = deps.versionManager;
  state.mainWindow = deps.mainWindow;

  ipcMain.handle('package-source:get-config', async () => {
    if (!state.versionManager) {
      return null;
    }
    try {
      return state.versionManager.getCurrentSourceConfig();
    } catch (error) {
      console.error('Failed to get package source config:', error);
      return null;
    }
  });

  ipcMain.handle('package-source:get-all-configs', async () => {
    if (!state.versionManager) {
      return [];
    }
    try {
      return state.versionManager.getAllSourceConfigs();
    } catch (error) {
      console.error('Failed to get all package source configs:', error);
      return [];
    }
  });

  ipcMain.handle('package-source:set-config', async (_, config) => {
    if (!state.versionManager) {
      return { success: false, error: 'Version manager not initialized' };
    }
    try {
      const success = await state.versionManager.setSourceConfig(config);
      if (success) {
        const newConfig = state.versionManager.getCurrentSourceConfig();
        state.mainWindow?.webContents.send('package-source:configChanged', newConfig);
        state.mainWindow?.webContents.send('version:list:changed');
      }
      return { success };
    } catch (error) {
      console.error('Failed to set package source config:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('package-source:switch-source', async (_, sourceId: string) => {
    if (!state.versionManager) {
      return { success: false, error: 'Version manager not initialized' };
    }
    try {
      const success = await state.versionManager.switchSource(sourceId);
      if (success) {
        const newConfig = state.versionManager.getCurrentSourceConfig();
        state.mainWindow?.webContents.send('package-source:configChanged', newConfig);
        state.mainWindow?.webContents.send('version:list:changed');
      }
      return { success };
    } catch (error) {
      console.error('Failed to switch package source:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('package-source:validate-config', async (_, config) => {
    if (!state.versionManager) {
      return { valid: false, error: 'Version manager not initialized' };
    }
    try {
      return await state.versionManager.validateSourceConfig(config);
    } catch (error) {
      console.error('Failed to validate package source config:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('package-source:scan-folder', async (_, folderPath: string) => {
    if (!state.versionManager) {
      return { success: false, error: 'Version manager not initialized', versions: [] };
    }
    try {
      const tempConfig = {
        type: 'local-folder' as const,
        path: folderPath,
        name: 'Temporary scan',
      };

      const validationResult = await state.versionManager.validateSourceConfig(tempConfig);
      if (!validationResult.valid) {
        return {
          success: false,
          error: validationResult.error || 'Invalid folder path',
          versions: [],
        };
      }

      const { LocalFolderPackageSource } = await import('../../package-sources/local-folder-source.js');
      const tempSource = new LocalFolderPackageSource(tempConfig);
      const versions = await tempSource.listAvailableVersions();

      return {
        success: true,
        versions,
        count: versions.length,
      };
    } catch (error) {
      console.error('Failed to scan folder:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        versions: [],
      };
    }
  });

  ipcMain.handle('package-source:fetch-http-index', async (_, config: { indexUrl: string; baseUrl?: string; authToken?: string }) => {
    if (!state.versionManager) {
      return { success: false, error: 'Version manager not initialized', versions: [] };
    }
    try {
      const httpIndexConfig = {
        type: 'http-index' as const,
        ...config,
      };

      const validationResult = await state.versionManager.validateSourceConfig(httpIndexConfig);
      if (!validationResult.valid) {
        return {
          success: false,
          error: validationResult.error || 'Invalid HTTP index configuration',
          versions: [],
        };
      }

      const { HttpIndexPackageSource } = await import('../../package-sources/http-index-source.js');
      const tempSource = new HttpIndexPackageSource(httpIndexConfig);
      const versions = await tempSource.listAvailableVersions();

      return {
        success: true,
        versions,
        count: versions.length,
      };
    } catch (error) {
      console.error('Failed to fetch HTTP index:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        versions: [],
      };
    }
  });

  console.log('[IPC] Package source handlers registered');
}
