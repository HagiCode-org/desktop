import type { BrowserWindow } from 'electron';
import { electron } from '../../../electron-api.js';
import { subscriptionChannels } from '../../../types/subscription.js';
import type { SubscriptionService } from '../../subscription/subscription-service.js';

const { ipcMain } = electron;

interface SubscriptionHandlerState {
  subscriptionService: SubscriptionService | null;
  unsubscribe: (() => void) | null;
  getWindows: () => BrowserWindow[];
}

const state: SubscriptionHandlerState = {
  subscriptionService: null,
  unsubscribe: null,
  getWindows: () => [],
};

function broadcastSnapshotChanged(snapshot: Awaited<ReturnType<SubscriptionService['getSnapshot']>>): void {
  for (const window of state.getWindows()) {
    if (window.isDestroyed()) {
      continue;
    }

    window.webContents.send(subscriptionChannels.changed, snapshot);
  }
}

export function registerSubscriptionHandlers(deps: {
  subscriptionService: SubscriptionService;
  getWindows: () => BrowserWindow[];
}): void {
  state.subscriptionService = deps.subscriptionService;
  state.getWindows = deps.getWindows;
  state.unsubscribe?.();
  state.unsubscribe = state.subscriptionService.onDidChange((snapshot) => {
    broadcastSnapshotChanged(snapshot);
  });

  ipcMain.handle(subscriptionChannels.getSnapshot, async (_event, options) => {
    if (!state.subscriptionService) {
      throw new Error('Subscription handlers are not initialized');
    }

    return state.subscriptionService.getSnapshot(options);
  });

  ipcMain.handle(subscriptionChannels.refresh, async () => {
    if (!state.subscriptionService) {
      throw new Error('Subscription handlers are not initialized');
    }

    return state.subscriptionService.refresh('manual');
  });

  ipcMain.handle(subscriptionChannels.purchase, async () => {
    if (!state.subscriptionService) {
      throw new Error('Subscription handlers are not initialized');
    }

    return state.subscriptionService.purchase();
  });
}

export function disposeSubscriptionHandlers(): void {
  state.unsubscribe?.();
  state.unsubscribe = null;
  state.subscriptionService = null;
}
