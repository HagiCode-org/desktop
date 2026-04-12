import { ipcMain } from 'electron';
import type SystemDiagnosticManager from '../../system-diagnostic-manager.js';

interface SystemDiagnosticHandlerState {
  systemDiagnosticManager: SystemDiagnosticManager | null;
}

const state: SystemDiagnosticHandlerState = {
  systemDiagnosticManager: null,
};

export function initSystemDiagnosticHandlers(
  systemDiagnosticManager: SystemDiagnosticManager | null,
): void {
  state.systemDiagnosticManager = systemDiagnosticManager;
}

export function registerSystemDiagnosticHandlers(deps: {
  systemDiagnosticManager: SystemDiagnosticManager | null;
}): void {
  state.systemDiagnosticManager = deps.systemDiagnosticManager;

  ipcMain.handle('system-diagnostic:run', async () => {
    if (!state.systemDiagnosticManager) {
      throw new Error('SystemDiagnosticManager is not initialized');
    }

    return state.systemDiagnosticManager.run();
  });

  ipcMain.handle('system-diagnostic:get-last', async () => {
    return state.systemDiagnosticManager?.getLastResult() ?? null;
  });
}
