import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAT_SPRITE_COUNT,
  getCatSpriteStyle,
  shuffleCatOrder,
  wrapCatIndex,
} from './cat-sprite.js';

test('places cells on a 5 x 4 grid, row by row', () => {
  assert.deepEqual(getCatSpriteStyle(0), { backgroundSize: '500% 400%', backgroundPosition: '0% 0%' });
  assert.equal(getCatSpriteStyle(4).backgroundPosition, '100% 0%');
  assert.equal(getCatSpriteStyle(5).backgroundPosition, '0% 33.33333333333333%');
  assert.equal(getCatSpriteStyle(19).backgroundPosition, '100% 100%');
});

test('wraps any index into the sheet', () => {
  assert.equal(wrapCatIndex(20), 0);
  assert.equal(wrapCatIndex(-1), 19);
  assert.equal(wrapCatIndex(7.9), 7);
  assert.equal(getCatSpriteStyle(25).backgroundPosition, getCatSpriteStyle(5).backgroundPosition);
});

test('shuffles every cell exactly once, whatever the random source returns', () => {
  for (const random of [() => 0, () => 0.999999, Math.random]) {
    const order = shuffleCatOrder(random);
    assert.equal(order.length, CAT_SPRITE_COUNT);
    assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: CAT_SPRITE_COUNT }, (_, i) => i));
  }
});
