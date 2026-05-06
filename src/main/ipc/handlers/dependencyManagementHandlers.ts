import { BrowserWindow, ipcMain } from 'electron';
import type { CodeServerManager } from '../../code-server-manager.js';
import type DependencyManagementService from '../../dependency-management-service.js';
import {
  type DependencyManagementBatchSyncRequest,
  type VendoredRuntimeId,
  dependencyManagementChannels,
  legacyDependencyManagementChannels,
  type NpmMirrorSettingsInput,
} from '../../../types/dependency-management.js';

interface DependencyManagementHandlerState {
  dependencyManagementService: DependencyManagementService | null;
  codeServerManager: CodeServerManager | null;
  mainWindow: BrowserWindow | null;
  unsubscribeProgress: (() => void) | null;
}

const state: DependencyManagementHandlerState = {
  dependencyManagementService: null,
  codeServerManager: null,
  mainWindow: null,
  unsubscribeProgress: null,
};

export function initDependencyManagementHandlers(
  dependencyManagementService: DependencyManagementService | null,
  codeServerManager: CodeServerManager | null,
  mainWindow: BrowserWindow | null,
): void {
  state.dependencyManagementService = dependencyManagementService;
  state.codeServerManager = codeServerManager;
  state.mainWindow = mainWindow;
}

export function registerDependencyManagementHandlers(deps: {
  dependencyManagementService: DependencyManagementService | null;
  codeServerManager: CodeServerManager | null;
  mainWindow: BrowserWindow | null;
}): void {
  state.dependencyManagementService = deps.dependencyManagementService;
  state.codeServerManager = deps.codeServerManager;
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

  const requireCodeServerManager = (): CodeServerManager => {
    if (!state.codeServerManager) {
      throw new Error('CodeServerManager is not initialized');
    }
    return state.codeServerManager;
  };

  const assertCodeServerId = (runtimeId: VendoredRuntimeId): void => {
    if (runtimeId !== 'code-server') {
      throw new Error(`Unsupported vendored runtime: ${runtimeId}`);
    }
  };

  const handleStartVendoredRuntime = async (_event: Electron.IpcMainInvokeEvent, runtimeId: VendoredRuntimeId) => {
    assertCodeServerId(runtimeId);
    return requireCodeServerManager().start();
  };

  const handleStopVendoredRuntime = async (_event: Electron.IpcMainInvokeEvent, runtimeId: VendoredRuntimeId) => {
    assertCodeServerId(runtimeId);
    return requireCodeServerManager().stop();
  };

  const handleRestartVendoredRuntime = async (_event: Electron.IpcMainInvokeEvent, runtimeId: VendoredRuntimeId) => {
    assertCodeServerId(runtimeId);
    return requireCodeServerManager().restart();
  };

  const handleRepairVendoredRuntime = async (_event: Electron.IpcMainInvokeEvent, runtimeId: VendoredRuntimeId) => {
    assertCodeServerId(runtimeId);
    return requireCodeServerManager().repair();
  };

  const handleOpenVendoredRuntimePath = async (
    _event: Electron.IpcMainInvokeEvent,
    runtimeId: VendoredRuntimeId,
    target: 'logs' | 'runtime-root',
  ) => {
    assertCodeServerId(runtimeId);
    return requireCodeServerManager().openPath(target);
  };

  ipcMain.handle(dependencyManagementChannels.snapshot, handleSnapshot);
  ipcMain.handle(dependencyManagementChannels.refresh, handleRefresh);
  ipcMain.handle(dependencyManagementChannels.getMirrorSettings, handleGetMirrorSettings);
  ipcMain.handle(dependencyManagementChannels.setMirrorSettings, handleSetMirrorSettings);
  ipcMain.handle(dependencyManagementChannels.install, handleInstall);
  ipcMain.handle(dependencyManagementChannels.uninstall, handleUninstall);
  ipcMain.handle(dependencyManagementChannels.syncPackages, handleSyncPackages);
  ipcMain.handle(dependencyManagementChannels.startVendoredRuntime, handleStartVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.stopVendoredRuntime, handleStopVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.restartVendoredRuntime, handleRestartVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.repairVendoredRuntime, handleRepairVendoredRuntime);
  ipcMain.handle(dependencyManagementChannels.openVendoredRuntimePath, handleOpenVendoredRuntimePath);

  ipcMain.handle(legacyDependencyManagementChannels.snapshot, handleSnapshot);
  ipcMain.handle(legacyDependencyManagementChannels.refresh, handleRefresh);
  ipcMain.handle(legacyDependencyManagementChannels.getMirrorSettings, handleGetMirrorSettings);
  ipcMain.handle(legacyDependencyManagementChannels.setMirrorSettings, handleSetMirrorSettings);
  ipcMain.handle(legacyDependencyManagementChannels.install, handleInstall);
  ipcMain.handle(legacyDependencyManagementChannels.uninstall, handleUninstall);
  ipcMain.handle(legacyDependencyManagementChannels.syncPackages, handleSyncPackages);
  ipcMain.handle(legacyDependencyManagementChannels.startVendoredRuntime, handleStartVendoredRuntime);
  ipcMain.handle(legacyDependencyManagementChannels.stopVendoredRuntime, handleStopVendoredRuntime);
  ipcMain.handle(legacyDependencyManagementChannels.restartVendoredRuntime, handleRestartVendoredRuntime);
  ipcMain.handle(legacyDependencyManagementChannels.repairVendoredRuntime, handleRepairVendoredRuntime);
  ipcMain.handle(legacyDependencyManagementChannels.openVendoredRuntimePath, handleOpenVendoredRuntimePath);
}
