import {
  MSSTORE_DONATION_TIP_PRODUCT_ID_SET,
  type MsstoreDonationTipProductId,
} from '../../types/msstore-donation-item.js';
import type { StoreLicensePurchaseOutcome } from '../../types/store-license.js';
import {
  executeWindowsStoreGetUnfulfilledConsumables,
  executeWindowsStoreReportConsumableFulfillment,
  resolveWindowsStorePurchaseAddonPath,
  type WindowsStoreUnfulfilledConsumableItem,
} from './windows-store-purchase-addon.js';

export type TipConsumablePhase = 'reconcile' | 'purchase' | 'consume' | 'idle';

export type TipConsumableErrorCode =
  | 'busy'
  | 'reconcile-failed'
  | 'consume-failed'
  | 'addon-missing'
  | 'addon-unsupported'
  | 'addon-load-failed'
  | string;

export interface TipConsumableOrchestratorResult {
  phase: TipConsumablePhase;
  outcome: StoreLicensePurchaseOutcome | 'reconcile-failed' | 'consume-failed' | 'busy';
  purchaseOutcome: StoreLicensePurchaseOutcome | null;
  errorCode: string | null;
  errorMessage: string | null;
  consumedPendingCount: number;
  localCountIncremented: boolean;
}

export interface TipConsumableDeps {
  getUnfulfilled: (productIds: string[]) => Promise<{
    ok: boolean;
    items: WindowsStoreUnfulfilledConsumableItem[];
    errorCode: string | null;
    errorMessage: string | null;
  }>;
  reportFulfillment: (input: {
    productId: string;
    trackingId?: string | null;
    quantity?: number;
  }) => Promise<{
    ok: boolean;
    status: string;
    trackingId: string | null;
    balanceRemaining: number;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
  purchase: (productId: MsstoreDonationTipProductId) => Promise<{ outcome: StoreLicensePurchaseOutcome }>;
}

const successPurchaseOutcomes = new Set<StoreLicensePurchaseOutcome>([
  'succeeded',
  'already-purchased',
]);

let inFlight: Promise<TipConsumableOrchestratorResult> | null = null;

export function filterTipUnfulfilledItems(
  items: WindowsStoreUnfulfilledConsumableItem[],
): WindowsStoreUnfulfilledConsumableItem[] {
  return items.filter((item) => MSSTORE_DONATION_TIP_PRODUCT_ID_SET.has(item.productId) && item.quantity > 0);
}

export function createDefaultTipConsumableDeps(
  purchase: (productId: MsstoreDonationTipProductId) => Promise<{ outcome: StoreLicensePurchaseOutcome }>,
  options: { modulePath?: string | null } = {},
): TipConsumableDeps {
  const modulePath = options.modulePath ?? resolveWindowsStorePurchaseAddonPath() ?? '';

  return {
    purchase,
    async getUnfulfilled(productIds) {
      return executeWindowsStoreGetUnfulfilledConsumables({
        modulePath,
        productIds,
      });
    },
    async reportFulfillment(input) {
      return executeWindowsStoreReportConsumableFulfillment({
        modulePath,
        productId: input.productId,
        trackingId: input.trackingId,
        quantity: input.quantity ?? 1,
      });
    },
  };
}

async function consumeItems(
  deps: TipConsumableDeps,
  items: WindowsStoreUnfulfilledConsumableItem[],
): Promise<{ ok: true; count: number } | { ok: false; errorCode: string | null; errorMessage: string | null; count: number }> {
  let count = 0;
  for (const item of items) {
    const quantity = Math.max(1, item.quantity || 1);
    for (let i = 0; i < quantity; i += 1) {
      const report = await deps.reportFulfillment({
        productId: item.productId,
        trackingId: item.trackingId || null,
        quantity: 1,
      });
      if (!report.ok) {
        return {
          ok: false,
          errorCode: report.errorCode ?? 'consume-failed',
          errorMessage: report.errorMessage ?? `Failed to consume product ${item.productId}.`,
          count,
        };
      }
      count += 1;
    }
  }
  return { ok: true, count };
}

export async function reconcilePendingTips(
  deps: TipConsumableDeps,
  productIds: string[] = [...MSSTORE_DONATION_TIP_PRODUCT_ID_SET],
): Promise<{
  ok: boolean;
  consumedPendingCount: number;
  errorCode: string | null;
  errorMessage: string | null;
}> {
  const query = await deps.getUnfulfilled(productIds);
  if (!query.ok) {
    return {
      ok: false,
      consumedPendingCount: 0,
      errorCode: query.errorCode ?? 'reconcile-failed',
      errorMessage: query.errorMessage ?? 'Failed to query unfulfilled tip consumables.',
    };
  }

  const pending = filterTipUnfulfilledItems(query.items);
  if (pending.length === 0) {
    return {
      ok: true,
      consumedPendingCount: 0,
      errorCode: null,
      errorMessage: null,
    };
  }

  const consume = await consumeItems(deps, pending);
  if (!consume.ok) {
    return {
      ok: false,
      consumedPendingCount: consume.count,
      errorCode: consume.errorCode,
      errorMessage: consume.errorMessage,
    };
  }

  return {
    ok: true,
    consumedPendingCount: consume.count,
    errorCode: null,
    errorMessage: null,
  };
}

export async function consumeAfterPurchase(
  deps: TipConsumableDeps,
  productId: MsstoreDonationTipProductId,
  trackingId?: string | null,
): Promise<{
  ok: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}> {
  if (trackingId) {
    const report = await deps.reportFulfillment({
      productId,
      trackingId,
      quantity: 1,
    });
    if (report.ok) {
      return { ok: true, errorCode: null, errorMessage: null };
    }
    // Fall through to re-query if direct tracking report fails.
  }

  const query = await deps.getUnfulfilled([productId]);
  if (!query.ok) {
    return {
      ok: false,
      errorCode: query.errorCode ?? 'consume-failed',
      errorMessage: query.errorMessage ?? 'Failed to query unfulfilled consumable after purchase.',
    };
  }

  const pending = filterTipUnfulfilledItems(query.items).filter((item) => item.productId === productId);
  if (pending.length === 0) {
    // Balance already zero — treat as consumed (idempotent).
    return { ok: true, errorCode: null, errorMessage: null };
  }

  const consume = await consumeItems(deps, pending);
  if (!consume.ok) {
    return {
      ok: false,
      errorCode: consume.errorCode,
      errorMessage: consume.errorMessage,
    };
  }

  return { ok: true, errorCode: null, errorMessage: null };
}

async function runPurchaseWithReconcile(
  deps: TipConsumableDeps,
  productId: MsstoreDonationTipProductId,
): Promise<TipConsumableOrchestratorResult> {
  const reconcile = await reconcilePendingTips(deps);
  if (!reconcile.ok) {
    return {
      phase: 'reconcile',
      outcome: 'reconcile-failed',
      purchaseOutcome: null,
      errorCode: reconcile.errorCode,
      errorMessage: reconcile.errorMessage,
      consumedPendingCount: reconcile.consumedPendingCount,
      localCountIncremented: false,
    };
  }

  let purchaseOutcome: StoreLicensePurchaseOutcome;
  try {
    const purchaseResult = await deps.purchase(productId);
    purchaseOutcome = purchaseResult.outcome;
  } catch (error) {
    return {
      phase: 'purchase',
      outcome: 'failed',
      purchaseOutcome: 'failed',
      errorCode: 'purchase-threw',
      errorMessage: error instanceof Error ? error.message : String(error),
      consumedPendingCount: reconcile.consumedPendingCount,
      localCountIncremented: false,
    };
  }

  if (!successPurchaseOutcomes.has(purchaseOutcome)) {
    return {
      phase: 'purchase',
      outcome: purchaseOutcome,
      purchaseOutcome,
      errorCode: null,
      errorMessage: null,
      consumedPendingCount: reconcile.consumedPendingCount,
      localCountIncremented: false,
    };
  }

  const postConsume = await consumeAfterPurchase(deps, productId);
  if (!postConsume.ok) {
    return {
      phase: 'consume',
      outcome: 'consume-failed',
      purchaseOutcome,
      errorCode: postConsume.errorCode,
      errorMessage: postConsume.errorMessage,
      consumedPendingCount: reconcile.consumedPendingCount,
      localCountIncremented: false,
    };
  }

  return {
    phase: 'consume',
    outcome: purchaseOutcome,
    purchaseOutcome,
    errorCode: null,
    errorMessage: null,
    consumedPendingCount: reconcile.consumedPendingCount,
    localCountIncremented: true,
  };
}

export async function purchaseTipWithReconcile(
  deps: TipConsumableDeps,
  productId: MsstoreDonationTipProductId,
): Promise<TipConsumableOrchestratorResult> {
  if (inFlight) {
    return {
      phase: 'idle',
      outcome: 'busy',
      purchaseOutcome: null,
      errorCode: 'busy',
      errorMessage: 'A tip purchase or reconcile is already in progress.',
      consumedPendingCount: 0,
      localCountIncremented: false,
    };
  }

  const run = runPurchaseWithReconcile(deps, productId);
  inFlight = run;
  try {
    return await run;
  } finally {
    if (inFlight === run) {
      inFlight = null;
    }
  }
}

export async function reconcilePendingTipsSingleFlight(
  deps: TipConsumableDeps,
): Promise<TipConsumableOrchestratorResult> {
  if (inFlight) {
    return {
      phase: 'idle',
      outcome: 'busy',
      purchaseOutcome: null,
      errorCode: 'busy',
      errorMessage: 'A tip purchase or reconcile is already in progress.',
      consumedPendingCount: 0,
      localCountIncremented: false,
    };
  }

  const run = (async (): Promise<TipConsumableOrchestratorResult> => {
    const reconcile = await reconcilePendingTips(deps);
    if (!reconcile.ok) {
      return {
        phase: 'reconcile',
        outcome: 'reconcile-failed',
        purchaseOutcome: null,
        errorCode: reconcile.errorCode,
        errorMessage: reconcile.errorMessage,
        consumedPendingCount: reconcile.consumedPendingCount,
        localCountIncremented: false,
      };
    }

    return {
      phase: 'reconcile',
      outcome: 'succeeded',
      purchaseOutcome: null,
      errorCode: null,
      errorMessage: null,
      consumedPendingCount: reconcile.consumedPendingCount,
      localCountIncremented: false,
    };
  })();

  inFlight = run;
  try {
    return await run;
  } finally {
    if (inFlight === run) {
      inFlight = null;
    }
  }
}

/** Test helper: clear single-flight lock. */
export function resetTipConsumableOrchestratorForTests(): void {
  inFlight = null;
}
