import { electron } from '../../../electron-api.js';
import type { BrowserWindow } from 'electron';
import type { CodeServerManager } from '../../code-server-manager.js';
import {
  codeServerChannels,
  type CodeServerConfigUpdatePayload,
  type CodeServerLifecycleAction,
  type CodeServerLogReadRequest,
  type CodeServerPathTarget,
  type CodeServerStatusSnapshot,
} from '../../../types/code-server-management.js';

const { ipcMain } = electron;

interface CodeServerHandlerState {
  manager: CodeServerManager | null;
  mainWindow: BrowserWindow | null;
}

const state: CodeServerHandlerState = {
  manager: null,
  mainWindow: null,
};

export function initCodeServerHandlers(manager: CodeServerManager | null, mainWindow: BrowserWindow | null): void {
  state.manager = manager;
  state.mainWindow = mainWindow;
}

export function emitCodeServerStatus(status: CodeServerStatusSnapshot): void {
  state.mainWindow?.webContents.send(codeServerChannels.statusChanged, status);
}

async function requireManager(): Promise<CodeServerManager> {
  if (!state.manager) {
    throw new Error('Code Server manager is not initialized');
  }
  return state.manager;
}

async function emitCurrentStatus(): Promise<CodeServerStatusSnapshot> {
  const manager = await requireManager();
  const status = await manager.getStatus();
  emitCodeServerStatus(status);
  return status;
}

async function toLifecycleResult(action: CodeServerLifecycleAction): Promise<{
  success: boolean;
  action: CodeServerLifecycleAction;
  status: CodeServerStatusSnapshot;
  error?: string;
}> {
  const manager = await requireManager();
  const result = action === 'start'
    ? await manager.start()
    : action === 'stop'
      ? await manager.stop()
      : action === 'restart'
        ? await manager.restart()
        : await manager.repair();

  const status = await emitCurrentStatus();
  return {
    success: result.success,
    action,
    status,
    error: result.error,
  };
}

export function registerCodeServerHandlers(deps: {
  manager: CodeServerManager | null;
  mainWindow: BrowserWindow | null;
}): void {
  state.manager = deps.manager;
  state.mainWindow = deps.mainWindow;

  ipcMain.handle(codeServerChannels.status, async () => {
    const manager = await requireManager();
    return manager.getStatus();
  });

  ipcMain.handle(codeServerChannels.start, async () => toLifecycleResult('start'));
  ipcMain.handle(codeServerChannels.stop, async () => toLifecycleResult('stop'));
  ipcMain.handle(codeServerChannels.restart, async () => toLifecycleResult('restart'));
  ipcMain.handle(codeServerChannels.repair, async () => toLifecycleResult('repair'));

  ipcMain.handle(codeServerChannels.getConfig, async () => {
    const manager = await requireManager();
    return manager.getConfig();
  });

  ipcMain.handle(codeServerChannels.setConfig, async (_event, payload: CodeServerConfigUpdatePayload) => {
    const manager = await requireManager();
    const result = await manager.setConfig(payload);
    emitCodeServerStatus(result.status);
    return result;
  });

  ipcMain.handle(codeServerChannels.readLog, async (_event, request: CodeServerLogReadRequest) => {
    const manager = await requireManager();
    return manager.readLog(request);
  });

  ipcMain.handle(codeServerChannels.openPath, async (_event, target: CodeServerPathTarget) => {
    const manager = await requireManager();
    const result = await manager.openManagedPath(target);
    await emitCurrentStatus();
    return result;
  });
}
