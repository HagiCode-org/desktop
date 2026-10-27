import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MAX_DURATION_MS,
  startHeartbeat,
  type HeartbeatHandle,
} from '../telemetry/heartbeat.js';
import { withMainViewDuration } from '../telemetry/main-view-timing.js';

interface FakeInterval {
  callback: () => void;
  ms: number;
  cleared: boolean;
  unref: number;
}

function fakeTimers() {
  const intervals: FakeInterval[] = [];
  const byHandle = new Map<object, FakeInterval>();
  return {
    intervals,
    timers: {
      setInterval: (callback: () => void, ms: number) => {
        const entry: FakeInterval = { callback, ms, cleared: false, unref: 0 };
        const handle = { unref: () => { entry.unref += 1; } };
        intervals.push(entry);
        byHandle.set(handle, entry);
        return handle as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: (timer: ReturnType<typeof setInterval>) => {
        const entry = byHandle.get(timer as unknown as object);
        if (entry) entry.cleared = true;
      },
    },
  };
}

describe('heartbeat', () => {
  it('schedules the first heartbeat after one full six-hour interval, unref-ed', () => {
    const fake = fakeTimers();
    const handle = startHeartbeat({ track: () => {}, timers: fake.timers, uptimeMs: () => 0 });
    try {
      assert.equal(fake.intervals.length, 1);
      assert.equal(fake.intervals[0].ms, HEARTBEAT_INTERVAL_MS);
      assert.equal(fake.intervals[0].unref, 1);
    } finally {
      handle.stop();
    }
  });

  it('sends a heartbeat with the process uptime on each interval', () => {
    const fake = fakeTimers();
    const durations: number[] = [];
    let uptime = 6 * 3600 * 1000;
    const handle = startHeartbeat({ track: (duration) => durations.push(duration), timers: fake.timers, uptimeMs: () => uptime });
    try {
      fake.intervals[0].callback();
      uptime += HEARTBEAT_INTERVAL_MS;
      fake.intervals[0].callback();
      fake.intervals[0].callback();
      assert.deepEqual(durations, [6 * 3600 * 1000, 12 * 3600 * 1000, 12 * 3600 * 1000]);
    } finally {
      handle.stop();
    }
  });

  it('stop clears the timer, so no heartbeat follows the quit sequence', () => {
    const fake = fakeTimers();
    const durations: number[] = [];
    const handle = startHeartbeat({ track: (duration) => durations.push(duration), timers: fake.timers, uptimeMs: () => 1 });
    handle.stop();
    assert.equal(fake.intervals[0].cleared, true);
    // A fresh timer can start again after a stop.
    const next = startHeartbeat({ track: () => {}, timers: fake.timers, uptimeMs: () => 1 });
    assert.equal(fake.intervals.length, 2);
    next.stop();
  });

  it('creates at most one timer per process while one is running', () => {
    const fake = fakeTimers();
    const first: HeartbeatHandle = startHeartbeat({ track: () => {}, timers: fake.timers, uptimeMs: () => 1 });
    try {
      const second = startHeartbeat({ track: () => {}, timers: fake.timers, uptimeMs: () => 1 });
      assert.equal(second, first);
      assert.equal(fake.intervals.length, 1);
    } finally {
      first.stop();
    }
  });

  it('keeps duration non-negative and within the catalog bound, and drops non-finite values', () => {
    const fake = fakeTimers();
    const durations: number[] = [];
    let uptime = -5;
    const handle = startHeartbeat({ track: (duration) => durations.push(duration), timers: fake.timers, uptimeMs: () => uptime });
    try {
      fake.intervals[0].callback();
      uptime = Number.POSITIVE_INFINITY;
      fake.intervals[0].callback();
      uptime = 10 * HEARTBEAT_MAX_DURATION_MS;
      fake.intervals[0].callback();
      assert.deepEqual(durations, [0, HEARTBEAT_MAX_DURATION_MS]);
    } finally {
      handle.stop();
    }
  });
});

describe('main_view_entered duration enrichment', () => {
  it('adds the main-process duration when the renderer sent none', () => {
    assert.deepEqual(withMainViewDuration({ source: 'renderer', kind: 'main_view' }, () => 2500.4), {
      source: 'renderer',
      kind: 'main_view',
      duration: 2500,
    });
  });

  it('keeps a duration the renderer already sent', () => {
    const properties = { source: 'renderer', kind: 'main_view', duration: 900 };
    assert.equal(withMainViewDuration(properties, () => 2500), properties);
  });

  it('sends nothing extra when the process start time is unavailable', () => {
    const properties = { source: 'renderer', kind: 'main_view' };
    assert.equal(withMainViewDuration(properties, () => Number.NaN), properties);
    assert.equal(withMainViewDuration(properties, () => { throw new Error('no uptime'); }), properties);
  });

  it('leaves an old record without duration valid', () => {
    assert.equal(withMainViewDuration(undefined, () => Number.NaN), undefined);
  });
});
