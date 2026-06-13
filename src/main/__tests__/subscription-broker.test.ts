import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  RawStorePurchaseResult,
  RawStoreSubscriptionState,
  SubscriptionPlatformBroker,
} from '../subscription/subscription-broker.js';
import { MicrosoftStoreSubscriptionBroker } from '../subscription/subscription-broker.js';

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

describe('subscription broker', () => {
  it('passes the native window handle to the dynwinrt adapter as a bigint', async () => {
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

  it('returns an unavailable snapshot when dynwinrt initialization fails', async () => {
    const broker = new MicrosoftStoreSubscriptionBroker({
      adapterFactory: async () => {
        throw new Error('dynwinrt bindings missing');
      },
    });

    const status = await broker.queryStatus();
    const purchase = await broker.purchase();

    assert.equal(status.availability, 'store-unavailable');
    assert.match(status.errorMessage ?? '', /dynwinrt bindings missing/);
    assert.equal(purchase.outcome, 'not-supported');
    assert.match(purchase.errorMessage ?? '', /dynwinrt bindings missing/);
  });
});
