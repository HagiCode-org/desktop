import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOnboardingStartupFailureResult,
  recoverOnboardingStartupFailure,
} from '../onboarding-startup-recovery.js';
import type { StartResult } from '../manifest-reader.js';

describe('onboarding startup recovery helpers', () => {
  it('builds structured onboarding startup failure payloads', () => {
    const startResult: StartResult = {
      success: false,
      resultSession: {
        exitCode: -1,
        stdout: '',
        stderr: 'health check timeout',
        duration: 0,
        timestamp: '2026-03-10T08:00:00.000Z',
        success: false,
        errorMessage: 'Health check failed',
        port: 36556,
      },
      parsedResult: {
        success: false,
        errorMessage: 'Health check failed',
        rawOutput: 'line1\nline2',
        port: 36556,
      },
      port: 36556,
    };

    const result = buildOnboardingStartupFailureResult(startResult, 5000);

    assert.equal(result.success, false);
    assert.equal(result.error, 'Health check failed');
    assert.equal(result.startupFailure?.summary, 'Health check failed');
    assert.equal(result.startupFailure?.log, 'line1\nline2');
    assert.equal(result.startupFailure?.port, 36556);
  });

  it('reinstalls the failed version, resets onboarding, and re-emits onboarding show', async () => {
    const events: Array<{ channel: string; data?: unknown }> = [];

    const result = await recoverOnboardingStartupFailure({
      versionId: 'v1.0.0',
      reinstallVersion: async (versionId) => {
        assert.equal(versionId, 'v1.0.0');
        return { success: true };
      },
      getInstalledVersions: async () => [{ id: 'v1.0.0' }],
      getActiveVersion: async () => ({ id: 'v1.0.0', isActive: true }),
      resetOnboarding: async () => {
        events.push({ channel: 'reset' });
      },
      sendProgressEvent: (channel, data) => {
        events.push({ channel, data });
      },
    });

    assert.deepEqual(result, { success: true });
    assert.deepEqual(events, [
      { channel: 'version:installedVersionsChanged', data: [{ id: 'v1.0.0' }] },
      { channel: 'version:activeVersionChanged', data: { id: 'v1.0.0', isActive: true } },
      { channel: 'reset' },
      { channel: 'onboarding:show', data: undefined },
    ]);
  });

  it('stops recovery early when reinstall fails', async () => {
    const events: string[] = [];

    const result = await recoverOnboardingStartupFailure({
      versionId: 'v1.0.0',
      reinstallVersion: async () => ({ success: false, error: 'disk full' }),
      getInstalledVersions: async () => {
        events.push('installed');
        return [];
      },
      getActiveVersion: async () => {
        events.push('active');
        return null;
      },
      resetOnboarding: async () => {
        events.push('reset');
      },
      sendProgressEvent: (channel) => {
        events.push(channel);
      },
    });

    assert.deepEqual(result, { success: false, error: 'disk full' });
    assert.deepEqual(events, []);
  });
});
