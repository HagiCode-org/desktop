import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import reducer, {
  hideStartupFailureDialog,
  setStartupFailure,
  showStartupFailureDialog,
  type StartupFailurePayload,
} from '../webServiceSlice.js';

describe('webServiceSlice startup failure dialog state', () => {
  it('stores startup failure and opens dialog', () => {
    const failure: StartupFailurePayload = {
      summary: 'Configured port 36556 is already in use',
      log: 'mock log output',
      port: 36556,
      timestamp: '2026-03-08T10:00:00.000Z',
      truncated: false,
    };

    const state = reducer(undefined, setStartupFailure(failure));

    assert.equal(state.startupFailure?.summary, failure.summary);
    assert.equal(state.showStartupFailureDialog, true);
  });

  it('hides dialog but keeps latest diagnostics for reopen', () => {
    const failure: StartupFailurePayload = {
      summary: 'Health check failed',
      log: 'health timeout',
      port: 36556,
      timestamp: '2026-03-08T10:00:00.000Z',
      truncated: true,
    };

    const withFailure = reducer(undefined, setStartupFailure(failure));
    const hidden = reducer(withFailure, hideStartupFailureDialog());
    const reopened = reducer(hidden, showStartupFailureDialog());

    assert.equal(hidden.showStartupFailureDialog, false);
    assert.equal(hidden.startupFailure?.summary, 'Health check failed');
    assert.equal(reopened.showStartupFailureDialog, true);
  });
});
