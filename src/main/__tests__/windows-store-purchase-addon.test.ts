import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  executeWindowsStoreGetUnfulfilledConsumables,
  executeWindowsStorePurchaseAddon,
  executeWindowsStoreReportConsumableFulfillment,
  executeWindowsStoreStatusAddon,
  parseWindowsStoreLicenseQueryAddonResult,
  parseWindowsStorePurchaseAddonResult,
  parseWindowsStoreReportConsumableFulfillmentResult,
  parseWindowsStoreUnfulfilledConsumablesResult,
  resolveWindowsStorePurchaseAddonPath,
} from '../subscription/windows-store-purchase-addon.js';

describe('windows store purchase addon', () => {
  it('resolves the packaged addon module under resources/extra', () => {
    const modulePath = resolveWindowsStorePurchaseAddonPath({
      resourcesPath: 'C:\\app\\resources',
      arch: 'x64',
    });

    assert.equal(
      modulePath,
      path.join('C:\\app\\resources', 'extra', 'windows-store-purchase-addon', 'x64', 'hagicode_store_purchase_addon.node'),
    );
  });

  it('parses addon output into a purchase result', () => {
    const result = parseWindowsStorePurchaseAddonResult({
      outcome: 'succeeded',
      errorCode: null,
      errorMessage: null,
    });

    assert.deepEqual(result, {
      outcome: 'succeeded',
      errorCode: null,
      errorMessage: null,
    });
  });

  it('accepts not-purchased as a distinct purchase outcome', () => {
    const result = parseWindowsStorePurchaseAddonResult({
      outcome: 'not-purchased',
      errorCode: null,
      errorMessage: null,
    });

    assert.deepEqual(result, {
      outcome: 'not-purchased',
      errorCode: null,
      errorMessage: null,
    });
  });

  it('passes store id and owner window to the addon module', async () => {
    let observedModulePath = '';
    let observedStoreId = '';
    let observedOwnerWindow: string | null | undefined;

    const result = await executeWindowsStorePurchaseAddon({
      modulePath: 'C:\\addon\\hagicode_store_purchase_addon.node',
      storeId: '9N0BTGWV23M1',
      ownerWindowHandle: 0x1234n,
    }, (modulePath) => {
      observedModulePath = modulePath;

      return {
        async requestPurchase(storeId, ownerWindowHandle) {
          observedStoreId = storeId;
          observedOwnerWindow = ownerWindowHandle;
          return {
            outcome: 'already-purchased',
            errorCode: null,
            errorMessage: null,
          };
        },
        async queryStoreStatus() {
          throw new Error('not used');
        },
      };
    });

    assert.equal(observedModulePath, 'C:\\addon\\hagicode_store_purchase_addon.node');
    assert.equal(observedStoreId, '9N0BTGWV23M1');
    assert.equal(observedOwnerWindow, '0x1234');
    assert.equal(result.outcome, 'already-purchased');
  });

  it('parses addon output into a store status result', () => {
    const result = parseWindowsStoreLicenseQueryAddonResult({
      fetchedAt: '2026-06-15T10:00:00.000Z',
      availability: 'supported',
      appLicenseActive: false,
      product: {
        storeId: '9N0BTGWV23M1',
        title: 'Sponsor Plan',
        isInUserCollection: true,
      },
      sku: {
        storeId: '9N0BTGWV23M1/0010',
        title: 'Monthly',
        isSubscription: true,
        isInUserCollection: true,
        collectionEndDate: '2026-07-15T00:00:00.000Z',
      },
      license: null,
      purchaseEligibility: 'license-action-not-applicable',
      errorCode: null,
      errorMessage: null,
    }, {
      storeId: '9N0BTGWV23M1',
      productName: 'Sponsor Plan',
    });

    assert.deepEqual(result, {
      fetchedAt: '2026-06-15T10:00:00.000Z',
      availability: 'supported',
      appLicenseActive: false,
      product: {
        storeId: '9N0BTGWV23M1',
        title: 'Sponsor Plan',
        isInUserCollection: true,
      },
      sku: {
        storeId: '9N0BTGWV23M1/0010',
        title: 'Monthly',
        isSubscription: true,
        isInUserCollection: true,
        collectionEndDate: '2026-07-15T00:00:00.000Z',
      },
      license: null,
      purchaseEligibility: 'license-action-not-applicable',
      errorCode: null,
      errorMessage: null,
    });
  });

  it('passes store status query arguments to the addon module', async () => {
    let observedStoreId = '';
    let observedProductName = '';
    let observedProductKinds: string[] = [];

    const result = await executeWindowsStoreStatusAddon({
      modulePath: 'C:\\addon\\hagicode_store_purchase_addon.node',
      storeId: '9N0BTGWV23M1',
      productName: 'Sponsor Plan',
      productKinds: ['Subscription', 'Durable'],
    }, () => ({
      async requestPurchase() {
        throw new Error('not used');
      },
      async queryStoreStatus(storeId, productName, productKinds) {
        observedStoreId = storeId;
        observedProductName = productName;
        observedProductKinds = productKinds;
        return {
          fetchedAt: '2026-06-15T10:00:00.000Z',
          availability: 'supported',
          appLicenseActive: false,
          product: {
            storeId,
            title: productName,
            isInUserCollection: false,
          },
          sku: null,
          license: null,
          purchaseEligibility: 'licensable',
          errorCode: null,
          errorMessage: null,
        };
      },
    }));

    assert.equal(observedStoreId, '9N0BTGWV23M1');
    assert.equal(observedProductName, 'Sponsor Plan');
    assert.deepEqual(observedProductKinds, ['Subscription', 'Durable']);
    assert.equal(result.availability, 'supported');
    assert.equal(result.purchaseEligibility, 'licensable');
  });
});


