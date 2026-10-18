import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { retryAsync } from './retry-async.js';

const quiet = { log: () => {} };

describe('retryAsync', () => {
  it('returns the first successful result without waiting', async () => {
    const delays = [];

    const result = await retryAsync(async () => 'ok', {
      ...quiet,
      sleep: async (ms) => delays.push(ms),
    });

    assert.equal(result, 'ok');
    assert.deepEqual(delays, []);
  });

  it('retries transient failures with exponential backoff', async () => {
    const delays = [];
    let calls = 0;

    const result = await retryAsync(async () => {
      calls += 1;
      if (calls < 3) {
        throw new TypeError('terminated');
      }
      return 'ok';
    }, {
      ...quiet,
      attempts: 3,
      baseDelayMs: 100,
      sleep: async (ms) => delays.push(ms),
    });

    assert.equal(result, 'ok');
    assert.equal(calls, 3);
    assert.deepEqual(delays, [100, 200]);
  });

  it('rethrows the last error once attempts are exhausted', async () => {
    let calls = 0;

    await assert.rejects(
      retryAsync(async () => {
        calls += 1;
        throw new Error(`failure ${calls}`);
      }, {
        ...quiet,
        attempts: 3,
        baseDelayMs: 0,
        sleep: async () => {},
      }),
      { message: 'failure 3' },
    );
    assert.equal(calls, 3);
  });

  it('does not retry errors marked as non-retryable', async () => {
    let calls = 0;

    await assert.rejects(
      retryAsync(async () => {
        calls += 1;
        const error = new Error('not found');
        error.retryable = false;
        throw error;
      }, {
        ...quiet,
        attempts: 3,
        sleep: async () => {},
      }),
      { message: 'not found' },
    );
    assert.equal(calls, 1);
  });

  it('logs each retry with the label and attempt count', async () => {
    const messages = [];
    let calls = 0;

    await retryAsync(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('terminated');
      }
    }, {
      attempts: 2,
      baseDelayMs: 50,
      label: '[embedded-runtime] Runtime archive download',
      log: (message) => messages.push(message),
      sleep: async () => {},
    });

    assert.deepEqual(messages, [
      '[embedded-runtime] Runtime archive download failed on attempt 1/2: terminated. Retrying in 50ms',
    ]);
  });
});
