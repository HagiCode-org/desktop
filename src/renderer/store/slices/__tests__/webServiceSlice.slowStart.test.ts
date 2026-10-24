import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import reducer, {
  setProcessInfo,
  setProcessInfoForBatch,
  setStartupPhase,
  beginStartupBatch,
  StartupPhase,
  type ProcessInfo,
} from '../webServiceSlice.js';

function startingInfo(overrides: Partial<ProcessInfo> = {}): ProcessInfo {
  return {
    status: 'starting',
    uptime: 0,
    startTime: 1_000,
    url: null,
    restartCount: 0,
    phase: StartupPhase.WaitingListening,
    host: '127.0.0.1',
    port: 36556,
    ...overrides,
  };
}

describe('webServiceSlice slow-start state', () => {
  it('stores the slow-start elapsed time from a phase event and clears it on the next phase', () => {
    const slow = reducer(undefined, setStartupPhase({
      phase: StartupPhase.WaitingListening,
      message: 'Waiting for the owned backend to start listening...',
      slow: true,
      elapsedMs: 35_000,
    }));
    assert.deepEqual(slow.slowStart, { elapsedMs: 35_000 });

    const listening = reducer(slow, setStartupPhase({
      phase: StartupPhase.HealthCheck,
      message: 'Verifying the owned backend health endpoint...',
      slow: false,
    }));
    assert.equal(listening.slowStart, null);
  });

  it('takes the slow-start state from process info while starting', () => {
    const slow = reducer(undefined, setProcessInfo(startingInfo({
      slowStart: true,
      startupElapsedMs: 35_000,
    })));
    assert.deepEqual(slow.slowStart, { elapsedMs: 35_000 });

    const refreshed = reducer(slow, setProcessInfo(startingInfo({
      slowStart: true,
      startupElapsedMs: 40_000,
    })));
    assert.deepEqual(refreshed.slowStart, { elapsedMs: 40_000 });
  });

  it('clears slow-start state when process info no longer reports it', () => {
    const slow = reducer(undefined, setProcessInfo(startingInfo({
      slowStart: true,
      startupElapsedMs: 35_000,
    })));

    const running = reducer(slow, setProcessInfo({
      ...startingInfo(),
      status: 'running',
      phase: StartupPhase.Running,
      url: 'http://127.0.0.1:36556',
    }));
    assert.equal(running.slowStart, null);
  });

  it('applies slow-start state only to the current startup batch', () => {
    const firstBatch = reducer(undefined, beginStartupBatch());
    const secondBatch = reducer(firstBatch, beginStartupBatch());
    const current = reducer(secondBatch, setProcessInfoForBatch({
      batch: secondBatch.startupBatch,
      info: startingInfo({ slowStart: true, startupElapsedMs: 30_000 }),
    }));
    assert.deepEqual(current.slowStart, { elapsedMs: 30_000 });

    const stale = reducer(current, setProcessInfoForBatch({
      batch: firstBatch.startupBatch,
      info: startingInfo({ slowStart: true, startupElapsedMs: 99_000 }),
    }));
    assert.deepEqual(stale.slowStart, { elapsedMs: 30_000 });
  });
});
