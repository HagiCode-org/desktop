import log from 'electron-log';
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
  log.info('[TipConsumable] createDefaultTipConsumableDeps', {
    modulePath: modulePath || null,
    hasModulePath: Boolean(modulePath),
  });

  return {
    purchase,
    async getUnfulfilled(productIds) {
      log.info('[TipConsumable] getUnfulfilled call', { modulePath: modulePath || null, productIds });
      const result = await executeWindowsStoreGetUnfulfilledConsumables({
        modulePath,
        productIds,
      });
      log.info('[TipConsumable] getUnfulfilled result', {
        ok: result.ok,
        itemCount: result.items.length,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
      return result;
    },
    async reportFulfillment(input) {
      log.info('[TipConsumable] reportFulfillment call', {
        modulePath: modulePath || null,
        productId: input.productId,
        trackingId: input.trackingId ?? null,
        quantity: input.quantity ?? 1,
      });
      const result = await executeWindowsStoreReportConsumableFulfillment({
        modulePath,
        productId: input.productId,
        trackingId: input.trackingId,
        quantity: input.quantity ?? 1,
      });
      log.info('[TipConsumable] reportFulfillment call result', {
        ok: result.ok,
        status: result.status,
        balanceRemaining: result.balanceRemaining,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
      return result;
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
      log.info('[TipConsumable] reportFulfillment', {
        productId: item.productId,
        trackingId: item.trackingId || null,
        unitIndex: i + 1,
        unitTotal: quantity,
      });
      const report = await deps.reportFulfillment({
        productId: item.productId,
        trackingId: item.trackingId || null,
        quantity: 1,
      });
      log.info('[TipConsumable] reportFulfillment result', {
        productId: item.productId,
        ok: report.ok,
        status: report.status,
        balanceRemaining: report.balanceRemaining,
        trackingId: report.trackingId,
        errorCode: report.errorCode,
        errorMessage: report.errorMessage,
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
  log.info('[TipConsumable] reconcilePendingTips query', { productIds });
  const query = await deps.getUnfulfilled(productIds);
  log.info('[TipConsumable] reconcilePendingTips query result', {
    ok: query.ok,
    rawItemCount: query.items.length,
    items: query.items,
    errorCode: query.errorCode,
    errorMessage: query.errorMessage,
  });
  if (!query.ok) {
    return {
      ok: false,
      consumedPendingCount: 0,
      errorCode: query.errorCode ?? 'reconcile-failed',
      errorMessage: query.errorMessage ?? 'Failed to query unfulfilled tip consumables.',
    };
  }

  const pending = filterTipUnfulfilledItems(query.items);
  log.info('[TipConsumable] whitelist pending after filter', {
    pendingCount: pending.length,
    pending,
  });
  if (pending.length === 0) {
    return {
      ok: true,
      consumedPendingCount: 0,
      errorCode: null,
      errorMessage: null,
    };
  }

  const consume = await consumeItems(deps, pending);
  log.info('[TipConsumable] reconcile consume finished', {
    ok: consume.ok,
    count: consume.count,
    errorCode: consume.ok ? null : consume.errorCode,
    errorMessage: consume.ok ? null : consume.errorMessage,
  });
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
  options: { requireFulfillment?: boolean } = {},
): Promise<{
  ok: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  fulfilledCount: number;
  balanceSeen: number;
}> {
  const requireFulfillment = options.requireFulfillment === true;
  let fulfilledCount = 0;

  if (trackingId) {
    log.info('[TipConsumable] reportFulfillment with trackingId', { productId, trackingId });
    const report = await deps.reportFulfillment({
      productId,
      trackingId,
      quantity: 1,
    });
    log.info('[TipConsumable] reportFulfillment result', {
      productId,
      trackingId,
      ok: report.ok,
      status: report.status,
      balanceRemaining: report.balanceRemaining,
      errorCode: report.errorCode,
      errorMessage: report.errorMessage,
    });
    if (report.ok) {
      return { ok: true, errorCode: null, errorMessage: null, fulfilledCount: 1, balanceSeen: report.balanceRemaining };
    }
    // Fall through to re-query if direct tracking report fails.
  }

  const query = await deps.getUnfulfilled([productId]);
  log.info('[TipConsumable] unfulfilled query for product', {
    productId,
    ok: query.ok,
    itemCount: query.items.length,
    items: query.items,
    errorCode: query.errorCode,
    errorMessage: query.errorMessage,
  });
  if (!query.ok) {
    return {
      ok: false,
      errorCode: query.errorCode ?? 'consume-failed',
      errorMessage: query.errorMessage ?? 'Failed to query unfulfilled consumable after purchase.',
      fulfilledCount,
      balanceSeen: 0,
    };
  }

  const pending = filterTipUnfulfilledItems(query.items).filter((item) => item.productId === productId);
  const balanceSeen = pending.reduce((sum, item) => sum + Math.max(0, item.quantity || 0), 0);

  if (pending.length === 0) {
    if (requireFulfillment) {
      // already-purchased recovery: empty consumable balance means nothing to fulfill.
      // Likely Durable ownership or Partner Center product type mismatch.
      log.warn('[TipConsumable] requireFulfillment but balance is 0', { productId });
      return {
        ok: false,
        errorCode: 'no-consumable-balance',
        errorMessage:
          'Store reports already purchased but consumable balance is 0. Product is likely Durable (not Consumable) in Partner Center, or fulfillment already cleared without unlocking repurchase.',
        fulfilledCount,
        balanceSeen: 0,
      };
    }
    // Normal post-purchase path: balance already zero — treat as consumed (idempotent).
    log.info('[TipConsumable] no pending balance; treat post-purchase consume as ok', { productId });
    return { ok: true, errorCode: null, errorMessage: null, fulfilledCount, balanceSeen: 0 };
  }

  const consume = await consumeItems(deps, pending);
  fulfilledCount += consume.count;
  if (!consume.ok) {
    return {
      ok: false,
      errorCode: consume.errorCode,
      errorMessage: consume.errorMessage,
      fulfilledCount,
      balanceSeen,
    };
  }

  return { ok: true, errorCode: null, errorMessage: null, fulfilledCount, balanceSeen };
}

async function runPurchaseWithReconcile(
  deps: TipConsumableDeps,
  productId: MsstoreDonationTipProductId,
): Promise<TipConsumableOrchestratorResult> {
  log.info('[TipConsumable] purchaseWithReconcile start', { productId });

  const reconcile = await reconcilePendingTips(deps);
  log.info('[TipConsumable] pre-purchase reconcile done', {
    productId,
    ok: reconcile.ok,
    consumedPendingCount: reconcile.consumedPendingCount,
    errorCode: reconcile.errorCode,
    errorMessage: reconcile.errorMessage,
  });
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
  let consumedPendingCount = reconcile.consumedPendingCount;
  try {
    log.info('[TipConsumable] purchase attempt', { productId, attempt: 1 });
    const purchaseResult = await deps.purchase(productId);
    purchaseOutcome = purchaseResult.outcome;
    log.info('[TipConsumable] purchase attempt result', {
      productId,
      attempt: 1,
      outcome: purchaseOutcome,
    });
  } catch (error) {
    log.error('[TipConsumable] purchase threw', {
      productId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      phase: 'purchase',
      outcome: 'failed',
      purchaseOutcome: 'failed',
      errorCode: 'purchase-threw',
      errorMessage: error instanceof Error ? error.message : String(error),
      consumedPendingCount,
      localCountIncremented: false,
    };
  }

  // Durable-misconfigured or leftover unfulfilled consumable often surfaces as already-purchased.
  // Force consume this product, then retry purchase once so a true consumable can be bought again.
  if (purchaseOutcome === 'already-purchased') {
    log.warn('[TipConsumable] already-purchased; force consumable fulfillment before retry', { productId });
    const forced = await consumeAfterPurchase(deps, productId, null, { requireFulfillment: true });
    log.info('[TipConsumable] force consume after already-purchased', {
      productId,
      ok: forced.ok,
      fulfilledCount: forced.fulfilledCount,
      balanceSeen: forced.balanceSeen,
      errorCode: forced.errorCode,
      errorMessage: forced.errorMessage,
    });
    if (!forced.ok) {
      return {
        phase: 'consume',
        outcome: 'consume-failed',
        purchaseOutcome,
        errorCode: forced.errorCode ?? 'already-purchased-consume-failed',
        errorMessage: forced.errorMessage
          ?? 'Store reports already purchased, but consumable fulfillment failed. Retry tip sync.',
        consumedPendingCount,
        localCountIncremented: false,
      };
    }
    consumedPendingCount += forced.fulfilledCount;

    try {
      log.info('[TipConsumable] purchase attempt', { productId, attempt: 2, reason: 'after-force-consume' });
      const retry = await deps.purchase(productId);
      purchaseOutcome = retry.outcome;
      log.info('[TipConsumable] purchase attempt result', {
        productId,
        attempt: 2,
        outcome: purchaseOutcome,
      });
    } catch (error) {
      log.error('[TipConsumable] purchase retry threw', {
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        phase: 'purchase',
        outcome: 'failed',
        purchaseOutcome: 'failed',
        errorCode: 'purchase-retry-threw',
        errorMessage: error instanceof Error ? error.message : String(error),
        consumedPendingCount,
        localCountIncremented: false,
      };
    }

    // Still already-purchased after consume: product is likely Durable in Partner Center, not Consumable.
    if (purchaseOutcome === 'already-purchased') {
      log.error('[TipConsumable] still already-purchased after force consume', { productId });
      return {
        phase: 'purchase',
        outcome: 'already-purchased',
        purchaseOutcome,
        errorCode: 'tip-not-consumable',
        errorMessage:
          'Store still reports already purchased after consumable fulfillment. Check Partner Center product type is Consumable (not Durable).',
        consumedPendingCount,
        localCountIncremented: false,
      };
    }
  }

  if (!successPurchaseOutcomes.has(purchaseOutcome)) {
    log.info('[TipConsumable] non-success purchase outcome; skip post-consume', {
      productId,
      purchaseOutcome,
    });
    return {
      phase: 'purchase',
      outcome: purchaseOutcome,
      purchaseOutcome,
      errorCode: null,
      errorMessage: null,
      consumedPendingCount,
      localCountIncremented: false,
    };
  }

  log.info('[TipConsumable] post-purchase consume', { productId, purchaseOutcome });
  const postConsume = await consumeAfterPurchase(deps, productId);
  log.info('[TipConsumable] post-purchase consume result', {
    productId,
    ok: postConsume.ok,
    fulfilledCount: postConsume.fulfilledCount,
    balanceSeen: postConsume.balanceSeen,
    errorCode: postConsume.errorCode,
    errorMessage: postConsume.errorMessage,
  });
  if (!postConsume.ok) {
    return {
      phase: 'consume',
      outcome: 'consume-failed',
      purchaseOutcome,
      errorCode: postConsume.errorCode,
      errorMessage: postConsume.errorMessage,
      consumedPendingCount,
      localCountIncremented: false,
    };
  }

  log.info('[TipConsumable] purchaseWithReconcile success', {
    productId,
    purchaseOutcome,
    consumedPendingCount,
  });
  return {
    phase: 'consume',
    outcome: purchaseOutcome,
    purchaseOutcome,
    errorCode: null,
    errorMessage: null,
    consumedPendingCount,
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
