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
  // Developer-managed consumables (official order):
  //   1) RequestPurchase
  //   2) ReportConsumableFulfillment(productId, quantity=1, trackingGuid)
  // Blind pre-purchase Report often returns Store ServerError (e.g. 0x803F6107) when there is
  // nothing to fulfill. That must NOT block opening purchase.
  //
  // Pre-purchase reconcile is therefore best-effort only: try report once per tip SKU to clear
  // a stuck unfulfilled purchase, but always continue to purchase.
  const tipProductIds = productIds.filter((id) => MSSTORE_DONATION_TIP_PRODUCT_ID_SET.has(id));
  log.info('[TipConsumable] reconcilePendingTips developer-managed best-effort', { tipProductIds });

  let consumedPendingCount = 0;
  for (const productId of tipProductIds) {
    log.info('[TipConsumable] reconcile reportFulfillment', { productId });
    try {
      const report = await deps.reportFulfillment({
        productId,
        trackingId: null,
        quantity: 1,
      });
      log.info('[TipConsumable] reconcile reportFulfillment result', {
        productId,
        ok: report.ok,
        status: report.status,
        errorCode: report.errorCode,
        errorMessage: report.errorMessage,
        balanceRemaining: report.balanceRemaining,
        blocksPurchase: false,
      });
      if (report.ok) {
        consumedPendingCount += 1;
      }
    } catch (error) {
      log.warn('[TipConsumable] reconcile reportFulfillment threw; continue to purchase', {
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: true,
    consumedPendingCount,
    errorCode: null,
    errorMessage: null,
  };
}

/** Used by post-purchase / already-purchased recovery (not pre-purchase gate). */
export function isBenignFulfillmentFailure(report: {
  ok: boolean;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
}): boolean {
  const status = String(report.status || '').toLowerCase();
  const code = String(report.errorCode || '').toLowerCase();
  const message = String(report.errorMessage || '').toLowerCase();
  return (
    status === 'insufficient-quantity'
    || status.includes('insufficent') // WinRT enum typo InsufficentQuantity
    || code.includes('insuffic')
    || code === '0x803f6107' // common Store miss when nothing is pending to fulfill
    || message.includes('insuffic')
    || message.includes('quantity')
    || message.includes('0x803f6107')
  );
}

/**
 * Developer-managed consumable fulfillment.
 *
 * MS Store does not keep an item balance for this model. After the user has
 * "consumed" the add-on (for tips: immediately after purchase), the app must
 * call ReportConsumableFulfillment so the user can buy again. We always report
 * quantity=1 with a unique tracking GUID (generated natively when omitted).
 */
export async function consumeAfterPurchase(
  deps: TipConsumableDeps,
  productId: MsstoreDonationTipProductId,
  trackingId?: string | null,
): Promise<{
  ok: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  fulfilledCount: number;
  balanceSeen: number;
}> {
  log.info('[TipConsumable] developer-managed reportFulfillment', {
    productId,
    trackingId: trackingId || null,
    quantity: 1,
  });

  const report = await deps.reportFulfillment({
    productId,
    trackingId: trackingId || null,
    quantity: 1,
  });

  log.info('[TipConsumable] developer-managed reportFulfillment result', {
    productId,
    ok: report.ok,
    status: report.status,
    trackingId: report.trackingId,
    balanceRemaining: report.balanceRemaining,
    errorCode: report.errorCode,
    errorMessage: report.errorMessage,
  });

  if (!report.ok) {
    return {
      ok: false,
      errorCode: report.errorCode ?? 'consume-failed',
      errorMessage: report.errorMessage
        ?? `Failed to report consumable fulfillment for ${productId}.`,
      fulfilledCount: 0,
      balanceSeen: report.balanceRemaining,
    };
  }

  return {
    ok: true,
    errorCode: null,
    errorMessage: null,
    fulfilledCount: 1,
    balanceSeen: report.balanceRemaining,
  };
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
    const forced = await consumeAfterPurchase(deps, productId, null);
    log.info('[TipConsumable] force consume after already-purchased', {
      productId,
      ok: forced.ok,
      fulfilledCount: forced.fulfilledCount,
      balanceSeen: forced.balanceSeen,
      errorCode: forced.errorCode,
      errorMessage: forced.errorMessage,
    });
    if (!forced.ok) {
      // Still retry purchase once: some Store errors on report are transient / no-pending,
      // and a second RequestPurchase may succeed or return a clearer outcome.
      log.warn('[TipConsumable] force report failed; still retry purchase once', {
        productId,
        errorCode: forced.errorCode,
      });
    } else {
      consumedPendingCount += forced.fulfilledCount;
    }

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
