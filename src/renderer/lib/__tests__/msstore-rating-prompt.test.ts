import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MSSTORE_RATING_PROMPT_DAY_THRESHOLD_MS,
  shouldShowRatingPrompt,
} from '../msstore-rating-prompt.js';

const NOW = new Date('2024-01-30T00:00:00.000Z');

describe('shouldShowRatingPrompt', () => {
  it('returns false when not running in the Windows Store runtime', () => {
    assert.equal(
      shouldShowRatingPrompt({
        isWindowsStoreRuntime: false,
        installDate: new Date(NOW.getTime() - MSSTORE_RATING_PROMPT_DAY_THRESHOLD_MS).toISOString(),
        now: NOW,
      }),
      false,
    );
  });

  it('returns false when the install date is missing', () => {
    assert.equal(
      shouldShowRatingPrompt({ isWindowsStoreRuntime: true, installDate: undefined, now: NOW }),
      false,
    );
  });

  it('returns false when the install date is blank', () => {
    assert.equal(
      shouldShowRatingPrompt({ isWindowsStoreRuntime: true, installDate: '   ', now: NOW }),
      false,
    );
  });

  it('returns false when the install date is not a valid ISO string', () => {
    assert.equal(
      shouldShowRatingPrompt({ isWindowsStoreRuntime: true, installDate: 'not-a-date', now: NOW }),
      false,
    );
  });

  it('returns false when the install date is less than seven days ago', () => {
    const justUnder = new Date(NOW.getTime() - (MSSTORE_RATING_PROMPT_DAY_THRESHOLD_MS - 1));
    assert.equal(
      shouldShowRatingPrompt({ isWindowsStoreRuntime: true, installDate: justUnder.toISOString(), now: NOW }),
      false,
    );
  });

  it('returns true when the install date is exactly seven days ago', () => {
    const exactlySeven = new Date(NOW.getTime() - MSSTORE_RATING_PROMPT_DAY_THRESHOLD_MS);
    assert.equal(
      shouldShowRatingPrompt({ isWindowsStoreRuntime: true, installDate: exactlySeven.toISOString(), now: NOW }),
      true,
    );
  });

  it('returns true when the install date is well past seven days ago', () => {
    const longAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
    assert.equal(
      shouldShowRatingPrompt({ isWindowsStoreRuntime: true, installDate: longAgo.toISOString(), now: NOW }),
      true,
    );
  });
});
