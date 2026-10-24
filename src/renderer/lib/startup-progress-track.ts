import { StartupPhase } from '../store/slices/webServiceSlice.js';

const STARTUP_PROGRESS_ORDER: StartupPhase[] = [
  StartupPhase.CheckingVersion,
  StartupPhase.CheckingDependencies,
  StartupPhase.Spawning,
  StartupPhase.WaitingListening,
  StartupPhase.HealthCheck,
  StartupPhase.Running,
];

/** Share of a step's stretch the track may creep through while the step is still running. */
const STARTUP_STEP_CREEP = 0.85;

/** Zero-based step of the startup, 0 (checking the version) to 5 (running); idle and error read as 0. */
export function getStartupProgressIndex(phase: StartupPhase): number {
  return Math.max(0, STARTUP_PROGRESS_ORDER.indexOf(phase));
}

/**
 * Where the start button's track sits while `phase` is current, as 0-1 of the track. The track starts the
 * phase on its tick and may creep toward, but never reach, the next tick: only a real phase change
 * crosses a tick, so the track never claims progress the startup has not made.
 */
export function getStartupProgressRange(phase: StartupPhase): { from: number; to: number } {
  const index = getStartupProgressIndex(phase);

  if (phase === StartupPhase.Running) {
    return { from: 1, to: 1 };
  }

  return {
    from: index / (STARTUP_PROGRESS_ORDER.length - 1),
    to: (index + STARTUP_STEP_CREEP) / (STARTUP_PROGRESS_ORDER.length - 1),
  };
}
