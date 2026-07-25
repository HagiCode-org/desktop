import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  purchaseSimpleTip,
  resetTipConsumableOrchestratorForTests,
  type TipConsumableDeps,
} from '../subscription/tip-consumable-orchestrator.js';
import type { StoreLicensePurchaseOutcome } from '../../types/store-license.js';

function createDeps(options: {
  purchaseOutcome?: StoreLicensePurchaseOutcome;
  purchaseThrows?: boolean;
} = {}): TipConsumableDeps & { purchaseCalls: string[] } {
  const purchaseCalls: string[] = [];
  return {
    purchaseCalls,
    async purchase(productId) {
      purchaseCalls.push(productId);
      if (options.purchaseThrows) {
        throw new Error('purchase error');
      }
      return { outcome: options.purchaseOutcome ?? 'succeeded' };
    },
  };
}

describe('purchaseSimpleTip', () => {
  beforeEach(() => {
    resetTipConsumableOrchestratorForTests();
  });

  it('succeeded outcome returns localCountIncremented=true', async () => {
    const deps = createDeps({ purchaseOutcome: 'succeeded' });
    const result = await purchaseSimpleTip(deps, '9NNC9S2GVJKC');
    assert.equal(result.outcome, 'succeeded');
    assert.equal(result.localCountIncremented, true);
    assert.deepEqual(deps.purchaseCalls, ['9NNC9S2GVJKC']);
  });

  it('already-purchased outcome returns localCountIncremented=true', async () => {
    const deps = createDeps({ purchaseOutcome: 'already-purchased' });
    const result = await purchaseSimpleTip(deps, '9PBXBJFCL9K5');
    assert.equal(result.outcome, 'already-purchased');
    assert.equal(result.localCountIncremented, true);
    assert.deepEqual(deps.purchaseCalls, ['9PBXBJFCL9K5']);
  });

  it('failed outcome returns localCountIncremented=false', async () => {
    const deps = createDeps({ purchaseOutcome: 'failed' });
    const result = await purchaseSimpleTip(deps, '9PGSK18H6872');
    assert.equal(result.outcome, 'failed');
    assert.equal(result.localCountIncremented, false);
  });

  it('canceled outcome returns localCountIncremented=false', async () => {
    const deps = createDeps({ purchaseOutcome: 'canceled' });
    const result = await purchaseSimpleTip(deps, '9NNC9S2GVJKC');
    assert.equal(result.outcome, 'canceled');
    assert.equal(result.localCountIncremented, false);
  });

  it('throws when purchase throws', async () => {
    const deps = createDeps({ purchaseThrows: true });
    const result = await purchaseSimpleTip(deps, '9NNC9S2GVJKC');
    assert.equal(result.outcome, 'failed');
    assert.equal(result.localCountIncremented, false);
  });

  it('busy when another operation is in flight', async () => {
    const deps = createDeps({ purchaseOutcome: 'succeeded' });
    // Start first purchase (don't await yet)
    const first = purchaseSimpleTip(deps, '9NNC9S2GVJKC');
    // Second purchase while first is in flight
    const second = await purchaseSimpleTip(deps, '9PBXBJFCL9K5');
    assert.equal(second.outcome, 'busy');
    assert.equal(second.localCountIncremented, false);
    // Ensure first completes successfully
    const firstResult = await first;
    assert.equal(firstResult.outcome, 'succeeded');
  });

  it('allows sequential purchases after previous completes', async () => {
    const deps = createDeps({ purchaseOutcome: 'succeeded' });
    const first = await purchaseSimpleTip(deps, '9NNC9S2GVJKC');
    assert.equal(first.outcome, 'succeeded');
    const second = await purchaseSimpleTip(deps, '9PBXBJFCL9K5');
    assert.equal(second.outcome, 'succeeded');
    assert.deepEqual(deps.purchaseCalls, ['9NNC9S2GVJKC', '9PBXBJFCL9K5']);
  });
});
