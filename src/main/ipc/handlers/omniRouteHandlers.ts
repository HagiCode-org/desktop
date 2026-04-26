import { BrowserWindow, ipcMain } from 'electron';
import type OmniRouteManager from '../../omniroute-manager.js';
import {
  omniRouteChannels,
  type OmniRouteConfigUpdatePayload,
  type OmniRouteLogReadRequest,
  type OmniRoutePathTarget,
  type OmniRouteStatusSnapshot,
} from '../../../types/omniroute-management.js';

interface OmniRouteHandlerState {
  manager: OmniRouteManager | null;
  mainWindow: BrowserWindow | null;
}

const state: OmniRouteHandlerState = {
  manager: null,
  mainWindow: null,
};

export function initOmniRouteHandlers(manager: OmniRouteManager | null, mainWindow: BrowserWindow | null): void {
  state.manager = manager;
  state.mainWindow = mainWindow;
}

export function emitOmniRouteStatus(status: OmniRouteStatusSnapshot): void {
  state.mainWindow?.webContents.send(omniRouteChannels.statusChanged, status);
}

async function requireManager(): Promise<OmniRouteManager> {
  if (!state.manager) {
    throw new Error('OmniRoute manager is not initialized');
  }
  return state.manager;
}

async function emitCurrentStatus(): Promise<OmniRouteStatusSnapshot> {
  const manager = await requireManager();
  const status = await manager.getStatus();
  emitOmniRouteStatus(status);
  return status;
}

export function registerOmniRouteHandlers(deps: {
  manager: OmniRouteManager | null;
  mainWindow: BrowserWindow | null;
}): void {
  state.manager = deps.manager;
  state.mainWindow = deps.mainWindow;

  ipcMain.handle(omniRouteChannels.status, async () => {
    const manager = await requireManager();
    return manager.getStatus();
  });

  ipcMain.handle(omniRouteChannels.start, async () => {
    const manager = await requireManager();
    const result = await manager.start();
    emitOmniRouteStatus(result.status);
    return result;
  });

  ipcMain.handle(omniRouteChannels.stop, async () => {
    const manager = await requireManager();
    const result = await manager.stop();
    emitOmniRouteStatus(result.status);
    return result;
  });

  ipcMain.handle(omniRouteChannels.restart, async () => {
    const manager = await requireManager();
    const result = await manager.restart();
    emitOmniRouteStatus(result.status);
    return result;
  });

  ipcMain.handle(omniRouteChannels.getConfig, async () => {
    const manager = await requireManager();
    return manager.getConfig();
  });

  ipcMain.handle(omniRouteChannels.setConfig, async (_event, payload: OmniRouteConfigUpdatePayload) => {
    const manager = await requireManager();
    const result = await manager.setConfig(payload);
    emitOmniRouteStatus(result.status);
    return result;
  });

  ipcMain.handle(omniRouteChannels.readLog, async (_event, request: OmniRouteLogReadRequest) => {
    const manager = await requireManager();
    return manager.readLog(request);
  });

  ipcMain.handle(omniRouteChannels.openPath, async (_event, target: OmniRoutePathTarget) => {
    const manager = await requireManager();
    const result = await manager.openManagedPath(target);
    await emitCurrentStatus();
    return result;
  });
}
