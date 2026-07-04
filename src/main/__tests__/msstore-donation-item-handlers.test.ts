import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isMsstoreDonationItemSuccessOutcome,
} from '../ipc/handlers/msstoreDonationItemHandlers.js';

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
