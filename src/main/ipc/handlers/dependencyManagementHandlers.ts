import { electron } from '../../../electron-api.js';
import type { BrowserWindow } from 'electron';
import type DependencyManagementService from '../../dependency-management-service.js';
import {
  dependencyManagementChannels,
  type NpmMirrorSettingsInput,
} from '../../../types/dependency-management.js';

const { BrowserWindow: ElectronBrowserWindow, ipcMain } = electron;

interface DependencyManagementHandlerState {
  dependencyManagementService: DependencyManagementService | null;
  mainWindow: BrowserWindow | null;
  unsubscribeActivationProgress: (() => void) | null;
}

const state: DependencyManagementHandlerState = {
  dependencyManagementService: null,
  mainWindow: null,
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

  if (state.unsubscribeActivationProgress) {
    state.unsubscribeActivationProgress();
  }

  state.unsubscribeActivationProgress = state.dependencyManagementService?.onVendoredRuntimeActivationProgress((event) => {
    const windows = ElectronBrowserWindow.getAllWindows();
    const targets = windows.length > 0 ? windows : [state.mainWindow].filter(Boolean) as BrowserWindow[];
    for (const target of targets) {
      if (!target.isDestroyed()) {
        target.webContents.send(dependencyManagementChannels.vendoredRuntimeActivationProgress, event);
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

  const handleUnsupportedVendoredRuntime = async (_event: Electron.IpcMainInvokeEvent, runtimeId: string) => {
    throw new Error(`Unsupported vendored runtime: ${runtimeId}`);
  };

  ipcMain.handle(dependencyManagementChannels.snapshot, handleSnapshot);
  ipcMain.handle(dependencyManagementChannels.refresh, handleRefresh);
  ipcMain.handle(dependencyManagementChannels.getMirrorSettings, handleGetMirrorSettings);
  ipcMain.handle(dependencyManagementChannels.setMirrorSettings, handleSetMirrorSettings);
  ipcMain.handle(dependencyManagementChannels.enableVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.startVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.stopVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.restartVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.repairVendoredRuntime, handleUnsupportedVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.openVendoredRuntimePath, handleUnsupportedVendoredRuntime);

}
