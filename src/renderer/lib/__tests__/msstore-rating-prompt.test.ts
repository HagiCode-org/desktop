import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MSSTORE_RATING_PROMPT_DAY_THRESHOLD_MS,
  shouldShowRatingPrompt,
} from '../msstore-rating-prompt.js';

const NOW = new Date('2024-01-30T00:00:00.000Z');

describe('shouldShowRatingPrompt', () => {
  it('returns true in local development mode regardless of install date', () => {
    assert.equal(
      shouldShowRatingPrompt({ installDate: undefined, now: NOW, isDevMode: true }),
      true,
    );
    const justNow = new Date(NOW.getTime() - 1000).toISOString();
    assert.equal(
      shouldShowRatingPrompt({ installDate: justNow, now: NOW, isDevMode: true }),
      true,
    );
  });

  it('returns false when the install date is missing', () => {
    assert.equal(
      shouldShowRatingPrompt({ installDate: undefined, now: NOW }),
      false,
    );
  });

  it('returns false when the install date is blank', () => {
    assert.equal(
      shouldShowRatingPrompt({ installDate: '   ', now: NOW }),
      false,
    );
  });

  it('returns false when the install date is not a valid ISO string', () => {
    assert.equal(
      shouldShowRatingPrompt({ installDate: 'not-a-date', now: NOW }),
      false,
    );
  });

  it('returns false when the install date is less than seven days ago', () => {
    const justUnder = new Date(NOW.getTime() - (MSSTORE_RATING_PROMPT_DAY_THRESHOLD_MS - 1));
    assert.equal(
      shouldShowRatingPrompt({ installDate: justUnder.toISOString(), now: NOW }),
      false,
    );
  });

  it('returns true when the install date is exactly seven days ago', () => {
    const exactlySeven = new Date(NOW.getTime() - MSSTORE_RATING_PROMPT_DAY_THRESHOLD_MS);
    assert.equal(
      shouldShowRatingPrompt({ installDate: exactlySeven.toISOString(), now: NOW }),
      true,
    );
  });

  it('returns true when the install date is well past seven days ago', () => {
    const longAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
    assert.equal(
      shouldShowRatingPrompt({ installDate: longAgo.toISOString(), now: NOW }),
      true,
    );
  });

  it('ignores the distribution channel (shown across all channels)', () => {
    // shouldShowRatingPrompt no longer takes isWindowsStoreRuntime; the same
    // install date yields the same result regardless of how the app is
    // distributed.
    const longAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(shouldShowRatingPrompt({ installDate: longAgo, now: NOW }), true);
  });
});
