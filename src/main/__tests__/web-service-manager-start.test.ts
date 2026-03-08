import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateFixedPortStartup } from '../web-service-startup-policy.js';

describe('web-service startup fixed-port policy', () => {
  it('fails on occupied configured port without switching target port', () => {
    const decision = evaluateFixedPortStartup(36556, false);

    assert.equal(decision.canStart, false);
    assert.equal(decision.port, 36556);
    assert.match(decision.errorMessage || '', /36556/);
  });

  it('keeps configured port when available', () => {
    const decision = evaluateFixedPortStartup(36556, true);

    assert.equal(decision.canStart, true);
    assert.equal(decision.port, 36556);
    assert.equal(decision.errorMessage, undefined);
  });
});
