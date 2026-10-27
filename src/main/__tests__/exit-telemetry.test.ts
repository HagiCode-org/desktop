import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExitSequence, type ExitSequenceDeps } from '../telemetry/exit-sequence.js';

function harness(overrides: Partial<ExitSequenceDeps> = {}) {
  const calls: string[] = [];
  const deps: ExitSequenceDeps = {
    lifecycleActive: () => true,
    stopHeartbeat: () => { calls.push('heartbeat:stop'); },
    trackExited: async () => { calls.push('track:app_exited'); },
    flush: async (timeoutMs) => { calls.push(`flush:${timeoutMs}`); },
    clearRunMarker: () => { calls.push('marker:clear'); },
    cleanup: async () => { calls.push('cleanup'); },
    close: async () => { calls.push('close'); },
    exit: (code) => { calls.push(`exit:${code}`); },
    log: () => { calls.push('log'); },
    ...overrides,
  };
  return { calls, sequence: createExitSequence(deps) };
}

const flushedAfterEvent = (calls: string[]) => calls.indexOf('flush:1500') > calls.indexOf('track:app_exited');

describe('exit telemetry sequence', () => {
  it('runs the telemetry steps in order, then cleanup, then close and exit', async () => {
    const { calls, sequence } = harness();
    await sequence.run();
    assert.deepEqual(calls, [
      'heartbeat:stop',
      'track:app_exited',
      'flush:1500',
      'marker:clear',
      'cleanup',
      'close',
      'exit:0',
    ]);
  });

  it('sends app_exited and flushes before cleanup, and closes and exits even when cleanup throws', async () => {
    const { calls, sequence } = harness({
      cleanup: async () => {
        calls.push('cleanup');
        throw new Error('service stuck');
      },
    });
    await sequence.run();
    assert.ok(calls.indexOf('track:app_exited') < calls.indexOf('cleanup'));
    assert.ok(flushedAfterEvent(calls));
    assert.ok(calls.includes('log'));
    assert.equal(calls[calls.length - 2], 'close');
    assert.equal(calls[calls.length - 1], 'exit:0');
  });

  it('has sent app_exited and flushed before a cleanup that never resolves', async () => {
    const { calls, sequence } = harness({
      cleanup: () => {
        calls.push('cleanup');
        return new Promise<void>(() => {});
      },
    });
    void sequence.run();
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(calls.indexOf('track:app_exited') < calls.indexOf('cleanup'));
    assert.ok(flushedAfterEvent(calls));
    assert.equal(calls.includes('exit:0'), false, 'a stalled cleanup keeps the sequence waiting');
  });

  it('sends app_exited once, closes once and clears the marker once when quit fires repeatedly', async () => {
    const { calls, sequence } = harness();
    const first = sequence.run();
    const second = sequence.run();
    const third = sequence.run();
    await Promise.all([first, second, third]);
    assert.equal(calls.filter((call) => call === 'track:app_exited').length, 1);
    assert.equal(calls.filter((call) => call === 'marker:clear').length, 1);
    assert.equal(calls.filter((call) => call === 'close').length, 1);
    assert.equal(calls.filter((call) => call === 'exit:0').length, 1);
  });

  it('closes telemetry on a path that is not the lifecycle owner, without sending app_exited or clearing the marker', async () => {
    const { calls, sequence } = harness({ lifecycleActive: () => false });
    await sequence.run();
    assert.equal(calls.includes('track:app_exited'), false);
    assert.equal(calls.includes('marker:clear'), false);
    assert.equal(calls.includes('flush:1500'), false);
    assert.equal(calls[calls.length - 2], 'close');
    assert.equal(calls[calls.length - 1], 'exit:0');
  });

  it('still closes and exits when app_exited tracking rejects', async () => {
    const { calls, sequence } = harness({
      trackExited: async () => { throw new Error('queue full'); },
    });
    await sequence.run();
    assert.equal(calls[calls.length - 2], 'close');
    assert.equal(calls[calls.length - 1], 'exit:0');
  });
});
