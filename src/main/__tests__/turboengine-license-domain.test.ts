import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDefaultTurboEngineLicenseSnapshot,
  resolveTurboEngineDlcProgramOption,
  TURBOENGINE_DLC_PROGRAM_OPTION_SOURCE,
} from '../../types/turboengine-license.js';
import { TurboEngineEntitlementEvaluator } from '../subscription/turboengine-entitlement-evaluator.js';
import { normalizeTurboEngineLicenseSnapshot } from '../subscription/normalize.js';
import { TurboEngineLicenseService } from '../subscription/turboengine-license-service.js';
import { TurboEngineLicenseSnapshotStore } from '../subscription/turboengine-license-store.js';
import type {
  RawStorePurchaseResult,
  RawStoreSubscriptionState,
  SubscriptionPlatformBroker,
} from '../subscription/subscription-broker.js';

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

describe('TurboEngine license domain', () => {
  it('treats active perpetual ownership without expiration metadata as active', () => {
    const snapshot = normalizeTurboEngineLicenseSnapshot({
      fetchedAt: '2026-06-15T09:00:00.000Z',
      availability: 'supported',
      appLicenseActive: true,
      product: {
        storeId: '9NSD809W18Z6',
        title: 'TurboEngine',
      },
      sku: null,
      license: {
        storeId: '9NSD809W18Z6',
        isActive: true,
        expirationDate: null,
      },
      purchaseEligibility: 'license-action-not-applicable',
      errorCode: null,
      errorMessage: null,
    });

    assert.equal(snapshot.status, 'active');
    assert.equal(snapshot.expirationDate, null);
    assert.equal(snapshot.productName, 'TurboEngine');
  });

  it('keeps the last TurboEngine snapshot stale when live refresh fails after startup cache load', async () => {
    const cache = new MemoryElectronStore();
    const snapshotStore = new TurboEngineLicenseSnapshotStore(cache as never);
    const cachedSnapshot = createDefaultTurboEngineLicenseSnapshot({
      availability: 'supported',
      status: 'active',
      source: 'store',
      lastSuccessfulSyncAt: '2026-06-15T08:00:00.000Z',
      lastCheckedAt: '2026-06-15T08:00:00.000Z',
    });

    snapshotStore.save(cachedSnapshot);

    const service = new TurboEngineLicenseService({
      broker: new MockBroker(async () => {
        throw new Error('offline');
      }),
      snapshotStore,
      entitlementEvaluator: new TurboEngineEntitlementEvaluator(),
    });

    const snapshot = await service.verifyOnStartup();

    assert.equal(snapshot.isStale, true);
    assert.equal(snapshot.source, 'fallback');
    assert.deepEqual(snapshot.entitlements, ['turboEngineAccess']);
    assert.equal(snapshot.diagnostics[snapshot.diagnostics.length - 1]?.code, 'store-refresh-failed');
  });

  it('maps known TurboEngine license states to managed DLC program options', () => {
    const active = resolveTurboEngineDlcProgramOption(createDefaultTurboEngineLicenseSnapshot({
      status: 'active',
    }));
    const inactive = resolveTurboEngineDlcProgramOption(createDefaultTurboEngineLicenseSnapshot({
      status: 'inactive',
    }));
    const unknown = resolveTurboEngineDlcProgramOption(createDefaultTurboEngineLicenseSnapshot({
      status: 'unknown',
    }));

    assert.deepEqual(active, {
      enabled: true,
      source: TURBOENGINE_DLC_PROGRAM_OPTION_SOURCE,
    });
    assert.deepEqual(inactive, {
      enabled: false,
      source: TURBOENGINE_DLC_PROGRAM_OPTION_SOURCE,
    });
    assert.deepEqual(unknown, {
      enabled: null,
      source: null,
    });
  });
});
