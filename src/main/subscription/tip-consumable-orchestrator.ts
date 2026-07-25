import log from 'electron-log';
import type { MsstoreDonationTipProductId } from '../../types/msstore-donation-item.js';
import type { StoreLicensePurchaseOutcome } from '../../types/store-license.js';

export interface TipConsumableDeps {
  purchase: (productId: MsstoreDonationTipProductId) => Promise<{ outcome: StoreLicensePurchaseOutcome }>;
}

export interface TipConsumableOrchestratorResult {
  outcome: StoreLicensePurchaseOutcome | 'busy';
  localCountIncremented: boolean;
}

const successPurchaseOutcomes = new Set<StoreLicensePurchaseOutcome>([
  'succeeded',
  'already-purchased',
]);

let inFlight: Promise<TipConsumableOrchestratorResult> | null = null;

/**
 * Simple tip purchase: direct Store requestPurchase with no reconcile/consume pre-processing.
 */
export async function purchaseSimpleTip(
  deps: TipConsumableDeps,
  productId: MsstoreDonationTipProductId,
): Promise<TipConsumableOrchestratorResult> {
  if (inFlight) {
    log.info('[TipConsumable] purchase blocked - another operation in flight', { productId });
    return {
      outcome: 'busy',
      localCountIncremented: false,
    };
  }

  const run = (async (): Promise<TipConsumableOrchestratorResult> => {
    log.info('[TipConsumable] purchase start', { productId });
    try {
      const result = await deps.purchase(productId);
      log.info('[TipConsumable] purchase result', {
        productId,
        outcome: result.outcome,
      });
      return {
        outcome: result.outcome,
        localCountIncremented: successPurchaseOutcomes.has(result.outcome),
      };
    } catch (error) {
      log.error('[TipConsumable] purchase threw', {
        productId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        outcome: 'failed' as StoreLicensePurchaseOutcome,
        localCountIncremented: false,
      };
    }
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
