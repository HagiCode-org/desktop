import log from 'electron-log';
import type { BrowserWindow } from 'electron';
import { electron } from '../../../electron-api.js';
import type { ConfigManager, MsstoreDonationItemState } from '../../config.js';
import type { StoreLicensePurchaseOutcome } from '../../../types/store-license.js';
import {
  msstoreDonationItemChannels,
  resolveMsstoreDonationTipProductId,
  type MsstoreDonationItemPurchaseRequest,
  type MsstoreDonationItemPurchaseResult,
  type MsstoreDonationTipProductId,
  type MsstoreDonationTipTierId,
} from '../../../types/msstore-donation-item.js';
import { purchaseSimpleTip } from '../../subscription/tip-consumable-orchestrator.js';

const { ipcMain } = electron;

export type MsstoreDonationItemPurchaseOutcome = StoreLicensePurchaseOutcome;

interface MsstoreDonationItemHandlerState {
  configManager: ConfigManager | null;
  purchaseDonation: ((productId: MsstoreDonationTipProductId) => Promise<{ outcome: MsstoreDonationItemPurchaseOutcome }>) | null;
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

function getPurchaseDonation(): (productId: MsstoreDonationTipProductId) => Promise<{ outcome: MsstoreDonationItemPurchaseOutcome }> {
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

function currentCounts(): Pick<MsstoreDonationItemState, 'purchaseCount' | 'purchaseCountsByTier'> {
  const current = getConfigManager().getMsstoreDonationItemState();
  return {
    purchaseCount: current.purchaseCount,
    purchaseCountsByTier: current.purchaseCountsByTier,
  };
}

export function registerMsstoreDonationItemHandlers(deps: {
  configManager: ConfigManager;
  purchaseDonation: (productId: MsstoreDonationTipProductId) => Promise<{ outcome: MsstoreDonationItemPurchaseOutcome }>;
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

  ipcMain.handle(
    msstoreDonationItemChannels.purchase,
    async (_event, input?: MsstoreDonationItemPurchaseRequest | MsstoreDonationTipTierId | string) => {
      const resolved = resolveMsstoreDonationTipProductId(input);
      if (!resolved) {
        const current = currentCounts();
        broadcastState(getConfigManager().getMsstoreDonationItemState());
        return {
          outcome: 'failed' as const,
          phase: 'purchase',
          purchaseCount: current.purchaseCount,
          purchaseCountsByTier: current.purchaseCountsByTier,
          errorCode: 'invalid-tier',
          errorMessage: 'Unknown or non-whitelist tip tier/product.',
          localCountIncremented: false,
        } satisfies MsstoreDonationItemPurchaseResult;
      }

      log.info('[MsstoreDonationItem] purchase IPC start', {
        tier: resolved.tier,
        productId: resolved.productId,
      });

      const result = await purchaseSimpleTip({ purchase: getPurchaseDonation() }, resolved.productId);

      log.info('[MsstoreDonationItem] purchase IPC result', {
        tier: resolved.tier,
        productId: resolved.productId,
        outcome: result.outcome,
        localCountIncremented: result.localCountIncremented,
      });

      const shouldIncrement =
        result.localCountIncremented
        && isMsstoreDonationItemSuccessOutcome(result.outcome as MsstoreDonationItemPurchaseOutcome);

      const nextState = shouldIncrement
        ? getConfigManager().incrementMsstoreDonationItemPurchaseCount(resolved.tier)
        : getConfigManager().getMsstoreDonationItemState();

      broadcastState(nextState);

      return {
        outcome: result.outcome,
        purchaseCount: nextState.purchaseCount,
        purchaseCountsByTier: nextState.purchaseCountsByTier,
        tier: resolved.tier,
        localCountIncremented: shouldIncrement,
      } satisfies MsstoreDonationItemPurchaseResult;
    },
  );

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
