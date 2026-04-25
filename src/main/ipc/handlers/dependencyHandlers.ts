import { ipcMain, BrowserWindow, app } from 'electron';
import log from 'electron-log';
import { VersionManager } from '../../version-manager.js';
import { DependencyManager } from '../../dependency-manager.js';
import { manifestReader } from '../../manifest-reader.js';
import { BundledNodeRuntimeManager } from '../../bundled-node-runtime-manager.js';

// Module state
interface DependencyHandlerState {
  versionManager: VersionManager | null;
  dependencyManager: DependencyManager | null;
  mainWindow: BrowserWindow | null;
}

const state: DependencyHandlerState = {
  versionManager: null,
  dependencyManager: null,
  mainWindow: null,
};

/**
 * Initialize dependency handlers with dependencies
 */
export function initDependencyHandlers(
  versionManager: VersionManager | null,
  dependencyManager: DependencyManager | null,
  mainWindow: BrowserWindow | null,
): void {
  state.versionManager = versionManager;
  state.dependencyManager = dependencyManager;
  state.mainWindow = mainWindow;
}

/**
 * Register dependency management IPC handlers
 */
export function registerDependencyHandlers(deps: {
  versionManager: VersionManager | null;
  dependencyManager: DependencyManager | null;
  mainWindow: BrowserWindow | null;
}): void {
  state.versionManager = deps.versionManager;
  state.dependencyManager = deps.dependencyManager;
  state.mainWindow = deps.mainWindow;

  // Check dependencies handler
  ipcMain.handle('check-dependencies', async () => {
    if (!state.dependencyManager) {
      return [];
    }
    try {
      return await state.dependencyManager.checkAllDependencies();
    } catch (error) {
      console.error('Failed to check dependencies:', error);
      return [];
    }
  });

  ipcMain.handle('dependency:get-bundled-toolchain-status', async () => {
    try {
      return await new BundledNodeRuntimeManager().verify();
    } catch (error) {
      log.error('[DependencyHandlers] Failed to verify bundled toolchain:', error);
      return {
        available: false,
        integrity: 'corrupt',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  });

  ipcMain.handle('dependency:refresh-bundled-toolchain-status', async () => {
    try {
      return await new BundledNodeRuntimeManager().verify();
    } catch (error) {
      log.error('[DependencyHandlers] Failed to refresh bundled toolchain:', error);
      return {
        available: false,
        integrity: 'corrupt',
        errors: [error instanceof Error ? error.message : String(error)],
      };
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
      log.info('[DependencyHandlers] Building manual dependency handoff for version:', versionId);

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

      const updatedDependencies = await state.versionManager.checkVersionDependencies(versionId);
      state.mainWindow?.webContents.send('dependency-status-changed', updatedDependencies);
      const manualAction = state.dependencyManager.buildManualActionPlan(checkedDependencies);
      const error = manualAction?.message ?? state.dependencyManager.getManualDependencyHandoffMessage();

      log.info('[DependencyHandlers] Dependency installation request deferred to manual handoff');

      return {
        success: false,
        status: 'manual-action-required',
        error,
        manualAction,
        result: {
          success: [],
          failed: missingDependencies.map((dep) => ({
            dependency: dep.name,
            error,
          })),
        },
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
      log.info('[DependencyHandlers] Building manual dependency handoff for single dependency:', dependencyKey, 'for version:', versionId);

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

      const checkedDependencies = await state.dependencyManager.checkFromManifest([targetDep], null);
      const checkedDependency = checkedDependencies[0];
      const updatedDependencies = await state.versionManager.checkVersionDependencies(versionId);
      state.mainWindow?.webContents.send('dependency-status-changed', updatedDependencies);
      const error = checkedDependency?.description ?? state.dependencyManager.getManualDependencyHandoffMessage();

      log.info('[DependencyHandlers] Single dependency installation request deferred to manual handoff');

      return {
        success: false,
        status: 'manual-action-required',
        error,
        manualAction: checkedDependency?.manualAction,
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
      const dependencies = await state.versionManager.checkVersionDependencies(versionId);
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
      return await state.versionManager.checkVersionDependencies(versionId);
    } catch (error) {
      log.error('[DependencyHandlers] Failed to get all dependencies:', error);
      return [];
    }
  });

  // Dependency get list handler
  ipcMain.handle('dependency:get-list', async (_, versionId: string) => {
    if (!state.versionManager || !state.dependencyManager) {
      return [];
    }

    try {
      const installPath = await state.versionManager.resolveVersionInstallPath(versionId);
      if (!installPath) {
        return [];
      }

      return await state.dependencyManager.getDependencyListFromManifest(installPath);
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
      log.info('[DependencyHandlers] Dependency command execution request deferred to manual handoff:', commands.length, 'commands');
      return {
        success: false,
        status: 'manual-action-required',
        error: state.dependencyManager.getManualDependencyHandoffMessage(),
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
