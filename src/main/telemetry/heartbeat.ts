export const HEARTBEAT_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Upper bound of the `app_heartbeat.duration` catalog property (365 days). */
export const HEARTBEAT_MAX_DURATION_MS = 365 * 24 * 60 * 60 * 1000;

export interface HeartbeatHandle {
  stop(): void;
}

export interface HeartbeatOptions {
  track: (durationMs: number) => void;
  /** Milliseconds since process start. Defaults to `process.uptime()`. */
  uptimeMs?: () => number;
  intervalMs?: number;
  timers?: {
    setInterval: (callback: () => void, ms: number) => ReturnType<typeof setInterval>;
    clearInterval: (timer: ReturnType<typeof setInterval>) => void;
  };
}

let active: HeartbeatHandle | null = null;

/**
 * Starts the heartbeat timer. At most one timer exists per process: a second call returns the
 * running handle. The timer is unref'd, so it never keeps the process alive, and it does not
 * wake a sleeping machine. An overdue interval after resume fires once, not once per missed period.
 */
export function startHeartbeat(options: HeartbeatOptions): HeartbeatHandle {
  if (active) return active;
  const timers = options.timers ?? { setInterval, clearInterval };
  const uptimeMs = options.uptimeMs ?? (() => process.uptime() * 1000);
  const timer = timers.setInterval(() => {
    try {
      const elapsed = Math.round(uptimeMs());
      if (!Number.isFinite(elapsed)) return;
      options.track(Math.min(HEARTBEAT_MAX_DURATION_MS, Math.max(0, elapsed)));
    } catch {
      /* the heartbeat never affects the running app */
    }
  }, options.intervalMs ?? HEARTBEAT_INTERVAL_MS);
  (timer as { unref?: () => void }).unref?.();

  const handle: HeartbeatHandle = {
    stop() {
      timers.clearInterval(timer);
      if (active === handle) active = null;
    },
  };
  active = handle;
  return handle;
}
