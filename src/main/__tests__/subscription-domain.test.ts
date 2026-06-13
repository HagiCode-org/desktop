import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDefaultSubscriptionSnapshot, subscriptionEntitlementNames } from '../../types/subscription.js';
import { EntitlementEvaluator } from '../subscription/entitlement-evaluator.js';
import { normalizeSubscriptionSnapshot } from '../subscription/normalize.js';
import type {
  RawStorePurchaseResult,
  RawStoreSubscriptionState,
  SubscriptionPlatformBroker,
} from '../subscription/subscription-broker.js';
import { SubscriptionService } from '../subscription/subscription-service.js';
import { SubscriptionSnapshotStore } from '../subscription/subscription-store.js';

class MemoryElectronStore {
  private readonly values = new Map<string, unknown>();

  get(key: string): unknown {
    return this.values.get(key);
  }

  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }
}

class MockBroker implements SubscriptionPlatformBroker {
  constructor(
    private readonly queryStatusImpl: () => Promise<RawStoreSubscriptionState>,
    private readonly purchaseImpl: () => Promise<RawStorePurchaseResult> = async () => ({
      outcome: 'not-supported',
      errorCode: null,
      errorMessage: null,
    }),
  ) {}

  queryStatus(): Promise<RawStoreSubscriptionState> {
    return this.queryStatusImpl();
  }

  purchase(): Promise<RawStorePurchaseResult> {
    return this.purchaseImpl();
  }

  dispose(): void {}
}

describe('subscription domain', () => {
  it('normalizes supported Microsoft Store snapshots into desktop-owned state', () => {
    const snapshot = normalizeSubscriptionSnapshot({
      fetchedAt: '2026-06-13T10:42:00.000Z',
      availability: 'supported',
      appLicenseActive: true,
      product: {
        storeId: '9N0BTGWV23M1',
        title: 'Hagicode Sponsor Plan',
      },
      sku: {
        storeId: '9N0BTGWV23M1/0010',
        title: 'Monthly subscription',
        isSubscription: true,
        isInUserCollection: true,
        collectionEndDate: '2026-08-31T00:00:00.000Z',
      },
      license: {
        storeId: '9N0BTGWV23M1/0010',
        isActive: true,
        expirationDate: '2026-08-31T00:00:00.000Z',
      },
      purchaseEligibility: 'license-action-not-applicable',
      errorCode: null,
      errorMessage: null,
    });

    assert.equal(snapshot.availability, 'supported');
    assert.equal(snapshot.status, 'active');
    assert.equal(snapshot.source, 'store');
    assert.equal(snapshot.isStale, false);
    assert.equal(snapshot.lastCheckedAt, '2026-06-13T10:42:00.000Z');
    assert.equal(snapshot.lastSuccessfulSyncAt, '2026-06-13T10:42:00.000Z');
    assert.equal(snapshot.expirationDate, '2026-08-31T00:00:00.000Z');
  });

  it('derives entitlement flags only for active supported snapshots', () => {
    const evaluator = new EntitlementEvaluator();

    const activeEntitlements = evaluator.evaluate(createDefaultSubscriptionSnapshot({
      availability: 'supported',
      status: 'active',
    }));
    const inactiveEntitlements = evaluator.evaluate(createDefaultSubscriptionSnapshot({
      availability: 'supported',
      status: 'inactive',
    }));

    assert.deepEqual(activeEntitlements, [...subscriptionEntitlementNames]);
    assert.deepEqual(inactiveEntitlements, []);
  });

  it('falls back to a stale cached snapshot when a Store refresh fails', async () => {
    const cache = new MemoryElectronStore();
    const snapshotStore = new SubscriptionSnapshotStore(cache as never);
    const cachedSnapshot = createDefaultSubscriptionSnapshot({
      availability: 'supported',
      status: 'active',
      source: 'store',
      lastSuccessfulSyncAt: '2026-06-13T09:00:00.000Z',
      lastCheckedAt: '2026-06-13T09:00:00.000Z',
    });

    snapshotStore.save(cachedSnapshot);

    const service = new SubscriptionService({
      broker: new MockBroker(async () => {
        throw new Error('offline');
      }),
      snapshotStore,
      entitlementEvaluator: new EntitlementEvaluator(),
    });

    const snapshot = await service.refresh('manual');
    const latestDiagnostic = snapshot.diagnostics[snapshot.diagnostics.length - 1];

    assert.equal(snapshot.isStale, true);
    assert.equal(snapshot.source, 'fallback');
    assert.deepEqual(snapshot.entitlements, [...subscriptionEntitlementNames]);
    assert.equal(latestDiagnostic?.code, 'store-refresh-failed');
    assert.match(latestDiagnostic?.detail ?? '', /offline/);
  });
});
