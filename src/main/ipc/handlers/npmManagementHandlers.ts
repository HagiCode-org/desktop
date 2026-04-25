import { BrowserWindow, ipcMain } from 'electron';
import type NpmManagementService from '../../npm-management-service.js';
import { npmManagementChannels } from '../../../types/npm-management.js';

interface NpmManagementHandlerState {
  npmManagementService: NpmManagementService | null;
  mainWindow: BrowserWindow | null;
  unsubscribeProgress: (() => void) | null;
}

const state: NpmManagementHandlerState = {
  npmManagementService: null,
  mainWindow: null,
  unsubscribeProgress: null,
};

export function initNpmManagementHandlers(
  npmManagementService: NpmManagementService | null,
  mainWindow: BrowserWindow | null,
): void {
  state.npmManagementService = npmManagementService;
  state.mainWindow = mainWindow;
}

export function registerNpmManagementHandlers(deps: {
  npmManagementService: NpmManagementService | null;
  mainWindow: BrowserWindow | null;
}): void {
  state.npmManagementService = deps.npmManagementService;
  state.mainWindow = deps.mainWindow;

  if (state.unsubscribeProgress) {
    state.unsubscribeProgress();
  }

  state.unsubscribeProgress = state.npmManagementService?.onProgress((event) => {
    const windows = BrowserWindow.getAllWindows();
    const targets = windows.length > 0 ? windows : [state.mainWindow].filter(Boolean) as BrowserWindow[];
    for (const target of targets) {
      if (!target.isDestroyed()) {
        target.webContents.send(npmManagementChannels.progress, event);
      }
    }
  }) ?? null;

  ipcMain.handle(npmManagementChannels.snapshot, async () => {
    if (!state.npmManagementService) {
      throw new Error('NpmManagementService is not initialized');
    }

    return state.npmManagementService.getSnapshot();
  });

  ipcMain.handle(npmManagementChannels.refresh, async () => {
    if (!state.npmManagementService) {
      throw new Error('NpmManagementService is not initialized');
    }

    return state.npmManagementService.getSnapshot();
  });

  ipcMain.handle(npmManagementChannels.getMirrorSettings, async () => {
    if (!state.npmManagementService) {
      throw new Error('NpmManagementService is not initialized');
    }

    return state.npmManagementService.getMirrorSettings();
  });

  ipcMain.handle(npmManagementChannels.setMirrorSettings, async (_event, settings) => {
    if (!state.npmManagementService) {
      throw new Error('NpmManagementService is not initialized');
    }

    return state.npmManagementService.setMirrorSettings(settings);
  });

  ipcMain.handle(npmManagementChannels.install, async (_event, packageId: string) => {
    if (!state.npmManagementService) {
      throw new Error('NpmManagementService is not initialized');
    }

    return state.npmManagementService.install(packageId);
  });

  ipcMain.handle(npmManagementChannels.uninstall, async (_event, packageId: string) => {
    if (!state.npmManagementService) {
      throw new Error('NpmManagementService is not initialized');
    }

    return state.npmManagementService.uninstall(packageId);
  });

  ipcMain.handle(npmManagementChannels.syncPackages, async (_event, request) => {
    if (!state.npmManagementService) {
      throw new Error('NpmManagementService is not initialized');
    }

    return state.npmManagementService.syncPackages(request);
  });
}
