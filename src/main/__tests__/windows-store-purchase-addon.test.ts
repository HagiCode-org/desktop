import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  executeWindowsStorePurchaseAddon,
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
      };
    });

    assert.equal(observedModulePath, 'C:\\addon\\hagicode_store_purchase_addon.node');
    assert.equal(observedStoreId, '9N0BTGWV23M1');
    assert.equal(observedOwnerWindow, '0x1234');
    assert.equal(result.outcome, 'already-purchased');
  });
});
