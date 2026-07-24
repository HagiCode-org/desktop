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
  purchaseOutcome?: StoreLicensePurchaseOutcome;
  purchaseImpl?: TipConsumableDeps['purchase'];
}): TipConsumableDeps & {
  reportCalls: Array<{ productId: string; trackingId?: string | null; quantity?: number }>;
  purchaseCalls: string[];
} {
  const reportCalls: Array<{ productId: string; trackingId?: string | null; quantity?: number }> = [];
  const purchaseCalls: string[] = [];
  let unfulfilledReads = 0;

  return {
    reportCalls,
    purchaseCalls,
    async getUnfulfilled() {
      unfulfilledReads += 1;
      const items = typeof options.unfulfilled === 'function'
        ? options.unfulfilled()
        : (options.unfulfilled ?? []);
      // After first successful consume path tests may re-query with empty.
      if (unfulfilledReads > 1 && options.unfulfilled && !Array.isArray(options.unfulfilled)) {
        // keep function behavior
      }
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
        status: ok ? 'succeeded' : 'failed',
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

  it('no-pending proceeds to purchase and post-consume', async () => {
    const deps = createDeps({ unfulfilled: [], purchaseOutcome: 'succeeded' });
    const result = await purchaseTipWithReconcile(deps, '9NC5T6VC1NQH');
    assert.equal(result.outcome, 'succeeded');
    assert.equal(result.phase, 'consume');
    assert.equal(result.localCountIncremented, true);
    assert.deepEqual(deps.purchaseCalls, ['9NC5T6VC1NQH']);
  });

  it('pending tips are consumed before purchase', async () => {
    let phase = 0;
    const deps = createDeps({
      unfulfilled: () => {
        phase += 1;
        if (phase === 1) {
          return [{ trackingId: 'pending-1', productId: '9NC5T6VC1NQH', quantity: 1 }];
        }
        // post-purchase re-query for purchased product
        return [{ trackingId: 'new-1', productId: '9NSKR15751LN', quantity: 1 }];
      },
      purchaseOutcome: 'succeeded',
    });

    const result = await purchaseTipWithReconcile(deps, '9NSKR15751LN');
    assert.equal(result.outcome, 'succeeded');
    assert.equal(result.localCountIncremented, true);
    assert.ok(deps.reportCalls.length >= 2);
    assert.equal(deps.reportCalls[0]?.trackingId, 'pending-1');
    assert.equal(deps.reportCalls[0]?.productId, '9NC5T6VC1NQH');
    assert.equal(deps.reportCalls[deps.reportCalls.length - 1]?.productId, '9NSKR15751LN');
    assert.deepEqual(deps.purchaseCalls, ['9NSKR15751LN']);
  });

  it('reconcile failure blocks purchase', async () => {
    const deps = createDeps({ queryOk: false, purchaseOutcome: 'succeeded' });
    const result = await purchaseTipWithReconcile(deps, '9NC5T6VC1NQH');
    assert.equal(result.outcome, 'reconcile-failed');
    assert.equal(result.phase, 'reconcile');
    assert.equal(result.localCountIncremented, false);
    assert.deepEqual(deps.purchaseCalls, []);
  });

  it('purchase success + consume fail does not increment local count', async () => {
    const deps = createDeps({
      unfulfilled: [],
      purchaseOutcome: 'succeeded',
      reportOk: false,
    });
    // consumeAfterPurchase: direct report fails, re-query empty -> ok. Force non-empty post query.
    const deps2 = createDeps({
      purchaseOutcome: 'succeeded',
      unfulfilled: () => [{ trackingId: 'x', productId: '9NC5T6VC1NQH', quantity: 1 }],
      reportOk: (productId) => {
        // fail only after purchase reports (still fail all)
        void productId;
        return false;
      },
    });

    // First consume during reconcile will also fail — use empty first then fail post.
    let calls = 0;
    const deps3: TipConsumableDeps & { reportCalls: unknown[]; purchaseCalls: string[] } = {
      reportCalls: [],
      purchaseCalls: [],
      async getUnfulfilled() {
        calls += 1;
        if (calls === 1) {
          return { ok: true, items: [], errorCode: null, errorMessage: null };
        }
        return {
          ok: true,
          items: [{ trackingId: 'post', productId: '9NC5T6VC1NQH', quantity: 1 }],
          errorCode: null,
          errorMessage: null,
        };
      },
      async reportFulfillment(input) {
        deps3.reportCalls.push(input);
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
        deps3.purchaseCalls.push(productId);
        return { outcome: 'succeeded' };
      },
    };

    const result = await purchaseTipWithReconcile(deps3, '9NC5T6VC1NQH');
    assert.equal(result.outcome, 'consume-failed');
    assert.equal(result.phase, 'consume');
    assert.equal(result.purchaseOutcome, 'succeeded');
    assert.equal(result.localCountIncremented, false);
    assert.deepEqual(deps3.purchaseCalls, ['9NC5T6VC1NQH']);
    void deps;
    void deps2;
  });

  it('single-flight rejects concurrent purchase', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const deps: TipConsumableDeps = {
      async getUnfulfilled() {
        return { ok: true, items: [], errorCode: null, errorMessage: null };
      },
      async reportFulfillment() {
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
    // Allow first to enter purchase wait
    await new Promise((r) => setTimeout(r, 10));
    const second = await purchaseTipWithReconcile(deps, '9NSKR15751LN');
    assert.equal(second.outcome, 'busy');
    release();
    const firstResult = await first;
    assert.equal(firstResult.outcome, 'succeeded');
  });

  it('reconcilePendingTips ignores non-tip products', async () => {
    const deps = createDeps({
      unfulfilled: [
        { trackingId: 'x', productId: 'NOT-TIP', quantity: 1 },
      ],
    });
    const result = await reconcilePendingTips(deps);
    assert.equal(result.ok, true);
    assert.equal(result.consumedPendingCount, 0);
    assert.equal((deps as ReturnType<typeof createDeps>).reportCalls.length, 0);
  });

  it('consumeAfterPurchase prefers trackingId then re-queries', async () => {
    const deps = createDeps({ unfulfilled: [] });
    const ok = await consumeAfterPurchase(deps, '9NC5T6VC1NQH', 'track-1');
    assert.equal(ok.ok, true);
    assert.equal((deps as ReturnType<typeof createDeps>).reportCalls[0]?.trackingId, 'track-1');
  });
});
