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
      productId: '9NC5T6VC1NQH',
    });
    assert.deepEqual(resolveMsstoreDonationTipProductId({ tier: 'dinner' }), {
      tier: 'dinner',
      productId: '9NSKR15751LN',
    });
    assert.deepEqual(resolveMsstoreDonationTipProductId({ tier: 'candy' }), {
      tier: 'candy',
      productId: '9MWTKDX9J62G',
    });
    assert.equal(MSSTORE_DONATION_TIP_PRODUCT_IDS.coffee, '9NC5T6VC1NQH');
  });

  it('accepts whitelist productId strings and rejects unknown ids/tiers', () => {
    assert.deepEqual(resolveMsstoreDonationTipProductId('9NSKR15751LN'), {
      tier: 'dinner',
      productId: '9NSKR15751LN',
    });
    assert.equal(resolveMsstoreDonationTipProductId('not-a-product'), null);
    assert.equal(resolveMsstoreDonationTipProductId({ tier: 'vip' as 'coffee' }), null);
    assert.equal(resolveMsstoreDonationTipProductId({ tier: 'coffee', productId: '9BADBADBAD00' }), null);
  });
});
