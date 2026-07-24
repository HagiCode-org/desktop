import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  consumeAfterPurchase,
  filterTipUnfulfilledItems,
  purchaseTipWithReconcile,
  reconcilePendingTips,
  resetTipConsumableOrchestratorForTests,
  type TipConsumableDeps,
} from '../subscription/tip-consumable-orchestrator.js';
import type { StoreLicensePurchaseOutcome } from '../../types/store-license.js';
import type { WindowsStoreUnfulfilledConsumableItem } from '../subscription/windows-store-purchase-addon.js';

function createDeps(options: {
  unfulfilled?: WindowsStoreUnfulfilledConsumableItem[] | (() => WindowsStoreUnfulfilledConsumableItem[]);
  queryOk?: boolean;
  reportOk?: boolean | ((productId: string) => boolean);
  reportStatus?: string;
  purchaseOutcome?: StoreLicensePurchaseOutcome;
  purchaseImpl?: TipConsumableDeps['purchase'];
}): TipConsumableDeps & {
  reportCalls: Array<{ productId: string; trackingId?: string | null; quantity?: number }>;
  purchaseCalls: string[];
} {
  const reportCalls: Array<{ productId: string; trackingId?: string | null; quantity?: number }> = [];
  const purchaseCalls: string[] = [];

  return {
    reportCalls,
    purchaseCalls,
    async getUnfulfilled() {
      const items = typeof options.unfulfilled === 'function'
        ? options.unfulfilled()
        : (options.unfulfilled ?? []);
      return {
        ok: options.queryOk ?? true,
        items,
        errorCode: options.queryOk === false ? 'query-failed' : null,
        errorMessage: options.queryOk === false ? 'query failed' : null,
      };
    },
    async reportFulfillment(input) {
      reportCalls.push(input);
      const ok = typeof options.reportOk === 'function'
        ? options.reportOk(input.productId)
        : (options.reportOk ?? true);
      return {
        ok,
        status: ok ? 'succeeded' : (options.reportStatus ?? 'failed'),
        trackingId: input.trackingId ?? null,
        balanceRemaining: ok ? 0 : 1,
        errorCode: ok ? null : 'report-failed',
        errorMessage: ok ? null : 'report failed',
      };
    },
    async purchase(productId) {
      purchaseCalls.push(productId);
      if (options.purchaseImpl) {
        return options.purchaseImpl(productId);
      }
      return { outcome: options.purchaseOutcome ?? 'succeeded' };
    },
  };
}

