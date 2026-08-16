import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import reducer, {
  hideStartupFailureDialog,
  setInstallProgress,
  setInstallingVersionId,
  setStartupFailure,
  beginStartupBatch,
  setProcessInfoForBatch,
  StartupPhase,
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

  it('tracks the active install target so only one version card renders progress', () => {
    const selectingTarget = reducer(undefined, setInstallingVersionId('version-1'));
    const progressing = reducer(selectingTarget, setInstallProgress({
      stage: 'downloading',
      progress: 42,
      message: 'shared-acceleration-active',
    }));
    const cleared = reducer(progressing, setInstallingVersionId(null));

    assert.equal(selectingTarget.installingVersionId, 'version-1');
    assert.equal(progressing.isInstalling, true);
    assert.equal(progressing.installingVersionId, 'version-1');
    assert.equal(cleared.installingVersionId, null);
  });

  it('ignores a late process result from an older startup batch', () => {
    const firstBatch = reducer(undefined, beginStartupBatch());
    const secondBatch = reducer(firstBatch, beginStartupBatch());
    const current = reducer(secondBatch, setProcessInfoForBatch({
      batch: secondBatch.startupBatch,
      info: {
        status: 'running',
        uptime: 1000,
        startTime: 1,
        url: 'http://localhost:36556',
        restartCount: 0,
        phase: StartupPhase.Running,
        host: 'localhost',
        port: 36556,
      },
    }));
    const unchanged = reducer(current, setProcessInfoForBatch({
      batch: firstBatch.startupBatch,
      info: {
        status: 'error',
        uptime: 0,
        startTime: null,
        url: null,
        restartCount: 0,
        phase: StartupPhase.Error,
        host: 'localhost',
        port: 36556,
      },
    }));

    assert.equal(current.status, 'running');
    assert.equal(unchanged.status, 'running');
    assert.equal(unchanged.startupBatch, secondBatch.startupBatch);
  });
});
