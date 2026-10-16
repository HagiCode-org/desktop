import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  planHomeRail,
  resolveHomeEntitlementTier,
  type HomeEntitlementInput,
  type HomeEntitlementSource,
} from './home-rail-plan.ts';

const none: HomeEntitlementSource = { bridgeAvailable: false, snapshotStatus: undefined, hasError: false };
const source = (snapshotStatus: string | undefined, extra: Partial<HomeEntitlementSource> = {}): HomeEntitlementSource => ({
  bridgeAvailable: true,
  snapshotStatus,
  hasError: false,
  ...extra,
});
const input = (partial: Partial<HomeEntitlementInput>): HomeEntitlementInput => ({
  scenario: 'live',
  subscription: none,
  turboEngine: none,
  ...partial,
});

describe('resolveHomeEntitlementTier', () => {
  it('is paid when either entitlement is active', () => {
    assert.equal(resolveHomeEntitlementTier(input({ subscription: source('active'), turboEngine: source('inactive') })), 'paid');
    assert.equal(resolveHomeEntitlementTier(input({ subscription: source('inactive'), turboEngine: source('active') })), 'paid');
  });

  it('is free when both entitlements resolved inactive', () => {
    assert.equal(resolveHomeEntitlementTier(input({ subscription: source('inactive'), turboEngine: source('inactive') })), 'free');
  });

  it('is free outside the Store runtime, where no bridge exists', () => {
    assert.equal(resolveHomeEntitlementTier(input({})), 'free');
  });

  it('stays unknown while a snapshot is still pending, so no purchase prompt flashes at a paying user', () => {
    assert.equal(resolveHomeEntitlementTier(input({ subscription: source(undefined), turboEngine: source('inactive') })), 'unknown');
  });

  it('treats a failed lookup as final and falls back to free', () => {
    assert.equal(
      resolveHomeEntitlementTier(input({ subscription: source(undefined, { hasError: true }), turboEngine: source('inactive') })),
      'free',
    );
  });

  it('lets one active entitlement win over a pending one', () => {
    assert.equal(resolveHomeEntitlementTier(input({ subscription: source('active'), turboEngine: source(undefined) })), 'paid');
  });

  it('follows the commerce preview scenario over live state', () => {
    assert.equal(resolveHomeEntitlementTier(input({ scenario: 'active' })), 'paid');
    assert.equal(resolveHomeEntitlementTier(input({ scenario: 'inactive', subscription: source('active') })), 'free');
    assert.equal(resolveHomeEntitlementTier(input({ scenario: 'non-store', subscription: source('active') })), 'free');
  });
});

describe('planHomeRail', () => {
  const withHighlights = { hasHighlights: true };
  const withoutHighlights = { hasHighlights: false };

  it('guides free users: purchase beside the operations, Highlights and rating below', () => {
    const plan = planHomeRail('free', withHighlights);
    assert.deepEqual(plan.side, ['offer', 'donation']);
    assert.deepEqual(plan.band, ['highlights', 'rating']);
    assert.equal(plan.offerCompact, false);
  });

  it('serves paid users: no purchase panel in the rail, a one-line license row under Highlights', () => {
    const plan = planHomeRail('paid', withHighlights);
    assert.deepEqual(plan.side, ['donation']);
    assert.deepEqual(plan.band, ['highlights', 'offer', 'rating']);
    assert.equal(plan.offerCompact, true);
  });

  it('shows no commerce slot while the tier is unknown', () => {
    const plan = planHomeRail('unknown', withHighlights);
    assert.deepEqual(plan.side, []);
    assert.deepEqual(plan.band, ['highlights']);
  });

  it('drops Highlights when there is nothing to show, without leaving gaps', () => {
    assert.deepEqual(planHomeRail('free', withoutHighlights).band, ['rating']);
    assert.deepEqual(planHomeRail('paid', withoutHighlights).band, ['offer', 'rating']);
    assert.deepEqual(planHomeRail('unknown', withoutHighlights), { side: [], band: [], offerCompact: false });
  });

  it('places every slot at most once', () => {
    for (const tier of ['free', 'paid', 'unknown'] as const) {
      for (const options of [withHighlights, withoutHighlights]) {
        const plan = planHomeRail(tier, options);
        const slots = [...plan.side, ...plan.band];
        assert.equal(new Set(slots).size, slots.length);
      }
    }
  });
});
