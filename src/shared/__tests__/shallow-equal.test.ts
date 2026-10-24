import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isShallowEqualRecord } from '../shallow-equal.js';

describe('isShallowEqualRecord', () => {
  it('treats records with the same keys and values as equal', () => {
    assert.equal(isShallowEqualRecord({ status: 'stopped', pid: null }, { status: 'stopped', pid: null }), true);
  });

  it('detects a changed value, an extra key and a missing key', () => {
    assert.equal(isShallowEqualRecord({ uptime: 1 }, { uptime: 2 }), false);
    assert.equal(isShallowEqualRecord({ uptime: 1 }, { uptime: 1, url: null }), false);
    assert.equal(isShallowEqualRecord({ uptime: 1, url: null }, { uptime: 1 }), false);
  });
});
