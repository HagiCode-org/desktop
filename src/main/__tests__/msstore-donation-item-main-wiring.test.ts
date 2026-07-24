import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const typesPath = path.resolve(process.cwd(), 'src/types/msstore-donation-item.ts');

describe('msstore donation item main-process wiring', () => {
  it('wires tip catalog product ids, service init, dismiss guard, and cleanup', async () => {
    const source = await fs.readFile(mainPath, 'utf8');
    const typesSource = await fs.readFile(typesPath, 'utf8');

    assert.match(source, /MSSTORE_DONATION_TIP_PRODUCT_IDS/);
    assert.match(typesSource, /9NC5T6VC1NQH/);
    assert.match(typesSource, /9NSKR15751LN/);
    assert.match(typesSource, /9MWTKDX9J62G/);
    assert.match(source, /let msstoreDonationPurchaseService: SubscriptionService \| null = null;/);
    assert.match(source, /let msstoreDonationItemFeatureEnabled = false;/);
    assert.match(source, /msstoreDonationItemFeatureEnabled = distributionModeState\.winStoreMode;/);
    assert.match(source, /function initializeMsstoreDonationItemService\(\): void \{/);
    assert.match(source, /function createMsstoreDonationPurchaseService\(/);
    assert.match(source, /async function purchaseMsstoreDonationItemByProductId\(/);
    assert.match(source, /registerMsstoreDonationItemHandlers\(\{/);
    assert.match(source, /canDismiss: \(\) => subscriptionService\?\.getCurrentSnapshot\(\)\.status === 'active',/);
    assert.match(source, /purchaseDonation: \(productId\) => purchaseMsstoreDonationItemByProductId\(productId\)/);
    assert.match(source, /initializeMsstoreDonationItemService\(\);/);
    assert.match(source, /msstoreDonationPurchaseService\?\.dispose\(\);/);
    assert.match(source, /disposeMsstoreDonationItemHandlers\(\);/);
  });
});
