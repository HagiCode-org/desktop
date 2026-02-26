import { ipcMain, BrowserWindow, app } from 'electron';
import log from 'electron-log';
import { VersionManager } from '../../version-manager.js';
import { DependencyManager } from '../../dependency-manager.js';
import { PCodeWebServiceManager } from '../../web-service-manager.js';
import { ConfigManager } from '../../config.js';
import { manifestReader } from '../../manifest-reader.js';

// Module state
interface DependencyHandlerState {
  versionManager: VersionManager | null;
  dependencyManager: DependencyManager | null;
  mainWindow: BrowserWindow | null;
  configManager: ConfigManager | null;
}

const state: DependencyHandlerState = {
  versionManager: null,
  dependencyManager: null,
  mainWindow: null,
  configManager: null,
};

/**
 * Initialize dependency handlers with dependencies
 */
export function initDependencyHandlers(
  versionManager: VersionManager | null,
  dependencyManager: DependencyManager | null,
  mainWindow: BrowserWindow | null,
  configManager: ConfigManager | null
): void {
  state.versionManager = versionManager;
  state.dependencyManager = dependencyManager;
  state.mainWindow = mainWindow;
  state.configManager = configManager;
}

/**
 * Register dependency management IPC handlers
 */
export function registerDependencyHandlers(deps: {
  versionManager: VersionManager | null;
  dependencyManager: DependencyManager | null;
  mainWindow: BrowserWindow | null;
  configManager: ConfigManager | null;
}): void {
  state.versionManager = deps.versionManager;
  state.dependencyManager = deps.dependencyManager;
  state.mainWindow = deps.mainWindow;
  state.configManager = deps.configManager;

  // Check dependencies handler
  ipcMain.handle('check-dependencies', async () => {
    if (!state.dependencyManager) {
      return [];
    }
    try {
      const dependencies = await state.dependencyManager.checkAllDependencies();

      const debugMode = state.configManager?.getStore().get('debugMode') as { ignoreDependencyCheck: boolean } | undefined;
      if (debugMode?.ignoreDependencyCheck) {
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

  // Dependency install from manifest handler
  ipcMain.handle('dependency:install-from-manifest', async (_, versionId: string) => {
    if (!state.versionManager || !state.dependencyManager) {
      return {
        success: false,
        error: 'Version manager or dependency manager not initialized'
      };
    }

    try {
      log.info('[DependencyHandlers] Installing dependencies from manifest for version:', versionId);

      const installedVersions = await state.versionManager.getInstalledVersions();
      const targetVersion = installedVersions.find(v => v.id === versionId);

      if (!targetVersion) {
        return {
          success: false,
          error: 'Version not installed'
        };
      }

      const manifest = await manifestReader.readManifest(targetVersion.installedPath);

      if (!manifest) {
        return {
          success: false,
          error: 'Manifest not found'
        };
      }

      const allDependencies = manifestReader.parseDependencies(manifest);

      state.dependencyManager.setManifest(manifest);

      const checkedDependencies = await state.dependencyManager.checkFromManifest(allDependencies, null);

      const missingDependencies = allDependencies.filter((dep) => {
        const checkedDep = checkedDependencies.find(cd => cd.name === dep.name);
        return !checkedDep || !checkedDep.installed || checkedDep.versionMismatch;
      });

      log.info('[DependencyHandlers] Total dependencies:', allDependencies.length, 'Missing:', missingDependencies.length);

      if (missingDependencies.length === 0) {
        log.info('[DependencyHandlers] All dependencies are already installed');
        return {
          success: true,
          result: {
            success: [],
            failed: []
          }
        };
      }

      const result = await state.dependencyManager.installFromManifest(
        manifest,
        missingDependencies,
        (progress) => {
          state.mainWindow?.webContents.send('dependency:install-progress', progress);
        }
      );

      await state.versionManager.checkVersionDependencies(versionId);

      const updatedDependencies = await state.versionManager.checkVersionDependencies(versionId);
      state.mainWindow?.webContents.send('dependency-status-changed', updatedDependencies);

      const allInstalledVersions = await state.versionManager.getInstalledVersions();
      state.mainWindow?.webContents.send('version:installedVersionsChanged', allInstalledVersions);

      return {
        success: true,
        result
      };
    } catch (error) {
      log.error('[DependencyHandlers] Failed to install dependencies from manifest:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Dependency install single handler
  ipcMain.handle('dependency:install-single', async (_, dependencyKey: string, versionId: string) => {
    if (!state.versionManager || !state.dependencyManager) {
      return {
        success: false,
        error: 'Version manager or dependency manager not initialized'
      };
    }

    try {
      log.info('[DependencyHandlers] Installing single dependency:', dependencyKey, 'for version:', versionId);

      const installedVersions = await state.versionManager.getInstalledVersions();
      const targetVersion = installedVersions.find(v => v.id === versionId);

      if (!targetVersion) {
        return {
          success: false,
          error: 'Version not installed'
        };
      }

      const manifest = await manifestReader.readManifest(targetVersion.installedPath);

      if (!manifest) {
        return {
          success: false,
          error: 'Manifest not found'
        };
      }

      const dependencies = manifestReader.parseDependencies(manifest);
      const targetDep = dependencies.find(d => d.key === dependencyKey);

      if (!targetDep) {
        return {
          success: false,
          error: `Dependency ${dependencyKey} not found in manifest`
        };
      }

      state.dependencyManager.setManifest(manifest);

      state.mainWindow?.webContents.send('dependency:command-progress', {
        type: 'command-info',
        checkCommand: targetDep.checkCommand,
        installCommand: targetDep.installCommand,
      });

      const installResult = await state.dependencyManager.installSingleDependency(targetDep, null);

      if (!installResult.success) {
        const errorMsg = installResult.parsedResult.errorMessage || 'Installation failed';
        return {
          success: false,
          error: errorMsg,
        };
      }

      await state.versionManager.checkVersionDependencies(versionId);

      const updatedDependencies = await state.versionManager.checkVersionDependencies(versionId);
      state.mainWindow?.webContents.send('dependency-status-changed', updatedDependencies);

      const allInstalledVersions = await state.versionManager.getInstalledVersions();
      state.mainWindow?.webContents.send('version:installedVersionsChanged', allInstalledVersions);

      return {
        success: true,
        checkCommand: targetDep.checkCommand,
      };
    } catch (error) {
      log.error('[DependencyHandlers] Failed to install single dependency:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Dependency get missing handler
  ipcMain.handle('dependency:get-missing', async (_, versionId: string) => {
    if (!state.versionManager) {
      return [];
    }

    try {
      let dependencies = await state.versionManager.checkVersionDependencies(versionId);

      const debugMode = state.configManager?.getStore().get('debugMode') as { ignoreDependencyCheck: boolean } | undefined;
      if (debugMode?.ignoreDependencyCheck) {
        return dependencies.map(dep => ({
          ...dep,
          installed: false,
          versionMismatch: true,
        }));
      }

      return dependencies.filter(dep => !dep.installed || dep.versionMismatch);
    } catch (error) {
      log.error('[DependencyHandlers] Failed to get missing dependencies:', error);
      return [];
    }
  });

  // Dependency get all handler
  ipcMain.handle('dependency:get-all', async (_, versionId: string) => {
    if (!state.versionManager) {
      return [];
    }

    try {
      let dependencies = await state.versionManager.checkVersionDependencies(versionId);

      const debugMode = state.configManager?.getStore().get('debugMode') as { ignoreDependencyCheck: boolean } | undefined;
      if (debugMode?.ignoreDependencyCheck) {
        return dependencies.map(dep => ({
          ...dep,
          installed: false,
          versionMismatch: true,
        }));
      }

      return dependencies;
    } catch (error) {
      log.error('[DependencyHandlers] Failed to get all dependencies:', error);
      return [];
    }
  });

  // Dependency get list handler
  ipcMain.handle('dependency:get-list', async (_, versionId: string) => {
    if (!state.versionManager) {
      return [];
    }

    try {
      const dependencies = await state.versionManager.getDependencyListFromManifest(versionId);
      return dependencies;
    } catch (error) {
      log.error('[DependencyHandlers] Failed to get dependency list:', error);
      return [];
    }
  });

  // Dependency execute commands handler
  ipcMain.handle('dependency:execute-commands', async (_, commands: string[], workingDirectory?: string) => {
    if (!state.dependencyManager) {
      return {
        success: false,
        error: 'Dependency manager not initialized'
      };
    }

    try {
      log.info('[DependencyHandlers] Executing install commands:', commands.length, 'commands');

      let workDir = workingDirectory;
      if (!workDir) {
        const activeVersion = await state.versionManager?.getActiveVersion();
        if (activeVersion) {
          workDir = activeVersion.installedPath;
        } else {
          workDir = app.getPath('userData');
        }
      }

      log.info('[DependencyHandlers] Skipping command execution (now handled by AI)');
      return {
        success: false,
        error: 'Command execution now handled by AI'
      };
    } catch (error) {
      log.error('[DependencyHandlers] Failed to execute install commands:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  console.log('[IPC] Dependency handlers registered');
}
