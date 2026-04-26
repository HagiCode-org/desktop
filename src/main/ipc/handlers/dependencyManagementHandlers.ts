import { BrowserWindow, ipcMain } from 'electron';
import type DependencyManagementService from '../../dependency-management-service.js';
import {
  type DependencyManagementBatchSyncRequest,
  dependencyManagementChannels,
  legacyDependencyManagementChannels,
  type NpmMirrorSettingsInput,
} from '../../../types/dependency-management.js';

interface DependencyManagementHandlerState {
  dependencyManagementService: DependencyManagementService | null;
  mainWindow: BrowserWindow | null;
  unsubscribeProgress: (() => void) | null;
}

const state: DependencyManagementHandlerState = {
  dependencyManagementService: null,
  mainWindow: null,
  unsubscribeProgress: null,
};

export function initDependencyManagementHandlers(
  dependencyManagementService: DependencyManagementService | null,
  mainWindow: BrowserWindow | null,
): void {
  state.dependencyManagementService = dependencyManagementService;
  state.mainWindow = mainWindow;
}

export function registerDependencyManagementHandlers(deps: {
  dependencyManagementService: DependencyManagementService | null;
  mainWindow: BrowserWindow | null;
}): void {
  state.dependencyManagementService = deps.dependencyManagementService;
  state.mainWindow = deps.mainWindow;

  if (state.unsubscribeProgress) {
    state.unsubscribeProgress();
  }

  state.unsubscribeProgress = state.dependencyManagementService?.onProgress((event) => {
    const windows = BrowserWindow.getAllWindows();
    const targets = windows.length > 0 ? windows : [state.mainWindow].filter(Boolean) as BrowserWindow[];
    for (const target of targets) {
      if (!target.isDestroyed()) {
        target.webContents.send(dependencyManagementChannels.progress, event);
        target.webContents.send(legacyDependencyManagementChannels.progress, event);
      }
    }
  }) ?? null;

  const handleSnapshot = async () => {
    if (!state.dependencyManagementService) {
      throw new Error('DependencyManagementService is not initialized');
    }

    return state.dependencyManagementService.getSnapshot();
  };

  const handleRefresh = async () => {
    if (!state.dependencyManagementService) {
      throw new Error('DependencyManagementService is not initialized');
    }

    return state.dependencyManagementService.getSnapshot();
  };

  const handleGetMirrorSettings = async () => {
    if (!state.dependencyManagementService) {
      throw new Error('DependencyManagementService is not initialized');
    }

    return state.dependencyManagementService.getMirrorSettings();
  };

  const handleSetMirrorSettings = async (_event: Electron.IpcMainInvokeEvent, settings: NpmMirrorSettingsInput) => {
    if (!state.dependencyManagementService) {
      throw new Error('DependencyManagementService is not initialized');
    }

    return state.dependencyManagementService.setMirrorSettings(settings);
  };

  const handleInstall = async (_event: Electron.IpcMainInvokeEvent, packageId: string) => {
    if (!state.dependencyManagementService) {
      throw new Error('DependencyManagementService is not initialized');
    }

    return state.dependencyManagementService.install(packageId);
  };

  const handleUninstall = async (_event: Electron.IpcMainInvokeEvent, packageId: string) => {
    if (!state.dependencyManagementService) {
      throw new Error('DependencyManagementService is not initialized');
    }

    return state.dependencyManagementService.uninstall(packageId);
  };

  const handleSyncPackages = async (_event: Electron.IpcMainInvokeEvent, request: DependencyManagementBatchSyncRequest) => {
    if (!state.dependencyManagementService) {
      throw new Error('DependencyManagementService is not initialized');
    }

    return state.dependencyManagementService.syncPackages(request);
  };

  ipcMain.handle(dependencyManagementChannels.snapshot, handleSnapshot);
  ipcMain.handle(dependencyManagementChannels.refresh, handleRefresh);
  ipcMain.handle(dependencyManagementChannels.getMirrorSettings, handleGetMirrorSettings);
  ipcMain.handle(dependencyManagementChannels.setMirrorSettings, handleSetMirrorSettings);
  ipcMain.handle(dependencyManagementChannels.install, handleInstall);
  ipcMain.handle(dependencyManagementChannels.uninstall, handleUninstall);
  ipcMain.handle(dependencyManagementChannels.syncPackages, handleSyncPackages);

  ipcMain.handle(legacyDependencyManagementChannels.snapshot, handleSnapshot);
  ipcMain.handle(legacyDependencyManagementChannels.refresh, handleRefresh);
  ipcMain.handle(legacyDependencyManagementChannels.getMirrorSettings, handleGetMirrorSettings);
  ipcMain.handle(legacyDependencyManagementChannels.setMirrorSettings, handleSetMirrorSettings);
  ipcMain.handle(legacyDependencyManagementChannels.install, handleInstall);
  ipcMain.handle(legacyDependencyManagementChannels.uninstall, handleUninstall);
  ipcMain.handle(legacyDependencyManagementChannels.syncPackages, handleSyncPackages);
}
