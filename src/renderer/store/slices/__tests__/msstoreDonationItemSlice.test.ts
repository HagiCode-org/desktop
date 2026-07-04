import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import reducer, {
  type MsstoreDonationItemSliceState,
  setMsstoreDonationItemState,
} from '../msstoreDonationItemSlice';

describe('msstoreDonationItemSlice', () => {
  it('stores state from realtime event payload', () => {
    const initialState: MsstoreDonationItemSliceState = {
      state: null,
      lastPurchase: null,
      isLoading: false,
      isPurchasing: false,
      isDismissing: false,
      error: null,
    };

    const nextState = reducer(initialState, setMsstoreDonationItemState({
      purchaseCount: 5,
      dismissedAt: '2024-06-01T00:00:00.000Z',
    }));

    assert.deepEqual(nextState.state, {
      purchaseCount: 5,
      dismissedAt: '2024-06-01T00:00:00.000Z',
    });
    assert.equal(nextState.error, null);
  });
});
