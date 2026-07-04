import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

describe('msstore donation item main-process wiring', () => {
  it('wires donation product id, service init, dismiss guard, and cleanup', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /const MSSTORE_DONATION_ITEM_PRODUCT_ID = '9NC5T6VC1NQH';/);
    assert.match(source, /let msstoreDonationPurchaseService: SubscriptionService \| null = null;/);
    assert.match(source, /let msstoreDonationItemFeatureEnabled = false;/);
    assert.match(source, /msstoreDonationItemFeatureEnabled = distributionModeState\.winStoreMode;/);
    assert.match(source, /function initializeMsstoreDonationItemService\(\): void \{/);
    assert.match(source, /registerMsstoreDonationItemHandlers\(\{/);
    assert.match(source, /canDismiss: \(\) => subscriptionService\?\.getCurrentSnapshot\(\)\.status === 'active',/);
    assert.match(source, /storeId: MSSTORE_DONATION_ITEM_PRODUCT_ID,/);
    assert.match(source, /productId: MSSTORE_DONATION_ITEM_PRODUCT_ID,/);
    assert.match(source, /initializeMsstoreDonationItemService\(\);/);
    assert.match(source, /msstoreDonationPurchaseService\?\.dispose\(\);/);
    assert.match(source, /disposeMsstoreDonationItemHandlers\(\);/);
  });
});
