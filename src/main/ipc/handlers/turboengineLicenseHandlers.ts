import type { BrowserWindow } from 'electron';
import { electron } from '../../../electron-api.js';
import { turboEngineChannels } from '../../../types/turboengine-license.js';
import type { RawStorePurchaseResult } from '../../subscription/subscription-broker.js';
import type { TurboEngineLicenseService } from '../../subscription/turboengine-license-service.js';

const { ipcMain } = electron;

interface TurboEngineLicenseHandlerState {
  turboEngineLicenseService: TurboEngineLicenseService | null;
  unsubscribe: (() => void) | null;
  getWindows: () => BrowserWindow[];
}

const state: TurboEngineLicenseHandlerState = {
  turboEngineLicenseService: null,
  unsubscribe: null,
  getWindows: () => [],
};

function broadcastSnapshotChanged(snapshot: Awaited<ReturnType<TurboEngineLicenseService['getSnapshot']>>): void {
  for (const window of state.getWindows()) {
    if (window.isDestroyed()) {
      continue;
    }

    window.webContents.send(turboEngineChannels.changed, snapshot);
  }
}

export function registerTurboEngineLicenseHandlers(deps: {
  turboEngineLicenseService: TurboEngineLicenseService;
  getWindows: () => BrowserWindow[];
}): void {
  state.turboEngineLicenseService = deps.turboEngineLicenseService;
  state.getWindows = deps.getWindows;
  state.unsubscribe?.();
  state.unsubscribe = state.turboEngineLicenseService.onDidChange((snapshot) => {
    broadcastSnapshotChanged(snapshot);
  });

  ipcMain.handle(turboEngineChannels.getSnapshot, async () => {
    if (!state.turboEngineLicenseService) {
      throw new Error('TurboEngine license handlers are not initialized');
    }

    return state.turboEngineLicenseService.getSnapshot();
  });

  ipcMain.handle(turboEngineChannels.verifyStartup, async () => {
    if (!state.turboEngineLicenseService) {
      throw new Error('TurboEngine license handlers are not initialized');
    }

    return state.turboEngineLicenseService.verifyOnStartup();
  });

  ipcMain.handle(turboEngineChannels.refresh, async () => {
    if (!state.turboEngineLicenseService) {
      throw new Error('TurboEngine license handlers are not initialized');
    }

    return state.turboEngineLicenseService.refresh('manual');
  });

  ipcMain.handle(turboEngineChannels.purchase, async (_event, purchaseResult?: RawStorePurchaseResult) => {
    if (!state.turboEngineLicenseService) {
      throw new Error('TurboEngine license handlers are not initialized');
    }

    return purchaseResult
      ? state.turboEngineLicenseService.completePurchase(purchaseResult)
      : state.turboEngineLicenseService.purchase();
  });
}

export function disposeTurboEngineLicenseHandlers(): void {
  state.unsubscribe?.();
  state.unsubscribe = null;
  state.turboEngineLicenseService = null;
}
