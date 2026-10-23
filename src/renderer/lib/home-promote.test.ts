import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getNextIndex,
  HOME_PROMOTE_REFRESH_INTERVAL_MS,
  HOME_PROMOTE_ROTATE_INTERVAL_MS,
  pickFallbackCoverIndex,
  shouldAutoRotate,
  type HomePromoteRotateState,
} from './home-promote.js';

const rotatable: HomePromoteRotateState = {
  count: 3,
  hovered: false,
  focused: false,
  paused: false,
  reducedMotion: false,
  documentVisible: true,
};

describe('home promote rotation constants', () => {
  it('rotates every 8 seconds and refreshes every hour', () => {
    assert.equal(HOME_PROMOTE_ROTATE_INTERVAL_MS, 8000);
    assert.equal(HOME_PROMOTE_REFRESH_INTERVAL_MS, 60 * 60 * 1000);
  });
});

describe('getNextIndex', () => {
  it('steps forward and backward inside the list', () => {
    assert.equal(getNextIndex(0, 3, 1), 1);
    assert.equal(getNextIndex(1, 3, -1), 0);
  });

  it('wraps from the last item to the first and from the first to the last', () => {
    assert.equal(getNextIndex(2, 3, 1), 0);
    assert.equal(getNextIndex(0, 3, -1), 2);
  });

  it('normalizes an index that is outside the list', () => {
    assert.equal(getNextIndex(5, 3, 1), 0);
    assert.equal(getNextIndex(-1, 3, -1), 1);
  });

  it('returns 0 for an empty list in either direction', () => {
    assert.equal(getNextIndex(0, 0, 1), 0);
    assert.equal(getNextIndex(4, 0, -1), 0);
  });

  it('stays on the only item of a single-item list', () => {
    assert.equal(getNextIndex(0, 1, 1), 0);
    assert.equal(getNextIndex(0, 1, -1), 0);
  });
});

describe('shouldAutoRotate', () => {
  it('rotates when more than one item is visible and nothing blocks it', () => {
    assert.equal(shouldAutoRotate(rotatable), true);
    assert.equal(shouldAutoRotate({ ...rotatable, count: 2 }), true);
  });

  it('never rotates a single item or an empty list', () => {
    assert.equal(shouldAutoRotate({ ...rotatable, count: 1 }), false);
    assert.equal(shouldAutoRotate({ ...rotatable, count: 0 }), false);
  });

  for (const blocker of ['hovered', 'focused', 'paused', 'reducedMotion'] as const) {
    it(`does not rotate while ${blocker} is set`, () => {
      assert.equal(shouldAutoRotate({ ...rotatable, [blocker]: true }), false);
    });
  }

  it('does not rotate while the document is hidden', () => {
    assert.equal(shouldAutoRotate({ ...rotatable, documentVisible: false }), false);
  });
});

describe('pickFallbackCoverIndex', () => {
  it('is stable for one id and always inside the cover range', () => {
    const first = pickFallbackCoverIndex('item-1', 3);
    assert.equal(pickFallbackCoverIndex('item-1', 3), first);
    for (const id of ['', 'a', 'item-1', 'item-2', '推荐-三', 'https://example.com/post/42']) {
      const index = pickFallbackCoverIndex(id, 3);
      assert.ok(Number.isInteger(index) && index >= 0 && index < 3, `${id} -> ${index}`);
    }
  });

  it('spreads different ids over the covers and returns 0 when there are none', () => {
    const used = new Set(Array.from({ length: 30 }, (_, i) => pickFallbackCoverIndex(`item-${i}`, 3)));
    assert.equal(used.size, 3);
    assert.equal(pickFallbackCoverIndex('item-1', 0), 0);
  });
});
