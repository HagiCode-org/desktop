import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import reducer, {
  hideStartupFailureDialog,
  setStartupFailure,
  showStartupFailureDialog,
} from '../onboardingSlice.js';
import { recoverFromStartupFailure, startService } from '../../thunks/onboardingThunks.js';
import type { OnboardingRecoveryResult, OnboardingStartServiceResult, StartupFailurePayload } from '../../../../types/onboarding.js';

const failure: StartupFailurePayload = {
  summary: 'Health check failed',
  log: 'health timeout',
  port: 36556,
  timestamp: '2026-03-10T08:00:00.000Z',
  truncated: false,
};

describe('onboardingSlice startup failure dialog state', () => {
  it('stores onboarding startup failure and opens the dialog', () => {
    const result: OnboardingStartServiceResult = {
      success: false,
      error: 'Health check failed',
      startupFailure: failure,
    };

    const state = reducer(
      undefined,
      startService.rejected(new Error('Health check failed'), 'req-1', 'v1.0.0', result)
    );

    assert.equal(state.error, 'Health check failed');
    assert.equal(state.startupFailure?.summary, failure.summary);
    assert.equal(state.showStartupFailureDialog, true);
    assert.equal(state.serviceProgress?.phase, 'error');
  });

  it('hides the dialog without dropping diagnostics', () => {
    const withFailure = reducer(undefined, setStartupFailure(failure));
    const hidden = reducer(withFailure, hideStartupFailureDialog());
    const reopened = reducer(hidden, showStartupFailureDialog());

    assert.equal(hidden.showStartupFailureDialog, false);
    assert.equal(hidden.startupFailure?.summary, 'Health check failed');
    assert.equal(reopened.showStartupFailureDialog, true);
  });

  it('disables duplicate recovery while a recovery request is pending', () => {
    const pending = reducer(undefined, recoverFromStartupFailure.pending('req-2', 'v1.0.0'));

    assert.equal(pending.isRecoveringFromStartupFailure, true);
  });

  it('keeps diagnostics visible when recovery fails', () => {
    const recoveryFailure: OnboardingRecoveryResult = {
      success: false,
      error: 'Reinstall failed',
    };
    const withFailure = reducer(undefined, setStartupFailure(failure));
    const afterFailure = reducer(
      withFailure,
      recoverFromStartupFailure.rejected(new Error('Reinstall failed'), 'req-3', 'v1.0.0', recoveryFailure)
    );

    assert.equal(afterFailure.isRecoveringFromStartupFailure, false);
    assert.equal(afterFailure.error, 'Reinstall failed');
    assert.equal(afterFailure.showStartupFailureDialog, true);
    assert.equal(afterFailure.startupFailure?.summary, 'Health check failed');
  });
});