describe('windows store consumable addon helpers', () => {
  it('parses unfulfilled consumables list', () => {
    const result = parseWindowsStoreUnfulfilledConsumablesResult({
      ok: true,
      items: [
        { trackingId: 'tid-1', productId: '9NC5T6VC1NQH', quantity: 1 },
        { trackingId: '', productId: '9NSKR15751LN', quantity: 2 },
        { productId: '', quantity: 1 },
      ],
      errorCode: null,
      errorMessage: null,
    });

    assert.deepEqual(result, {
      ok: true,
      items: [
        { trackingId: 'tid-1', productId: '9NC5T6VC1NQH', quantity: 1 },
        { trackingId: '', productId: '9NSKR15751LN', quantity: 2 },
      ],
      errorCode: null,
      errorMessage: null,
    });
  });

  it('parses report consumable fulfillment result', () => {
    const result = parseWindowsStoreReportConsumableFulfillmentResult({
      ok: true,
      status: 'succeeded',
      trackingId: 'tid-2',
      balanceRemaining: 0,
      errorCode: null,
      errorMessage: null,
    });

    assert.deepEqual(result, {
      ok: true,
      status: 'succeeded',
      trackingId: 'tid-2',
      balanceRemaining: 0,
      errorCode: null,
      errorMessage: null,
    });
  });

  it('executes getUnfulfilledConsumables through the addon loader', async () => {
    let observedModulePath = '';
    let observedProductIds: string[] | undefined;

    const result = await executeWindowsStoreGetUnfulfilledConsumables({
      modulePath: 'C:\\addon\\hagicode_store_purchase_addon.node',
      productIds: ['9NC5T6VC1NQH'],
    }, (modulePath) => {
      observedModulePath = modulePath;
      return {
        async requestPurchase() {
          return { outcome: 'failed' };
        },
        async queryStoreStatus() {
          return { availability: 'error' };
        },
        async getUnfulfilledConsumables(productIds) {
          observedProductIds = productIds;
          return {
            ok: true,
            items: [{ trackingId: 't1', productId: '9NC5T6VC1NQH', quantity: 1 }],
            errorCode: null,
            errorMessage: null,
          };
        },
      };
    });

    assert.equal(observedModulePath, 'C:\\addon\\hagicode_store_purchase_addon.node');
    assert.deepEqual(observedProductIds, ['9NC5T6VC1NQH']);
    assert.equal(result.ok, true);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.productId, '9NC5T6VC1NQH');
  });

  it('returns addon-unsupported when consumable exports are missing', async () => {
    const unfulfilled = await executeWindowsStoreGetUnfulfilledConsumables({
      modulePath: 'C:\\addon\\hagicode_store_purchase_addon.node',
    }, () => ({
      async requestPurchase() {
        return { outcome: 'failed' };
      },
      async queryStoreStatus() {
        return { availability: 'error' };
      },
    }));

    assert.equal(unfulfilled.ok, false);
    assert.equal(unfulfilled.errorCode, 'addon-unsupported');

    const report = await executeWindowsStoreReportConsumableFulfillment({
      modulePath: 'C:\\addon\\hagicode_store_purchase_addon.node',
      productId: '9NC5T6VC1NQH',
      trackingId: 'tid',
    }, () => ({
      async requestPurchase() {
        return { outcome: 'failed' };
      },
      async queryStoreStatus() {
        return { availability: 'error' };
      },
    }));

    assert.equal(report.ok, false);
    assert.equal(report.errorCode, 'addon-unsupported');
  });

  it('executes reportConsumableFulfillment through the addon loader', async () => {
    let observedProductId = '';
    let observedTrackingId: string | null | undefined;
    let observedQuantity: number | undefined;

    const result = await executeWindowsStoreReportConsumableFulfillment({
      modulePath: 'C:\\addon\\hagicode_store_purchase_addon.node',
      productId: '9NC5T6VC1NQH',
      trackingId: 'tid-9',
      quantity: 1,
    }, () => ({
      async requestPurchase() {
        return { outcome: 'failed' };
      },
      async queryStoreStatus() {
        return { availability: 'error' };
      },
      async reportConsumableFulfillment(productId, trackingId, quantity, _ownerWindow) {
        observedProductId = productId;
        observedTrackingId = trackingId;
        observedQuantity = quantity;
        return {
          ok: true,
          status: 'succeeded',
          trackingId,
          balanceRemaining: 0,
          errorCode: null,
          errorMessage: null,
        };
      },
    }));

    assert.equal(observedProductId, '9NC5T6VC1NQH');
    assert.equal(observedTrackingId, 'tid-9');
    assert.equal(observedQuantity, 1);
    assert.equal(result.ok, true);
    assert.equal(result.status, 'succeeded');
  });
});
