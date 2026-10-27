import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRunState, type RunStateKey, type RunStateStore, type RunStateValues } from '../telemetry/run-state.js';

const DAY = 24 * 60 * 60 * 1000;

function fakeStore(options: { failReads?: boolean; failWrites?: boolean; initial?: Partial<RunStateValues> } = {}) {
  const data = new Map<RunStateKey, unknown>(Object.entries(options.initial ?? {}) as Array<[RunStateKey, unknown]>);
  const store: RunStateStore = {
    get(key) {
      if (options.failReads) throw new Error('store unreadable');
      return data.get(key) as RunStateValues[typeof key] | undefined;
    },
    set(key, value) {
      if (options.failWrites) throw new Error('store unwritable');
      data.set(key, value);
    },
    delete(key) {
      if (options.failWrites) throw new Error('store unwritable');
      data.delete(key);
    },
  };
  return { store, data };
}

function clock(start = 1_000_000_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => { current += ms; },
  };
}

describe('run state', () => {
  describe('previousExit', () => {
    it('reports normal after a launch that cleared its marker on exit', () => {
      const { store } = fakeStore();
      const time = clock();
      createRunState(store, time).beginLaunch({ installIdCreated: true });
      const first = createRunState(store, time);
      first.clearRunMarker();
      time.advance(DAY);
      assert.equal(createRunState(store, time).beginLaunch({ installIdCreated: false }).previousExit, 'normal');
    });

    it('reports unclean when a leftover marker is found and replaces it with the current one', () => {
      const time = clock();
      const { store, data } = fakeStore({ initial: { telemetryRunMarker: { startedAt: time.now() - DAY }, telemetryFirstLaunchAt: time.now() - 3 * DAY } });
      const result = createRunState(store, time).beginLaunch({ installIdCreated: false });
      assert.equal(result.previousExit, 'unclean');
      assert.deepEqual(data.get('telemetryRunMarker'), { startedAt: time.now() });
    });

    it('reports first_launch for a new installation with no marker and no earlier launch', () => {
      const time = clock();
      const { store, data } = fakeStore();
      const result = createRunState(store, time).beginLaunch({ installIdCreated: true });
      assert.equal(result.previousExit, 'first_launch');
      assert.equal(result.daysSinceFirstLaunch, 0);
      assert.equal(data.get('telemetryFirstLaunchAt'), time.now());
    });

    it('reports unknown for an install that predates the state with no history, and records a first launch', () => {
      const time = clock();
      const { store, data } = fakeStore();
      const result = createRunState(store, time).beginLaunch({ installIdCreated: false });
      assert.equal(result.previousExit, 'unknown');
      assert.equal(data.get('telemetryFirstLaunchAt'), time.now());
    });

    it('reports unknown and keeps startup going when the store cannot be read', () => {
      const { store } = fakeStore({ failReads: true });
      assert.doesNotThrow(() => createRunState(store, clock()).beginLaunch({ installIdCreated: true }));
      assert.equal(createRunState(store, clock()).beginLaunch({ installIdCreated: true }).previousExit, 'unknown');
    });

    it('reports unknown when the store cannot be written', () => {
      const { store } = fakeStore({ failWrites: true });
      const result = createRunState(store, clock()).beginLaunch({ installIdCreated: true });
      assert.equal(result.previousExit, 'unknown');
    });

    it('does not write a marker from a second instance, so the first instance is not misclassified next launch', () => {
      const time = clock();
      const { store } = fakeStore();
      const running = createRunState(store, time);
      running.beginLaunch({ installIdCreated: true });
      // The second instance loses the lock and makes no run-state calls.
      running.clearRunMarker();
      time.advance(DAY);
      assert.equal(createRunState(store, time).beginLaunch({ installIdCreated: false }).previousExit, 'normal');
    });

    it('caps daysSinceFirstLaunch at 3650 and reports the number of whole days', () => {
      const time = clock();
      const { store } = fakeStore({ initial: { telemetryFirstLaunchAt: time.now() - 12 * DAY - 5 * 3600 * 1000 } });
      assert.equal(createRunState(store, time).beginLaunch({ installIdCreated: true }).daysSinceFirstLaunch, 12);

      const longAgo = clock();
      const { store: oldStore } = fakeStore({ initial: { telemetryFirstLaunchAt: longAgo.now() - 9000 * DAY } });
      assert.equal(createRunState(oldStore, longAgo).beginLaunch({ installIdCreated: true }).daysSinceFirstLaunch, 3650);
    });
  });

  describe('first_service_started', () => {
    it('emits once per installation across repeated successes and across a simulated restart', () => {
      const time = clock();
      const { store, data } = fakeStore({ initial: { telemetryFirstLaunchAt: time.now() } });
      const first = createRunState(store, time);
      assert.deepEqual(first.recordFirstServiceStarted(), { sinceFirstLaunch: 0 });
      assert.equal(first.recordFirstServiceStarted(), null);
      assert.equal(data.get('telemetryFirstServiceEmitted'), true);
      assert.equal(createRunState(store, time).recordFirstServiceStarted(), null);
    });

    it('sets no flag when no successful start was recorded', () => {
      const { store, data } = fakeStore();
      createRunState(store, clock()).beginLaunch({ installIdCreated: true });
      assert.equal(data.has('telemetryFirstServiceEmitted'), false);
    });

    it('clamps sinceFirstLaunch to 30 days', () => {
      const time = clock();
      const { store } = fakeStore({ initial: { telemetryFirstLaunchAt: time.now() - 90 * DAY } });
      assert.deepEqual(createRunState(store, time).recordFirstServiceStarted(), { sinceFirstLaunch: 30 * DAY });
    });

    it('does not repeat within one launch when the store cannot be read or written', () => {
      const time = clock();
      const unreadable = createRunState(fakeStore({ failReads: true }).store, time);
      assert.notEqual(unreadable.recordFirstServiceStarted(), null);
      assert.equal(unreadable.recordFirstServiceStarted(), null);

      const unwritable = createRunState(fakeStore({ failWrites: true, initial: { telemetryFirstLaunchAt: time.now() } }).store, time);
      assert.notEqual(unwritable.recordFirstServiceStarted(), null);
      assert.equal(unwritable.recordFirstServiceStarted(), null);
    });
  });

  describe('app_upgraded', () => {
    it('reports the previous version when it changed', () => {
      const { store, data } = fakeStore({ initial: { telemetryLastVersion: '0.3.1' } });
      assert.deepEqual(createRunState(store, clock()).detectUpgrade('0.4.0'), { previousVersion: '0.3.1' });
      assert.equal(data.get('telemetryLastVersion'), '0.4.0');
    });

    it('reports nothing when the version is unchanged', () => {
      const { store } = fakeStore({ initial: { telemetryLastVersion: '0.4.0' } });
      assert.equal(createRunState(store, clock()).detectUpgrade('0.4.0'), null);
    });

    it('reports nothing on first launch and stores the running version', () => {
      const { store, data } = fakeStore();
      assert.equal(createRunState(store, clock()).detectUpgrade('0.4.0'), null);
      assert.equal(data.get('telemetryLastVersion'), '0.4.0');
    });

    it('reports nothing for a stored value that is not a version and replaces it', () => {
      const { store, data } = fakeStore({ initial: { telemetryLastVersion: 'C:/apps/hagicode' as string } });
      assert.equal(createRunState(store, clock()).detectUpgrade('0.4.0'), null);
      assert.equal(data.get('telemetryLastVersion'), '0.4.0');
    });

    it('accepts a pre-release stored version', () => {
      const { store } = fakeStore({ initial: { telemetryLastVersion: '0.4.0-beta.2' } });
      assert.deepEqual(createRunState(store, clock()).detectUpgrade('0.4.0'), { previousVersion: '0.4.0-beta.2' });
    });

    it('never throws when the store fails', () => {
      const { store } = fakeStore({ failReads: true });
      assert.equal(createRunState(store, clock()).detectUpgrade('0.4.0'), null);
    });
  });
});
