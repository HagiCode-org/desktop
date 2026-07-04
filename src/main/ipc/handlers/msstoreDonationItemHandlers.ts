import type { BrowserWindow } from 'electron';
import { electron } from '../../../electron-api.js';
import type { ConfigManager, MsstoreDonationItemState } from '../../config.js';
import type { StoreLicensePurchaseOutcome } from '../../../types/store-license.js';
import { msstoreDonationItemChannels } from '../../../types/msstore-donation-item.js';

const { ipcMain } = electron;

export type MsstoreDonationItemPurchaseOutcome = StoreLicensePurchaseOutcome;

export interface MsstoreDonationItemPurchaseResult {
  outcome: MsstoreDonationItemPurchaseOutcome;
  purchaseCount: number;
}

interface MsstoreDonationItemHandlerState {
  configManager: ConfigManager | null;
  purchaseDonation: (() => Promise<{ outcome: MsstoreDonationItemPurchaseOutcome }>) | null;
  canDismiss: (() => boolean) | null;
  getWindows: () => BrowserWindow[];
}

const state: MsstoreDonationItemHandlerState = {
  configManager: null,
  purchaseDonation: null,
  canDismiss: null,
  getWindows: () => [],
};

const successOutcomes = new Set<MsstoreDonationItemPurchaseOutcome>([
  'succeeded',
  'already-purchased',
]);

export function isMsstoreDonationItemSuccessOutcome(outcome: MsstoreDonationItemPurchaseOutcome): boolean {
  return successOutcomes.has(outcome);
}

function broadcastState(snapshot: MsstoreDonationItemState): void {
  for (const window of state.getWindows()) {
    if (window.isDestroyed()) {
      continue;
    }

    window.webContents.send(msstoreDonationItemChannels.changed, snapshot);
  }
}

function getConfigManager(): ConfigManager {
  if (!state.configManager) {
    throw new Error('MS Store donation item handlers are not initialized');
  }

  return state.configManager;
}

function getPurchaseDonation(): () => Promise<{ outcome: MsstoreDonationItemPurchaseOutcome }> {
  if (!state.purchaseDonation) {
    throw new Error('MS Store donation item handlers are not initialized');
  }

  return state.purchaseDonation;
}

function canDismissDonationItem(): boolean {
  if (!state.canDismiss) {
    throw new Error('MS Store donation item handlers are not initialized');
  }

  return state.canDismiss();
}

export function registerMsstoreDonationItemHandlers(deps: {
  configManager: ConfigManager;
  purchaseDonation: () => Promise<{ outcome: MsstoreDonationItemPurchaseOutcome }>;
  canDismiss: () => boolean;
  getWindows: () => BrowserWindow[];
}): void {
  state.configManager = deps.configManager;
  state.purchaseDonation = deps.purchaseDonation;
  state.canDismiss = deps.canDismiss;
  state.getWindows = deps.getWindows;

  ipcMain.handle(msstoreDonationItemChannels.getState, async () => {
    return getConfigManager().getMsstoreDonationItemState();
  });

  ipcMain.handle(msstoreDonationItemChannels.dismiss, async () => {
    if (!canDismissDonationItem()) {
      throw new Error('MS Store donation item can only be dismissed by active sponsor users.');
    }

    const nextState = getConfigManager().setMsstoreDonationItemState({
      ...getConfigManager().getMsstoreDonationItemState(),
      dismissedAt: new Date().toISOString(),
    });
    broadcastState(nextState);
    return nextState;
  });

  ipcMain.handle(msstoreDonationItemChannels.purchase, async () => {
    const purchaseResult = await getPurchaseDonation()();
    const outcome = purchaseResult.outcome;

    const nextState = isMsstoreDonationItemSuccessOutcome(outcome)
      ? getConfigManager().incrementMsstoreDonationItemPurchaseCount()
      : getConfigManager().getMsstoreDonationItemState();

    broadcastState(nextState);

    return {
      outcome,
      purchaseCount: nextState.purchaseCount,
    } satisfies MsstoreDonationItemPurchaseResult;
  });
}

export function disposeMsstoreDonationItemHandlers(): void {
  ipcMain.removeHandler(msstoreDonationItemChannels.getState);
  ipcMain.removeHandler(msstoreDonationItemChannels.dismiss);
  ipcMain.removeHandler(msstoreDonationItemChannels.purchase);
  state.configManager = null;
  state.purchaseDonation = null;
  state.canDismiss = null;
  state.getWindows = () => [];
}
