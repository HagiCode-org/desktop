import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MSSTORE_DONATION_ITEM_DAY_THRESHOLD_MS,
  shouldShowMsstoreDonationItem,
} from '../msstore-donation-item.js';

const NOW = new Date('2024-01-30T00:00:00.000Z');

describe('shouldShowMsstoreDonationItem', () => {
  it('returns false outside Win Store runtime', () => {
    assert.equal(shouldShowMsstoreDonationItem({
      isWinStoreRuntime: false,
      installDate: '2024-01-01T00:00:00.000Z',
      now: NOW,
    }), false);
  });

  it('returns false when installDate missing or dirty', () => {
    assert.equal(shouldShowMsstoreDonationItem({
      isWinStoreRuntime: true,
      installDate: undefined,
      now: NOW,
    }), false);
    assert.equal(shouldShowMsstoreDonationItem({
      isWinStoreRuntime: true,
      installDate: 'not-a-date',
      now: NOW,
    }), false);
  });

  it('returns false when dismissedAt present', () => {
    assert.equal(shouldShowMsstoreDonationItem({
      isWinStoreRuntime: true,
      installDate: '2024-01-01T00:00:00.000Z',
      dismissedAt: '2024-01-20T00:00:00.000Z',
      now: NOW,
    }), false);
  });

  it('returns false before day-3 threshold', () => {
    const justUnder = new Date(NOW.getTime() - (MSSTORE_DONATION_ITEM_DAY_THRESHOLD_MS - 1));
    assert.equal(shouldShowMsstoreDonationItem({
      isWinStoreRuntime: true,
      installDate: justUnder.toISOString(),
      now: NOW,
    }), false);
  });

  it('returns true at and after day-3 threshold when not dismissed', () => {
    const exactly = new Date(NOW.getTime() - MSSTORE_DONATION_ITEM_DAY_THRESHOLD_MS);
    assert.equal(shouldShowMsstoreDonationItem({
      isWinStoreRuntime: true,
      installDate: exactly.toISOString(),
      now: NOW,
    }), true);
  });
});
