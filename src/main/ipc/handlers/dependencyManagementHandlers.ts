import { electron } from '../../../electron-api.js';
import type { BrowserWindow } from 'electron';
import log from 'electron-log';
import type DependencyManagementService from '../../dependency-management-service.js';
import {
  type DependencyManagementBatchSyncRequest,
  dependencyManagementChannels,
  legacyDependencyManagementChannels,
  type NpmMirrorSettingsInput,
} from '../../../types/dependency-management.js';

const { BrowserWindow: ElectronBrowserWindow, ipcMain } = electron;

interface DependencyManagementHandlerState {
  dependencyManagementService: DependencyManagementService | null;
  mainWindow: BrowserWindow | null;
  unsubscribeProgress: (() => void) | null;
  unsubscribeActivationProgress: (() => void) | null;
}

const state: DependencyManagementHandlerState = {
  dependencyManagementService: null,
  mainWindow: null,
  unsubscribeProgress: null,
  unsubscribeActivationProgress: null,
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
  if (state.unsubscribeActivationProgress) {
    state.unsubscribeActivationProgress();
  }

  state.unsubscribeProgress = state.dependencyManagementService?.onProgress((event) => {
    const windows = ElectronBrowserWindow.getAllWindows();
    const targets = windows.length > 0 ? windows : [state.mainWindow].filter(Boolean) as BrowserWindow[];
    for (const target of targets) {
      if (!target.isDestroyed()) {
        target.webContents.send(dependencyManagementChannels.progress, event);
        target.webContents.send(legacyDependencyManagementChannels.progress, event);
      }
    }
  }) ?? null;

  state.unsubscribeActivationProgress = state.dependencyManagementService?.onVendoredRuntimeActivationProgress((event) => {
    const windows = ElectronBrowserWindow.getAllWindows();
    const targets = windows.length > 0 ? windows : [state.mainWindow].filter(Boolean) as BrowserWindow[];
    for (const target of targets) {
      if (!target.isDestroyed()) {
        target.webContents.send(dependencyManagementChannels.vendoredRuntimeActivationProgress, event);
        target.webContents.send(legacyDependencyManagementChannels.vendoredRuntimeActivationProgress, event);
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

  const handleInstall = async (
    _event: Electron.IpcMainInvokeEvent,
    packageId: string,
  ) => {
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

    log.info('[DependencyManagementHandlers] syncPackages requested', {
      packageIds: request.packageIds,
    });

    return state.dependencyManagementService.syncPackages(request);
  };

  const handleUnsupportedVendoredRuntime = async (_event: Electron.IpcMainInvokeEvent, runtimeId: string) => {
    throw new Error(`Unsupported vendored runtime: ${runtimeId}`);
  };

  ipcMain.handle(dependencyManagementChannels.snapshot, handleSnapshot);
  ipcMain.handle(dependencyManagementChannels.refresh, handleRefresh);
  ipcMain.handle(dependencyManagementChannels.getMirrorSettings, handleGetMirrorSettings);
  ipcMain.handle(dependencyManagementChannels.setMirrorSettings, handleSetMirrorSettings);
  ipcMain.handle(dependencyManagementChannels.install, handleInstall);
  ipcMain.handle(dependencyManagementChannels.uninstall, handleUninstall);
  ipcMain.handle(dependencyManagementChannels.syncPackages, handleSyncPackages);
  ipcMain.handle(dependencyManagementChannels.enableVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.startVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.stopVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.restartVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.repairVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.openVendoredRuntimePath, handleUnsupportedVendoredRuntime);

  ipcMain.handle(legacyDependencyManagementChannels.snapshot, handleSnapshot);
  ipcMain.handle(legacyDependencyManagementChannels.refresh, handleRefresh);
  ipcMain.handle(legacyDependencyManagementChannels.getMirrorSettings, handleGetMirrorSettings);
  ipcMain.handle(legacyDependencyManagementChannels.setMirrorSettings, handleSetMirrorSettings);
  ipcMain.handle(legacyDependencyManagementChannels.install, handleInstall);
  ipcMain.handle(legacyDependencyManagementChannels.uninstall, handleUninstall);
  ipcMain.handle(legacyDependencyManagementChannels.syncPackages, handleSyncPackages);
  ipcMain.handle(legacyDependencyManagementChannels.enableVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(legacyDependencyManagementChannels.startVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(legacyDependencyManagementChannels.stopVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(legacyDependencyManagementChannels.restartVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(legacyDependencyManagementChannels.repairVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(legacyDependencyManagementChannels.openVendoredRuntimePath, handleUnsupportedVendoredRuntime);
}
