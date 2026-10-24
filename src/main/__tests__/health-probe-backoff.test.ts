import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HealthProbeBackoff } from '../health-probe-backoff.js';

describe('HealthProbeBackoff', () => {
  it('probes immediately when no failure has been recorded', () => {
    const backoff = new HealthProbeBackoff();

    assert.equal(backoff.shouldProbe(0), true);
  });

  it('grows the gap 5 s, 10 s, 20 s, 40 s and caps it at 60 s', () => {
    const backoff = new HealthProbeBackoff();
    const expectedGapsMs = [5000, 10000, 20000, 40000, 60000, 60000];
    let now = 0;

    for (const gapMs of expectedGapsMs) {
      backoff.recordFailure(now);
      assert.equal(backoff.shouldProbe(now + gapMs - 1000), false);
      assert.equal(backoff.shouldProbe(now + gapMs), true);
      now += gapMs;
    }
  });

  it('measures the gap from the probe start, not its end', () => {
    const backoff = new HealthProbeBackoff();

    backoff.recordFailure(1000);

    assert.equal(backoff.shouldProbe(6000), true);
  });

  it('returns to probing at once after a success', () => {
    const backoff = new HealthProbeBackoff();

    backoff.recordFailure(0);
    backoff.recordFailure(5000);
    assert.equal(backoff.shouldProbe(6000), false);

    backoff.reset();

    assert.equal(backoff.shouldProbe(6000), true);
  });
});
