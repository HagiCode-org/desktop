import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  THANK_YOU_VARIANT_COUNT,
  THANK_YOU_VARIANT_REGISTRY,
  listThankYouVariants,
  pickThankYouVariant,
  getThankYouTierTokens,
} from '../sponsor-thank-you-animation.js';
import type { MsstoreDonationTipTierId } from '../../../types/msstore-donation-item.js';

const tiers: MsstoreDonationTipTierId[] = ['coffee', 'dinner', 'candy'];

describe('pickThankYouVariant', () => {
  it('returns index in 0..4 for any rng in [0,1)', () => {
    for (const tier of tiers) {
      for (const sample of [0, 0.1, 0.2, 0.399, 0.4, 0.599, 0.6, 0.799, 0.8, 0.999, 0.999999]) {
        const id = pickThankYouVariant(tier, () => sample);
        assert.ok(id >= 0 && id <= 4, `tier=${tier} sample=${sample} id=${id}`);
        assert.equal(Number.isInteger(id), true);
      }
    }
  });

  it('maps ranges uniformly to five buckets', () => {
    assert.equal(pickThankYouVariant('coffee', () => 0), 0);
    assert.equal(pickThankYouVariant('coffee', () => 0.199), 0);
    assert.equal(pickThankYouVariant('coffee', () => 0.2), 1);
    assert.equal(pickThankYouVariant('coffee', () => 0.399), 1);
    assert.equal(pickThankYouVariant('coffee', () => 0.4), 2);
    assert.equal(pickThankYouVariant('coffee', () => 0.599), 2);
    assert.equal(pickThankYouVariant('coffee', () => 0.6), 3);
    assert.equal(pickThankYouVariant('coffee', () => 0.799), 3);
    assert.equal(pickThankYouVariant('coffee', () => 0.8), 4);
    assert.equal(pickThankYouVariant('coffee', () => 0.999), 4);
  });

  it('is tier-parameterized but does not change index mapping (tier isolation of registry)', () => {
    const rng = () => 0.5;
    for (const tier of tiers) {
      assert.equal(pickThankYouVariant(tier, rng), 2);
      assert.equal(listThankYouVariants(tier).length, THANK_YOU_VARIANT_COUNT);
      assert.equal(THANK_YOU_VARIANT_REGISTRY[tier].length, 5);
    }
  });

  it('clamps non-finite rng safely into range', () => {
    assert.equal(pickThankYouVariant('dinner', () => Number.NaN), 0);
    assert.equal(pickThankYouVariant('dinner', () => -1), 0);
    assert.equal(pickThankYouVariant('dinner', () => 2), 4);
  });
});

describe('progressive intensity tokens', () => {
  it('orders coffee < dinner < candy by duration and particle density', () => {
    const coffee = getThankYouTierTokens('coffee');
    const dinner = getThankYouTierTokens('dinner');
    const candy = getThankYouTierTokens('candy');
    assert.ok(coffee.durationMs < dinner.durationMs);
    assert.ok(dinner.durationMs < candy.durationMs);
    assert.ok(coffee.particleCount < dinner.particleCount);
    assert.ok(dinner.particleCount < candy.particleCount);
    assert.equal(coffee.intensity, 'light');
    assert.equal(dinner.intensity, 'medium');
    assert.equal(candy.intensity, 'strong');
  });
});
