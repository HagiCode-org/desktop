import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { HAGICODE_SPONSOR_PLAN_STORE_ID } from '../../types/subscription.js';
import { HAGICODE_TURBOENGINE_STORE_ID, turboEngineProductConfig } from '../../types/turboengine-license.js';
import type {
  RawStorePurchaseResult,
  RawStoreSubscriptionState,
  SubscriptionPlatformBroker,
} from '../subscription/subscription-broker.js';
import { buildSupportedStateFromProductQueries, MicrosoftStoreSubscriptionBroker } from '../subscription/subscription-broker.js';

const brokerPath = path.resolve(process.cwd(), 'src/main/subscription/subscription-broker.ts');

class MockPlatformBroker implements SubscriptionPlatformBroker {
  constructor(
    private readonly queryStatusImpl: () => Promise<RawStoreSubscriptionState>,
    private readonly purchaseImpl: () => Promise<RawStorePurchaseResult>,
  ) {}

  queryStatus(): Promise<RawStoreSubscriptionState> {
    return this.queryStatusImpl();
  }

  purchase(): Promise<RawStorePurchaseResult> {
    return this.purchaseImpl();
  }

  dispose(): void {}
}

function toWinRtDateTime(isoString: string): { universalTime: bigint } {
  return {
    universalTime: BigInt(Date.parse(isoString) + 11644473600000) * 10000n,
  };
}

function createProductQueryResult(products: Record<string, Record<string, unknown>>): {
  products: {
    hasKey: (key: string) => boolean;
    get: (key: string) => Record<string, unknown> | undefined;
  };
  extendedError: 0;
} {
  return {
    products: {
      hasKey: (key) => Object.prototype.hasOwnProperty.call(products, key),
      get: (key) => products[key],
    },
    extendedError: 0,
  };
}

describe('subscription broker', () => {
  it('passes the native window handle to the broker adapter as a bigint', async () => {
    let observedHandle: bigint | null = null;

    const broker = new MicrosoftStoreSubscriptionBroker({
      windowHandle: Buffer.from([0x78, 0x56, 0x34, 0x12, 0, 0, 0, 0]),
      adapterFactory: async (windowHandle) => {
        observedHandle = windowHandle;

        return new MockPlatformBroker(
          async () => ({
            fetchedAt: '2026-06-13T12:00:00.000Z',
            availability: 'supported',
            appLicenseActive: true,
            product: null,
            sku: null,
            license: null,
            purchaseEligibility: 'licensable',
            errorCode: null,
            errorMessage: null,
          }),
          async () => ({
            outcome: 'succeeded',
            errorCode: null,
            errorMessage: null,
          }),
        );
      },
    });

    await broker.queryStatus();

    assert.equal(observedHandle, 0x12345678n);
  });

  it('returns an unavailable snapshot when native addon broker initialization fails', async () => {
    const broker = new MicrosoftStoreSubscriptionBroker({
      adapterFactory: async () => {
        throw new Error('native addon missing');
      },
    });

    const status = await broker.queryStatus();
    const purchase = await broker.purchase();

    assert.equal(status.availability, 'store-unavailable');
    assert.match(status.errorMessage ?? '', /native addon missing/);
    assert.equal(purchase.outcome, 'not-supported');
    assert.match(purchase.errorMessage ?? '', /native addon missing/);
  });

  it('builds a supported subscription snapshot from associated and collection product queries', () => {
    const expirationDate = '2026-07-01T00:00:00.000Z';
    const state = buildSupportedStateFromProductQueries({
      fetchedAt: '2026-06-14T06:00:00.000Z',
      associatedQueryResult: createProductQueryResult({
        [HAGICODE_SPONSOR_PLAN_STORE_ID]: {
          storeId: HAGICODE_SPONSOR_PLAN_STORE_ID,
          title: 'Hagicode Sponsor Plan',
          isInUserCollection: false,
          skus: [
            {
              storeId: `${HAGICODE_SPONSOR_PLAN_STORE_ID}/0010`,
              title: 'Monthly subscription',
              isSubscription: true,
              isInUserCollection: false,
              collectionData: {
                endDate: toWinRtDateTime(expirationDate),
              },
            },
          ],
        },
      }),
      collectionQueryResult: createProductQueryResult({
        [HAGICODE_SPONSOR_PLAN_STORE_ID]: {
          storeId: HAGICODE_SPONSOR_PLAN_STORE_ID,
          title: 'Hagicode Sponsor Plan',
          isInUserCollection: true,
          skus: [
            {
              storeId: `${HAGICODE_SPONSOR_PLAN_STORE_ID}/0010`,
              title: 'Monthly subscription',
              isSubscription: true,
              isInUserCollection: true,
              collectionData: {
                endDate: toWinRtDateTime(expirationDate),
              },
            },
          ],
        },
      }),
    });

    assert.equal(state.availability, 'supported');
    assert.equal(state.product?.storeId, HAGICODE_SPONSOR_PLAN_STORE_ID);
    assert.equal(state.product?.isInUserCollection, true);
    assert.equal(state.sku?.isInUserCollection, true);
    assert.equal(state.sku?.collectionEndDate, expirationDate);
    assert.equal(state.license, null);
    assert.equal(state.purchaseEligibility, 'license-action-not-applicable');
    assert.equal(state.errorCode, null);
  });

  it('uses product-configured Store IDs when reading TurboEngine ownership from collection queries', () => {
    const state = buildSupportedStateFromProductQueries({
      fetchedAt: '2026-06-14T06:00:00.000Z',
      associatedQueryResult: createProductQueryResult({
        [HAGICODE_TURBOENGINE_STORE_ID]: {
          storeId: HAGICODE_TURBOENGINE_STORE_ID,
          title: 'TurboEngine',
          isInUserCollection: false,
          skus: [
            {
              storeId: `${HAGICODE_TURBOENGINE_STORE_ID}/0010`,
              title: 'TurboEngine durable',
              isSubscription: false,
              isInUserCollection: false,
            },
          ],
        },
      }),
      collectionQueryResult: createProductQueryResult({
        [HAGICODE_TURBOENGINE_STORE_ID]: {
          storeId: HAGICODE_TURBOENGINE_STORE_ID,
          title: 'TurboEngine',
          isInUserCollection: true,
          skus: [
            {
              storeId: `${HAGICODE_TURBOENGINE_STORE_ID}/0010`,
              title: 'TurboEngine durable',
              isSubscription: false,
              isInUserCollection: true,
            },
          ],
        },
      }),
      productConfig: turboEngineProductConfig,
    });

    assert.equal(state.product?.storeId, HAGICODE_TURBOENGINE_STORE_ID);
    assert.equal(state.product?.title, 'TurboEngine');
    assert.equal(state.product?.isInUserCollection, true);
    assert.equal(state.sku?.isInUserCollection, true);
    assert.equal(state.purchaseEligibility, 'license-action-not-applicable');
  });

  it('routes reads and purchases through the packaged native addon without a dynwinrt JS fallback', async () => {
    const source = await fs.readFile(brokerPath, 'utf8');

    assert.match(source, /executeWindowsStoreStatusAddon\(\{/);
    assert.match(source, /executeWindowsStorePurchaseAddon\(\{/);
    assert.doesNotMatch(source, /StoreContext\.getDefault/);
    assert.doesNotMatch(source, /@microsoft\/dynwinrt/);
  });

});
