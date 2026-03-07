import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseNullDelimitedEnv, shouldLoadConsoleEnvironment } from '../shell-env-loader.js';

describe('shell-env-loader', () => {
  it('parses null-delimited env output', () => {
    const parsed = parseNullDelimitedEnv('A=1\u0000B=hello world\u0000EMPTY=\u0000');
    assert.equal(parsed.A, '1');
    assert.equal(parsed.B, 'hello world');
    assert.equal(parsed.EMPTY, '');
  });

  it('ignores malformed env rows', () => {
    const parsed = parseNullDelimitedEnv('=bad\u0000NO_EQUAL\u0000GOOD=ok\u0000');
    assert.deepEqual(parsed, { GOOD: 'ok' });
  });

  it('handles feature flag values', () => {
    assert.equal(shouldLoadConsoleEnvironment(undefined), true);
    assert.equal(shouldLoadConsoleEnvironment('true'), true);
    assert.equal(shouldLoadConsoleEnvironment('1'), true);
    assert.equal(shouldLoadConsoleEnvironment('false'), false);
    assert.equal(shouldLoadConsoleEnvironment('off'), false);
  });
});
