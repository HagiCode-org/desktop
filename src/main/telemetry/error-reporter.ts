import {
  TELEMETRY_APP_ERROR_KINDS,
  TELEMETRY_APP_ERROR_REASONS,
  TELEMETRY_GONE_ERROR_KINDS,
} from '../../shared/telemetry-events.js';

export type AppErrorKind = (typeof TELEMETRY_APP_ERROR_KINDS)[number];
export type AppErrorReason = (typeof TELEMETRY_APP_ERROR_REASONS)[number];

export const APP_ERROR_LAUNCH_LIMIT = 5;

export type AppErrorTrack = (name: 'app_error', properties: { kind: AppErrorKind; reason?: AppErrorReason }) => Promise<void> | void;

export interface ErrorReporter {
  /**
   * Reports a closed kind and an optional reason. It accepts no error object, so a message,
   * stack or path cannot reach the event. A `reason` is kept only for the `*_gone` kinds.
   */
  report(kind: AppErrorKind, reason?: AppErrorReason): void;
  /** Connects the telemetry track function and drains reports buffered before it existed. */
  attach(track: AppErrorTrack): void;
}

/**
 * Maps an Electron `details.reason` from `render-process-gone` or `child-process-gone`.
 * Returns null for `clean-exit`, which is not an error.
 */
export function mapElectronGoneReason(reason: string | undefined): AppErrorReason | null {
  switch (reason) {
    case 'clean-exit':
      return null;
    case 'crashed':
      return 'crashed';
    case 'oom':
    case 'memory-eviction':
      return 'oom';
    case 'killed':
    case 'abnormal-exit':
      return 'killed';
    case 'launch-failed':
      return 'launch_failed';
    default:
      return 'other';
  }
}

export function createErrorReporter(options: { max?: number } = {}): ErrorReporter {
  const max = options.max ?? APP_ERROR_LAUNCH_LIMIT;
  // Counts reports that were sent or buffered, so the cap applies to both together.
  let reported = 0;
  let track: AppErrorTrack | null = null;
  const buffer: Array<{ kind: AppErrorKind; reason?: AppErrorReason }> = [];

  function deliver(kind: AppErrorKind, reason: AppErrorReason | undefined): void {
    if (!track) return;
    const properties: { kind: AppErrorKind; reason?: AppErrorReason } = { kind };
    if (reason !== undefined && (TELEMETRY_GONE_ERROR_KINDS as readonly string[]).includes(kind)) {
      properties.reason = reason;
    }
    try {
      const result = track('app_error', properties);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => undefined);
      }
    } catch {
      /* a failing track never propagates into the failing flow */
    }
  }

  return {
    report(kind, reason) {
      if (!(TELEMETRY_APP_ERROR_KINDS as readonly string[]).includes(kind)) return;
      if (reported >= max) return;
      reported += 1;
      if (!track) {
        buffer.push({ kind, reason });
        return;
      }
      deliver(kind, reason);
    },
    attach(next) {
      track = next;
      const pending = buffer.splice(0, buffer.length);
      for (const entry of pending) deliver(entry.kind, entry.reason);
    },
  };
}
