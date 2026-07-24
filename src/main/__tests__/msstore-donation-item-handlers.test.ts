import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isMsstoreDonationItemSuccessOutcome,
} from '../ipc/handlers/msstoreDonationItemHandlers.js';
import {
  MSSTORE_DONATION_TIP_PRODUCT_IDS,
  resolveMsstoreDonationTipProductId,
} from '../../types/msstore-donation-item.js';

describe('msstore donation item handlers', () => {
  it('treats succeeded and already-purchased as success outcomes', () => {
    assert.equal(isMsstoreDonationItemSuccessOutcome('succeeded'), true);
    assert.equal(isMsstoreDonationItemSuccessOutcome('already-purchased'), true);
  });

  it('treats cancel and failure class outcomes as non-success', () => {
    assert.equal(isMsstoreDonationItemSuccessOutcome('canceled'), false);
    assert.equal(isMsstoreDonationItemSuccessOutcome('not-purchased'), false);
    assert.equal(isMsstoreDonationItemSuccessOutcome('network-error'), false);
    assert.equal(isMsstoreDonationItemSuccessOutcome('server-error'), false);
    assert.equal(isMsstoreDonationItemSuccessOutcome('not-supported'), false);
    assert.equal(isMsstoreDonationItemSuccessOutcome('failed'), false);
  });
});

describe('resolveMsstoreDonationTipProductId whitelist mapping', () => {
  it('maps coffee/dinner/candy tiers to Store product IDs', () => {
    assert.deepEqual(resolveMsstoreDonationTipProductId({ tier: 'coffee' }), {
      tier: 'coffee',
      productId: '9NNC9S2GVJKC',
    });
    assert.deepEqual(resolveMsstoreDonationTipProductId({ tier: 'dinner' }), {
      tier: 'dinner',
      productId: '9PBXBJFCL9K5',
    });
    assert.deepEqual(resolveMsstoreDonationTipProductId({ tier: 'candy' }), {
      tier: 'candy',
      productId: '9PGSK18H6872',
    });
    assert.equal(MSSTORE_DONATION_TIP_PRODUCT_IDS.coffee, '9NNC9S2GVJKC');
  });

  it('accepts whitelist productId strings and rejects unknown ids/tiers', () => {
    assert.deepEqual(resolveMsstoreDonationTipProductId('9PBXBJFCL9K5'), {
      tier: 'dinner',
      productId: '9PBXBJFCL9K5',
    });
    assert.equal(resolveMsstoreDonationTipProductId('not-a-product'), null);
    assert.equal(resolveMsstoreDonationTipProductId({ tier: 'vip' as 'coffee' }), null);
    assert.equal(resolveMsstoreDonationTipProductId({ tier: 'coffee', productId: '9BADBADBAD00' }), null);
  });
});
