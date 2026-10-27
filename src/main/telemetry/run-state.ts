import {
  SEMVER_MAX_LENGTH,
  SEMVER_PATTERN,
  type TELEMETRY_PREVIOUS_EXIT_STATES,
} from '../../shared/telemetry-events.js';

export type PreviousExitState = (typeof TELEMETRY_PREVIOUS_EXIT_STATES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INSTALLATION_AGE_DAYS = 3650;
const MAX_FIRST_SERVICE_INTERVAL_MS = 30 * DAY_MS;

export interface RunStateValues {
  telemetryRunMarker: { startedAt: number };
  telemetryFirstLaunchAt: number;
  telemetryLastVersion: string;
  telemetryFirstServiceEmitted: boolean;
}
export type RunStateKey = keyof RunStateValues;

/** Minimal key-value view of the config store. The electron-store adapter is built in main.ts. */
export interface RunStateStore {
  get<K extends RunStateKey>(key: K): RunStateValues[K] | undefined;
  set<K extends RunStateKey>(key: K, value: RunStateValues[K]): void;
  delete(key: RunStateKey): void;
}

export interface RunStateClock {
  now(): number;
}

export interface LaunchClassification {
  previousExit: PreviousExitState;
  /** Absent when the first-launch time cannot be known. */
  daysSinceFirstLaunch?: number;
}

export interface RunState {
  /**
   * Classifies the previous exit and writes this launch's run marker.
   * Call only after the single-instance lock is acquired and telemetry is enabled.
   */
  beginLaunch(input: { installIdCreated: boolean }): LaunchClassification;
  /** Clears the run marker. Call only from the instance that wrote it. */
  clearRunMarker(): void;
  /** Returns the previous version when it differs from the running one; never throws. */
  detectUpgrade(currentVersion: string): { previousVersion: string } | null;
  /** Returns the once-per-installation payload on the first successful start; null afterwards. */
  recordFirstServiceStarted(): { sinceFirstLaunch: number } | null;
}

export function createRunState(
  store: RunStateStore,
  clock: RunStateClock = { now: () => Date.now() },
): RunState {
  // Covers the case where the store cannot record the flag: at most one event per launch.
  let firstServiceEmittedThisLaunch = false;

  return {
    beginLaunch({ installIdCreated }) {
      const now = clock.now();
      let readable = true;
      let marker: RunStateValues['telemetryRunMarker'] | undefined;
      let firstLaunchAt: number | undefined;
      try {
        marker = store.get('telemetryRunMarker');
        firstLaunchAt = readTimestamp(store.get('telemetryFirstLaunchAt'));
      } catch {
        readable = false;
      }

      let previousExit: PreviousExitState;
      if (!readable) previousExit = 'unknown';
      else if (marker) previousExit = 'unclean';
      else if (firstLaunchAt !== undefined) previousExit = 'normal';
      // An install ID that already existed means an install from before this state existed.
      else if (!installIdCreated) previousExit = 'unknown';
      else previousExit = 'first_launch';

      let writable = true;
      try {
        store.set('telemetryRunMarker', { startedAt: now });
        // Never overwrite a first-launch time that could not be read.
        if (readable && firstLaunchAt === undefined) store.set('telemetryFirstLaunchAt', now);
      } catch {
        writable = false;
      }
      if (!writable) previousExit = 'unknown';

      const firstLaunchKnown = readable ? (firstLaunchAt ?? (writable ? now : undefined)) : undefined;
      return {
        previousExit,
        daysSinceFirstLaunch: firstLaunchKnown === undefined ? undefined : daysBetween(firstLaunchKnown, now),
      };
    },

    clearRunMarker() {
      try {
        store.delete('telemetryRunMarker');
      } catch {
        /* a leftover marker is classified as unclean next launch; nothing else to do */
      }
    },

    detectUpgrade(currentVersion) {
      let stored: string | undefined;
      try {
        stored = store.get('telemetryLastVersion');
        if (stored !== currentVersion) store.set('telemetryLastVersion', currentVersion);
      } catch {
        return null;
      }
      if (stored === undefined || stored === currentVersion) return null;
      if (!isSemver(stored)) return null;
      return { previousVersion: stored };
    },

    recordFirstServiceStarted() {
      if (firstServiceEmittedThisLaunch) return null;
      firstServiceEmittedThisLaunch = true;

      let alreadyEmitted = false;
      let readFailed = false;
      let firstLaunchAt: number | undefined;
      try {
        alreadyEmitted = store.get('telemetryFirstServiceEmitted') === true;
        firstLaunchAt = readTimestamp(store.get('telemetryFirstLaunchAt'));
      } catch {
        readFailed = true;
      }
      if (!readFailed && alreadyEmitted) return null;

      // The flag is written before the caller sends the event, so a crash after sending cannot repeat it.
      try {
        store.set('telemetryFirstServiceEmitted', true);
      } catch {
        /* the in-memory guard limits this launch to one event */
      }

      const elapsed = firstLaunchAt === undefined ? 0 : clock.now() - firstLaunchAt;
      return { sinceFirstLaunch: Math.min(MAX_FIRST_SERVICE_INTERVAL_MS, Math.max(0, elapsed)) };
    },
  };
}

function readTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function daysBetween(from: number, to: number): number {
  return Math.min(MAX_INSTALLATION_AGE_DAYS, Math.max(0, Math.floor((to - from) / DAY_MS)));
}

function isSemver(value: unknown): value is string {
  return typeof value === 'string' && value.length <= SEMVER_MAX_LENGTH && SEMVER_PATTERN.test(value);
}
