import assert from 'node:assert/strict';
import test from 'node:test';
import { StartupPhase } from '../store/slices/webServiceSlice.js';
import { getStartupProgressIndex, getStartupProgressRange } from './startup-progress-track.js';

test('numbers the startup steps in order, reading idle and error as the first', () => {
  assert.equal(getStartupProgressIndex(StartupPhase.CheckingVersion), 0);
  assert.equal(getStartupProgressIndex(StartupPhase.HealthCheck), 4);
  assert.equal(getStartupProgressIndex(StartupPhase.Running), 5);
  assert.equal(getStartupProgressIndex(StartupPhase.Idle), 0);
  assert.equal(getStartupProgressIndex(StartupPhase.Error), 0);
});

test('each phase starts on its tick and creeps short of the next one', () => {
  const phases = [
    StartupPhase.CheckingVersion,
    StartupPhase.CheckingDependencies,
    StartupPhase.Spawning,
    StartupPhase.WaitingListening,
    StartupPhase.HealthCheck,
  ];

  phases.forEach((phase, index) => {
    const { from, to } = getStartupProgressRange(phase);
    assert.equal(from, index / 5);
    assert.ok(to > from && to < (index + 1) / 5, `${phase} must stay below the next tick`);
  });
});

test('running fills the track', () => {
  assert.deepEqual(getStartupProgressRange(StartupPhase.Running), { from: 1, to: 1 });
});
