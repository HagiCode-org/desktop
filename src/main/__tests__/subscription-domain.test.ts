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

class MockBroker implements SubscriptionPlatformBroker {
  public queryStatusCallCount = 0;

  constructor(
    private readonly queryStatusImpl: () => Promise<RawStoreSubscriptionState>,
    private readonly purchaseImpl: () => Promise<RawStorePurchaseResult> = async () => ({
      outcome: 'not-supported',
      errorCode: null,
      errorMessage: null,
    }),
  ) {}

  queryStatus(): Promise<RawStoreSubscriptionState> {
    this.queryStatusCallCount += 1;
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
        isInUserCollection: true,
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

  it('does not treat non-owned subscriptions as active when Store license actions are not applicable', () => {
    const snapshot = normalizeSubscriptionSnapshot({
      fetchedAt: '2026-06-14T05:30:43.967Z',
      availability: 'supported',
      appLicenseActive: true,
      product: {
        storeId: '9N0BTGWV23M1',
        title: null,
        isInUserCollection: false,
      },
      sku: null,
      license: null,
      purchaseEligibility: 'license-action-not-applicable',
      errorCode: null,
      errorMessage: null,
    });

    assert.equal(snapshot.status, 'inactive');
    assert.equal(snapshot.isStale, false);
  });

  it('falls back to the last successful in-session snapshot when a Store refresh fails', async () => {
    let seeded = false;
    const service = new SubscriptionService({
      broker: new MockBroker(async () => {
        if (!seeded) {
          seeded = true;
          return {
            fetchedAt: '2026-06-13T09:00:00.000Z',
            availability: 'supported',
            appLicenseActive: true,
            product: {
              storeId: '9N0BTGWV23M1',
              title: 'Hagicode Sponsor Plan',
              isInUserCollection: true,
            },
            sku: null,
            license: {
              storeId: '9N0BTGWV23M1',
              isActive: true,
              expirationDate: '2026-08-31T00:00:00.000Z',
            },
            purchaseEligibility: 'license-action-not-applicable',
            errorCode: null,
            errorMessage: null,
          };
        }
        throw new Error('offline');
      }),
      entitlementEvaluator: new EntitlementEvaluator(),
    });

    await service.refresh('manual');
    const snapshot = await service.refresh('manual');
    const latestDiagnostic = snapshot.diagnostics[snapshot.diagnostics.length - 1];

    assert.equal(snapshot.isStale, true);
    assert.equal(snapshot.source, 'fallback');
    assert.deepEqual(snapshot.entitlements, [...subscriptionEntitlementNames]);
    assert.equal(latestDiagnostic?.code, 'store-refresh-failed');
    assert.match(latestDiagnostic?.detail ?? '', /offline/);
  });

  it('retries transient Store availability failures before replacing an active in-session snapshot', async () => {
    const responses: RawStoreSubscriptionState[] = [
      {
        fetchedAt: '2026-06-15T08:00:00.000Z',
        availability: 'supported',
        appLicenseActive: true,
        product: {
          storeId: '9N0BTGWV23M1',
          title: 'Hagicode Sponsor Plan',
          isInUserCollection: true,
        },
        sku: null,
        license: {
          storeId: '9N0BTGWV23M1',
          isActive: true,
          expirationDate: '2026-08-31T00:00:00.000Z',
        },
        purchaseEligibility: 'license-action-not-applicable',
        errorCode: null,
        errorMessage: null,
      },
      {
        fetchedAt: '2026-06-15T09:00:00.000Z',
        availability: 'store-unavailable',
        appLicenseActive: false,
        product: null,
        sku: null,
        license: null,
        purchaseEligibility: 'unknown',
        errorCode: 'store-temporary-unavailable',
        errorMessage: 'temporary outage',
      },
      {
        fetchedAt: '2026-06-15T09:00:01.000Z',
        availability: 'supported',
        appLicenseActive: true,
        product: {
          storeId: '9N0BTGWV23M1',
          title: 'Hagicode Sponsor Plan',
          isInUserCollection: true,
        },
        sku: null,
        license: {
          storeId: '9N0BTGWV23M1',
          isActive: true,
          expirationDate: '2026-08-31T00:00:00.000Z',
        },
        purchaseEligibility: 'license-action-not-applicable',
        errorCode: null,
        errorMessage: null,
      },
    ];
    const broker = new MockBroker(async () => {
      const next = responses.shift();
      assert.ok(next, 'expected a queued Store response');
      return next;
    });
    const service = new SubscriptionService({
      broker,
      entitlementEvaluator: new EntitlementEvaluator(),
      retryPolicy: {
        maxAttempts: 2,
        retryDelayMs: 0,
      },
    });

    await service.refresh('manual');
    broker.queryStatusCallCount = 0;
    const snapshot = await service.refresh('manual');

    assert.equal(broker.queryStatusCallCount, 2);
    assert.equal(snapshot.availability, 'supported');
    assert.equal(snapshot.status, 'active');
    assert.equal(snapshot.source, 'store');
    assert.equal(snapshot.isStale, false);
  });

  it('retries activation regressions before accepting a negative subscription status', async () => {
    const responses: RawStoreSubscriptionState[] = [
      {
        fetchedAt: '2026-06-15T08:00:00.000Z',
        availability: 'supported',
        appLicenseActive: true,
        product: {
          storeId: '9N0BTGWV23M1',
          title: 'Hagicode Sponsor Plan',
          isInUserCollection: true,
        },
        sku: null,
        license: {
          storeId: '9N0BTGWV23M1',
          isActive: true,
          expirationDate: '2026-08-31T00:00:00.000Z',
        },
        purchaseEligibility: 'license-action-not-applicable',
        errorCode: null,
        errorMessage: null,
      },
      {
        fetchedAt: '2026-06-15T09:00:00.000Z',
        availability: 'supported',
        appLicenseActive: true,
        product: {
          storeId: '9N0BTGWV23M1',
          title: 'Hagicode Sponsor Plan',
          isInUserCollection: false,
        },
        sku: null,
        license: null,
        purchaseEligibility: 'licensable',
        errorCode: null,
        errorMessage: null,
      },
      {
        fetchedAt: '2026-06-15T09:00:01.000Z',
        availability: 'supported',
        appLicenseActive: true,
        product: {
          storeId: '9N0BTGWV23M1',
          title: 'Hagicode Sponsor Plan',
          isInUserCollection: true,
        },
        sku: null,
        license: {
          storeId: '9N0BTGWV23M1',
          isActive: true,
          expirationDate: '2026-08-31T00:00:00.000Z',
        },
        purchaseEligibility: 'license-action-not-applicable',
        errorCode: null,
        errorMessage: null,
      },
    ];
    const broker = new MockBroker(async () => {
      const next = responses.shift();
      assert.ok(next, 'expected a queued Store response');
      return next;
    });
    const service = new SubscriptionService({
      broker,
      entitlementEvaluator: new EntitlementEvaluator(),
      retryPolicy: {
        maxAttempts: 2,
        retryDelayMs: 0,
      },
    });

    await service.refresh('manual');
    broker.queryStatusCallCount = 0;
    const snapshot = await service.refresh('manual');

    assert.equal(broker.queryStatusCallCount, 2);
    assert.equal(snapshot.status, 'active');
    assert.deepEqual(snapshot.entitlements, [...subscriptionEntitlementNames]);
  });

  it('keeps the last successful subscription snapshot when Store availability stays unavailable across retries', async () => {
    let seeded = false;
    const broker = new MockBroker(async () => {
      if (!seeded) {
        seeded = true;
        return {
          fetchedAt: '2026-06-15T08:00:00.000Z',
          availability: 'supported',
          appLicenseActive: true,
          product: {
            storeId: '9N0BTGWV23M1',
            title: 'Hagicode Sponsor Plan',
            isInUserCollection: true,
          },
          sku: null,
          license: {
            storeId: '9N0BTGWV23M1',
            isActive: true,
            expirationDate: '2026-08-31T00:00:00.000Z',
          },
          purchaseEligibility: 'license-action-not-applicable',
          errorCode: null,
          errorMessage: null,
        };
      }

      return {
        fetchedAt: '2026-06-15T09:00:00.000Z',
        availability: 'store-unavailable',
        appLicenseActive: false,
        product: null,
        sku: null,
        license: null,
        purchaseEligibility: 'unknown',
        errorCode: 'store-temporary-unavailable',
        errorMessage: 'temporary outage',
      };
    });
    const service = new SubscriptionService({
      broker,
      entitlementEvaluator: new EntitlementEvaluator(),
      retryPolicy: {
        maxAttempts: 2,
        retryDelayMs: 0,
      },
    });

    await service.refresh('manual');
    broker.queryStatusCallCount = 0;
    const snapshot = await service.refresh('manual');

    assert.equal(broker.queryStatusCallCount, 2);
    assert.equal(snapshot.availability, 'supported');
    assert.equal(snapshot.source, 'fallback');
    assert.equal(snapshot.isStale, true);
    assert.deepEqual(snapshot.entitlements, [...subscriptionEntitlementNames]);
    assert.equal(snapshot.diagnostics[snapshot.diagnostics.length - 1]?.code, 'store-refresh-failed');
  });

  it('does not force a refresh when the purchase flow closes without completing payment', async () => {
    const broker = new MockBroker(async () => ({
      fetchedAt: '2026-06-15T08:00:00.000Z',
      availability: 'supported',
      appLicenseActive: true,
      product: {
        storeId: '9N0BTGWV23M1',
        title: 'Hagicode Sponsor Plan',
        isInUserCollection: false,
      },
      sku: null,
      license: null,
      purchaseEligibility: 'licensable',
      errorCode: null,
      errorMessage: null,
    }));
    const service = new SubscriptionService({
      broker,
      entitlementEvaluator: new EntitlementEvaluator(),
    });

    const snapshot = service.getCurrentSnapshot();
    const result = await service.completePurchase({
      outcome: 'not-purchased',
      errorCode: null,
      errorMessage: null,
    });

    assert.equal(broker.queryStatusCallCount, 0);
    assert.equal(result.outcome, 'not-purchased');
    assert.equal(result.snapshot, snapshot);
  });

  it('reuses the startup refresh path for subscription verification', async () => {
    const service = new SubscriptionService({
      broker: new MockBroker(async () => ({
        fetchedAt: '2026-06-15T08:00:00.000Z',
        availability: 'supported',
        appLicenseActive: true,
        product: {
          storeId: '9N0BTGWV23M1',
          title: 'Hagicode Sponsor Plan',
          isInUserCollection: true,
        },
        sku: null,
        license: {
          storeId: '9N0BTGWV23M1',
          isActive: true,
          expirationDate: '2026-08-31T00:00:00.000Z',
        },
        purchaseEligibility: 'license-action-not-applicable',
        errorCode: null,
        errorMessage: null,
      })),
      entitlementEvaluator: new EntitlementEvaluator(),
    });

    const snapshot = await service.verifyOnStartup();

    assert.equal(snapshot.availability, 'supported');
    assert.equal(snapshot.status, 'active');
  });
});
