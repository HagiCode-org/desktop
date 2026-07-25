import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import reducer, {
  type MsstoreDonationItemSliceState,
  setMsstoreDonationItemState,
  openThankYouAnimation,
  closeThankYouAnimation,
} from '../msstoreDonationItemSlice';

describe('msstoreDonationItemSlice', () => {
  const idleState: MsstoreDonationItemSliceState = {
    state: null,
    lastPurchase: null,
    isLoading: false,
    isPurchasing: false,
    isDismissing: false,
    error: null,
    thankYouAnimation: { status: 'idle' },
  };

  it('stores state from realtime event payload', () => {
    const nextState = reducer(idleState, setMsstoreDonationItemState({
      purchaseCount: 5,
      purchaseCountsByTier: { coffee: 3, dinner: 1, candy: 1 },
      dismissedAt: '2024-06-01T00:00:00.000Z',
    }));

    assert.deepEqual(nextState.state, {
      purchaseCount: 5,
      purchaseCountsByTier: { coffee: 3, dinner: 1, candy: 1 },
      dismissedAt: '2024-06-01T00:00:00.000Z',
    });
    assert.equal(nextState.error, null);
  });

  it('opens and closes thank-you animation session', () => {
    const opened = reducer(
      idleState,
      openThankYouAnimation({ tier: 'dinner', variantId: 2 }),
    );
    assert.deepEqual(opened.thankYouAnimation, {
      status: 'playing',
      tier: 'dinner',
      variantId: 2,
    });

    const closed = reducer(opened, closeThankYouAnimation());
    assert.deepEqual(closed.thankYouAnimation, { status: 'idle' });
  });
});