describe('tip consumable orchestrator', () => {
  beforeEach(() => {
    resetTipConsumableOrchestratorForTests();
  });

  it('filters unfulfilled items to tip whitelist only', () => {
    const filtered = filterTipUnfulfilledItems([
      { trackingId: 'a', productId: '9NC5T6VC1NQH', quantity: 1 },
      { trackingId: 'b', productId: 'OTHER', quantity: 1 },
      { trackingId: 'c', productId: '9NSKR15751LN', quantity: 0 },
    ]);
    assert.deepEqual(filtered, [
      { trackingId: 'a', productId: '9NC5T6VC1NQH', quantity: 1 },
    ]);
  });

  it('no-pending proceeds to purchase and post-consume report', async () => {
    const deps = createDeps({
      // Benign miss on pre-purchase reconcile (nothing unfulfilled).
      reportOk: true,
      purchaseOutcome: 'succeeded',
    });
    const result = await purchaseTipWithReconcile(deps, '9NC5T6VC1NQH');
    assert.equal(result.outcome, 'succeeded');
    assert.equal(result.phase, 'consume');
    assert.equal(result.localCountIncremented, true);
    assert.deepEqual(deps.purchaseCalls, ['9NC5T6VC1NQH']);
    // focused pre-reconcile (1) + post-purchase consume (1)
    assert.ok(deps.reportCalls.length >= 2);
    assert.equal(deps.reportCalls[deps.reportCalls.length - 1]?.productId, '9NC5T6VC1NQH');
  });

  it('developer-managed pre-reconcile reports only the product being purchased', async () => {
    const deps = createDeps({ reportOk: true, purchaseOutcome: 'succeeded' });
    await purchaseTipWithReconcile(deps, '9NSKR15751LN');
    assert.equal(deps.reportCalls[0]?.productId, '9NSKR15751LN');
    assert.deepEqual(deps.purchaseCalls, ['9NSKR15751LN']);
  });

  it('pre-purchase reconcile failures do not block purchase (developer-managed)', async () => {
    let reportCount = 0;
    const deps: TipConsumableDeps & { purchaseCalls: string[]; reportCalls: unknown[] } = {
      reportCalls: [],
      purchaseCalls: [],
      async getUnfulfilled() {
        return { ok: true, items: [], errorCode: null, errorMessage: null };
      },
      async reportFulfillment(input) {
        deps.reportCalls.push(input);
        reportCount += 1;
        // pre-reconcile (3 tips) return Store server-error like 0x803F6107
        if (reportCount <= 1) {
          return {
            ok: false,
            status: 'server-error',
            trackingId: null,
            balanceRemaining: 0,
            errorCode: '0x803F6107',
            errorMessage: 'ReportConsumableFulfillment status=server-error',
          };
        }
        // post-purchase report succeeds
        return {
          ok: true,
          status: 'succeeded',
          trackingId: null,
          balanceRemaining: 0,
          errorCode: null,
          errorMessage: null,
        };
      },
      async purchase(productId) {
        deps.purchaseCalls.push(productId);
        return { outcome: 'succeeded' };
      },
    };

    const result = await purchaseTipWithReconcile(deps, '9NC5T6VC1NQH');
    assert.equal(result.outcome, 'succeeded');
    assert.equal(result.localCountIncremented, true);
    assert.deepEqual(deps.purchaseCalls, ['9NC5T6VC1NQH']);
  });

  it('benign insufficient-quantity during reconcile does not block purchase', async () => {
    const deps = createDeps({
      reportOk: false,
      reportStatus: 'insufficient-quantity',
      purchaseOutcome: 'succeeded',
    });
    // reportOk false for all reports including post-purchase — will fail post consume
    // Use custom: reconcile insufficient, post-purchase success
    let reportCount = 0;
    const deps2: TipConsumableDeps & { reportCalls: unknown[]; purchaseCalls: string[] } = {
      reportCalls: [],
      purchaseCalls: [],
      async getUnfulfilled() {
        return { ok: true, items: [], errorCode: null, errorMessage: null };
      },
      async reportFulfillment(input) {
        deps2.reportCalls.push(input);
        reportCount += 1;
        if (reportCount <= 1) {
          return {
            ok: false,
            status: 'insufficient-quantity',
            trackingId: null,
            balanceRemaining: 0,
            errorCode: 'insufficient-quantity',
            errorMessage: 'InsufficentQuantity',
          };
        }
        return {
          ok: true,
          status: 'succeeded',
          trackingId: null,
          balanceRemaining: 0,
          errorCode: null,
          errorMessage: null,
        };
      },
      async purchase(productId) {
        deps2.purchaseCalls.push(productId);
        return { outcome: 'succeeded' };
      },
    };

    const result = await purchaseTipWithReconcile(deps2, '9NC5T6VC1NQH');
    assert.equal(result.outcome, 'succeeded');
    assert.equal(result.localCountIncremented, true);
    assert.deepEqual(deps2.purchaseCalls, ['9NC5T6VC1NQH']);
    void deps;
  });

  it('purchase success + post consume fail does not increment local count', async () => {
    let reportCount = 0;
    const deps: TipConsumableDeps & { reportCalls: unknown[]; purchaseCalls: string[] } = {
      reportCalls: [],
      purchaseCalls: [],
      async getUnfulfilled() {
        return { ok: true, items: [], errorCode: null, errorMessage: null };
      },
      async reportFulfillment(input) {
        deps.reportCalls.push(input);
        reportCount += 1;
        if (reportCount <= 1) {
          // pre-reconcile benign
          return {
            ok: false,
            status: 'insufficient-quantity',
            trackingId: null,
            balanceRemaining: 0,
            errorCode: null,
            errorMessage: null,
          };
        }
        // post-purchase hard fail
        return {
          ok: false,
          status: 'failed',
          trackingId: input.trackingId ?? null,
          balanceRemaining: 1,
          errorCode: 'report-failed',
          errorMessage: 'report failed',
        };
      },
      async purchase(productId) {
        deps.purchaseCalls.push(productId);
        return { outcome: 'succeeded' };
      },
    };

    const result = await purchaseTipWithReconcile(deps, '9NC5T6VC1NQH');
    assert.equal(result.outcome, 'consume-failed');
    assert.equal(result.phase, 'consume');
    assert.equal(result.purchaseOutcome, 'succeeded');
    assert.equal(result.localCountIncremented, false);
    assert.deepEqual(deps.purchaseCalls, ['9NC5T6VC1NQH']);
  });

  it('single-flight rejects concurrent purchase', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reportCount = 0;

    const deps: TipConsumableDeps = {
      async getUnfulfilled() {
        return { ok: true, items: [], errorCode: null, errorMessage: null };
      },
      async reportFulfillment() {
        reportCount += 1;
        // pre-reconcile benign; after purchase (report #4+) succeed
        if (reportCount <= 1) {
          return {
            ok: false,
            status: 'insufficient-quantity',
            trackingId: null,
            balanceRemaining: 0,
            errorCode: null,
            errorMessage: null,
          };
        }
        return {
          ok: true,
          status: 'succeeded',
          trackingId: null,
          balanceRemaining: 0,
          errorCode: null,
          errorMessage: null,
        };
      },
      async purchase() {
        await gate;
        return { outcome: 'succeeded' };
      },
    };

    const first = purchaseTipWithReconcile(deps, '9NC5T6VC1NQH');
    await new Promise((r) => setTimeout(r, 10));
    const second = await purchaseTipWithReconcile(deps, '9NSKR15751LN');
    assert.equal(second.outcome, 'busy');
    release();
    const firstResult = await first;
    assert.equal(firstResult.outcome, 'succeeded');
  });

  it('reconcilePendingTips reports each whitelist tip product', async () => {
    const deps = createDeps({ reportOk: true });
    const result = await reconcilePendingTips(deps);
    assert.equal(result.ok, true);
    assert.equal(result.consumedPendingCount, 3);
    assert.equal(deps.reportCalls.length, 3);
  });

  it('consumeAfterPurchase always reports qty=1 without requiring balance query', async () => {
    const deps = createDeps({ reportOk: true });
    const ok = await consumeAfterPurchase(deps, '9NC5T6VC1NQH', 'track-1');
    assert.equal(ok.ok, true);
    assert.equal(ok.fulfilledCount, 1);
    assert.equal(deps.reportCalls[0]?.trackingId, 'track-1');
    assert.equal(deps.reportCalls[0]?.quantity, 1);
    // getUnfulfilled must not be required
    assert.equal(deps.reportCalls.length, 1);
  });

  it('already-purchased force-reports then retries purchase once', async () => {
    let purchaseCount = 0;
    let reportCount = 0;
    const deps: TipConsumableDeps & { reportCalls: unknown[]; purchaseCalls: string[] } = {
      reportCalls: [],
      purchaseCalls: [],
      async getUnfulfilled() {
        return { ok: true, items: [], errorCode: null, errorMessage: null };
      },
      async reportFulfillment(input) {
        deps.reportCalls.push(input);
        reportCount += 1;
        // pre-reconcile 3 benign, force+post success
        if (reportCount <= 1) {
          return {
            ok: false,
            status: 'insufficient-quantity',
            trackingId: null,
            balanceRemaining: 0,
            errorCode: null,
            errorMessage: null,
          };
        }
        return {
          ok: true,
          status: 'succeeded',
          trackingId: input.trackingId ?? null,
          balanceRemaining: 0,
          errorCode: null,
          errorMessage: null,
        };
      },
      async purchase(productId) {
        deps.purchaseCalls.push(productId);
        purchaseCount += 1;
        if (purchaseCount === 1) {
          return { outcome: 'already-purchased' };
        }
        return { outcome: 'succeeded' };
      },
    };

    const result = await purchaseTipWithReconcile(deps, '9NC5T6VC1NQH');
    assert.equal(result.outcome, 'succeeded');
    assert.equal(result.localCountIncremented, true);
    assert.equal(deps.purchaseCalls.length, 2);
    // force report + post-purchase report at least
    assert.ok(deps.reportCalls.length >= 3);
  });

  it('already-purchased after successful force-report still owned surfaces tip-not-consumable', async () => {
    let reportCount = 0;
    const deps: TipConsumableDeps & { reportCalls: unknown[]; purchaseCalls: string[] } = {
      reportCalls: [],
      purchaseCalls: [],
      async getUnfulfilled() {
        return { ok: true, items: [], errorCode: null, errorMessage: null };
      },
      async reportFulfillment(input) {
        deps.reportCalls.push(input);
        reportCount += 1;
        if (reportCount <= 1) {
          return {
            ok: false,
            status: 'insufficient-quantity',
            trackingId: null,
            balanceRemaining: 0,
            errorCode: null,
            errorMessage: null,
          };
        }
        return {
          ok: true,
          status: 'succeeded',
          trackingId: input.trackingId ?? null,
          balanceRemaining: 0,
          errorCode: null,
          errorMessage: null,
        };
      },
      async purchase(productId) {
        deps.purchaseCalls.push(productId);
        return { outcome: 'already-purchased' };
      },
    };

    const result = await purchaseTipWithReconcile(deps, '9NC5T6VC1NQH');
    assert.equal(result.outcome, 'already-purchased');
    assert.equal(result.errorCode, 'tip-not-consumable');
    assert.equal(result.localCountIncremented, false);
    assert.equal(deps.purchaseCalls.length, 2);
  });
});
