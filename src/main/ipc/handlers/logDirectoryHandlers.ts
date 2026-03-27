import { app, ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import log from 'electron-log';
import { createLogDirectoryService } from '../../log-directory-service.js';
import { VersionManager } from '../../version-manager.js';
import type { LogDirectoryTarget } from '../../../types/log-directory.js';

interface LogDirectoryHandlerState {
  versionManager: VersionManager | null;
}

const state: LogDirectoryHandlerState = {
  versionManager: null,
};

function createService() {
  return createLogDirectoryService({
    getDesktopLogsPath: () => app.getPath('logs'),
    getActiveVersion: async () => state.versionManager?.getActiveVersion() ?? null,
    getVersionLogsPath: (versionId) => {
      if (!state.versionManager) {
        throw new Error('Version manager not initialized');
      }

      return state.versionManager.getLogsPath(versionId);
    },
    access: (targetPath) => fs.access(targetPath),
    openPath: (targetPath) => shell.openPath(targetPath),
    logger: log,
  });
}

export function initLogDirectoryHandlers(versionManager: VersionManager | null): void {
  state.versionManager = versionManager;
}

export function registerLogDirectoryHandlers(deps: {
  versionManager: VersionManager | null;
}): void {
  state.versionManager = deps.versionManager;

  ipcMain.handle('log-directory:list-targets', async () => {
    try {
      return await createService().listTargets();
    } catch (error) {
      log.error('[LogDirectoryHandlers] Failed to list targets:', error);
      return [];
    }
  });

  ipcMain.handle('log-directory:open', async (_, target: LogDirectoryTarget) => {
    try {
      return await createService().open(target);
    } catch (error) {
      log.error('[LogDirectoryHandlers] Failed to open log directory:', {
        target,
        error,
      });
      return {
        success: false,
        error: 'open_failed' as const,
      };
    }
  });
}
