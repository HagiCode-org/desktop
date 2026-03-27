import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OnboardingStep, type OnboardingState } from '../../../../types/onboarding.js';
import reducer, {
  selectCanGoNext,
  setDownloadProgress,
  setServiceProgress,
} from '../onboardingSlice.js';
import { goToNextStep, goToPreviousStep } from '../../thunks/onboardingThunks.js';

describe('onboardingSlice flow', () => {
  it('uses the four-step onboarding sequence', () => {
    assert.equal(OnboardingStep.Welcome, 0);
    assert.equal(OnboardingStep.SharingAcceleration, 1);
    assert.equal(OnboardingStep.Download, 2);
    assert.equal(OnboardingStep.Launch, 3);
  });

  it('advances from welcome to sharing acceleration first', () => {
    const state = reducer(undefined, goToNextStep());
    assert.equal(state.currentStep, OnboardingStep.SharingAcceleration);
    assert.equal(selectCanGoNext({ onboarding: state as OnboardingState }), true);
  });

  it('advances from sharing acceleration to download', () => {
    const welcomeState = reducer(undefined, goToNextStep());
    const state = reducer(welcomeState, goToNextStep());
    assert.equal(state.currentStep, OnboardingStep.Download);
    assert.equal(selectCanGoNext({ onboarding: state as OnboardingState }), false);
  });

  it('advances from download directly to launch once a version is ready', () => {
    let state = reducer(undefined, goToNextStep());
    state = reducer(state, goToNextStep());
    assert.equal(state.currentStep, OnboardingStep.Download);

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

  it('navigates back from download to welcome', () => {
    let state = reducer(undefined, goToNextStep());
    state = reducer(state, goToNextStep());
    assert.equal(state.currentStep, OnboardingStep.Download);

    const backToSharing = reducer(state, goToPreviousStep());
    assert.equal(backToSharing.currentStep, OnboardingStep.SharingAcceleration);

    const backToWelcome = reducer(backToSharing, goToPreviousStep());
    assert.equal(backToWelcome.currentStep, OnboardingStep.Welcome);
  });

  it('navigates back from launch to download', () => {
    let state = reducer(undefined, goToNextStep());
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
    state = reducer(state, goToNextStep());
    assert.equal(state.currentStep, OnboardingStep.Launch);

    const backToDownload = reducer(state, goToPreviousStep());
    assert.equal(backToDownload.currentStep, OnboardingStep.Download);
  });

  it('only enables next on launch after the embedded service is running', () => {
    let state = reducer(undefined, goToNextStep());
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
