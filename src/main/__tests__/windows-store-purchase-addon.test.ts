import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  executeWindowsStorePurchaseAddon,
  executeWindowsStoreStatusAddon,
  parseWindowsStoreLicenseQueryAddonResult,
  parseWindowsStorePurchaseAddonResult,
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
