import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { POWERSHELL_ARGS } from '../utils/powershell-executor.js';

describe('powershell-executor', () => {
  it('keeps hidden no-profile bounded execution arguments stable', () => {
    assert.deepEqual(POWERSHELL_ARGS, [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
    ]);
  });
});

