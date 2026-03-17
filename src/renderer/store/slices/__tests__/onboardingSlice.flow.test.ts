import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OnboardingStep, type OnboardingState } from '../../../../types/onboarding.js';
import reducer, {
  selectCanGoNext,
  selectOpenSpecInstall,
  setDownloadProgress,
  setServiceProgress,
} from '../onboardingSlice.js';
import { goToNextStep, goToPreviousStep, installOpenSpec, verifyOpenSpec } from '../../thunks/onboardingThunks.js';

describe('onboardingSlice flow', () => {
  it('uses the five-step onboarding sequence', () => {
    assert.equal(OnboardingStep.Welcome, 0);
    assert.equal(OnboardingStep.AgentCliSelection, 1);
    assert.equal(OnboardingStep.OpenSpecInstallation, 2);
    assert.equal(OnboardingStep.Download, 3);
    assert.equal(OnboardingStep.Launch, 4);
  });

  it('requires OpenSpec verification before moving to download', () => {
    let state = reducer(undefined, goToNextStep());
    assert.equal(state.currentStep, OnboardingStep.AgentCliSelection);

    state = reducer(state, goToNextStep());
    assert.equal(state.currentStep, OnboardingStep.OpenSpecInstallation);
    assert.equal(selectCanGoNext({ onboarding: state as OnboardingState }), false);

    const blockedAtOpenSpec = reducer(state, goToNextStep());
    assert.equal(blockedAtOpenSpec.currentStep, OnboardingStep.OpenSpecInstallation);

    const verified = reducer(
      state,
      verifyOpenSpec.fulfilled({ success: true, version: '1.1.3' }, 'req-verify-1', undefined)
    );
    assert.equal(selectCanGoNext({ onboarding: verified as OnboardingState }), true);

    const downloadStep = reducer(verified, goToNextStep());
    assert.equal(downloadStep.currentStep, OnboardingStep.Download);
  });

  it('preserves OpenSpec verification when navigating back within the same session', () => {
    let state = reducer(undefined, goToNextStep());
    state = reducer(state, goToNextStep());
    state = reducer(
      state,
      verifyOpenSpec.fulfilled({ success: true, version: '1.1.3' }, 'req-verify-2', undefined)
    );
    state = reducer(state, goToNextStep());
    assert.equal(state.currentStep, OnboardingStep.Download);

    const backToOpenSpec = reducer(state, goToPreviousStep());
    assert.equal(backToOpenSpec.currentStep, OnboardingStep.OpenSpecInstallation);
    assert.equal(backToOpenSpec.isOpenSpecConfirmed, true);
    assert.equal(selectCanGoNext({ onboarding: backToOpenSpec as OnboardingState }), true);
  });

  it('advances from download directly to launch once a version is ready', () => {
    let state = reducer(undefined, goToNextStep());
    state = reducer(state, goToNextStep());
    state = reducer(
      state,
      verifyOpenSpec.fulfilled({ success: true, version: '1.1.3' }, 'req-verify-3', undefined)
    );
    state = reducer(state, goToNextStep());

    const blockedAtDownload = reducer(state, goToNextStep());
    assert.equal(blockedAtDownload.currentStep, OnboardingStep.Download);

    const readyToLaunch = reducer(
      state,
      setDownloadProgress({
        progress: 100,
        downloadedBytes: 1024,
        totalBytes: 1024,
        speed: 0,
        remainingSeconds: 0,
        version: 'v1.0.0',
      })
    );
    const launched = reducer(readyToLaunch, goToNextStep());

    assert.equal(launched.currentStep, OnboardingStep.Launch);
  });

  it('tracks OpenSpec install and verification success, failure, and retryable states', () => {
    const installing = reducer(undefined, installOpenSpec.pending('req-1', undefined));
    assert.equal(selectOpenSpecInstall({ onboarding: installing as OnboardingState }).status, 'installing');

    const installed = reducer(
      installing,
      installOpenSpec.fulfilled({ success: true, version: '1.1.3' }, 'req-1', undefined)
    );
    assert.equal(installed.openSpecInstall.status, 'installed');
    assert.equal(installed.openSpecInstall.installedVersion, '1.1.3');

    const failed = reducer(
      installing,
      installOpenSpec.rejected(new Error('network'), 'req-2', undefined, 'network timeout')
    );
    assert.equal(failed.openSpecInstall.status, 'failed');
    assert.equal(failed.openSpecInstall.error, 'network timeout');

    const checking = reducer(undefined, verifyOpenSpec.pending('req-verify-4', undefined));
    assert.equal(checking.openSpecInstall.status, 'checking');

    const verified = reducer(
      checking,
      verifyOpenSpec.fulfilled({ success: true, version: '1.1.4' }, 'req-verify-4', undefined)
    );
    assert.equal(verified.openSpecInstall.status, 'installed');
    assert.equal(verified.isOpenSpecConfirmed, true);
  });

  it('only enables next on launch after the embedded service is running', () => {
    let state = reducer(undefined, goToNextStep());
    state = reducer(state, goToNextStep());
    state = reducer(
      state,
      verifyOpenSpec.fulfilled({ success: true, version: '1.1.3' }, 'req-verify-5', undefined)
    );
    state = reducer(state, goToNextStep());
    state = reducer(
      state,
      setDownloadProgress({
        progress: 100,
        downloadedBytes: 1024,
        totalBytes: 1024,
        speed: 0,
        remainingSeconds: 0,
        version: 'v1.0.0',
      })
    );
    const launchState = reducer(state, goToNextStep());

    assert.equal(launchState.currentStep, OnboardingStep.Launch);
    assert.equal(selectCanGoNext({ onboarding: launchState as OnboardingState }), false);

    const runningState = reducer(
      launchState,
      setServiceProgress({
        phase: 'running',
        progress: 100,
        message: 'Service started successfully',
        port: 36556,
        url: 'http://127.0.0.1:36556',
      })
    );

    assert.equal(selectCanGoNext({ onboarding: runningState as OnboardingState }), true);
  });
});
