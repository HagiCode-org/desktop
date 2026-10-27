export const EXIT_FLUSH_TIMEOUT_MS = 1500;

export interface ExitSequenceDeps {
  /**
   * True only in the instance that started the telemetry lifecycle (wrote the run marker).
   * A losing second instance returns false, so it neither sends `app_exited` nor clears the
   * marker of the running instance.
   */
  lifecycleActive: () => boolean;
  stopHeartbeat?: () => void;
  trackExited: () => Promise<void>;
  flush: (timeoutMs: number) => Promise<void>;
  clearRunMarker: () => void;
  /** Web service cleanup and the other shutdown work, run after the telemetry steps. */
  cleanup: () => Promise<void>;
  close: () => Promise<void>;
  exit: (code: number) => void;
  log?: (message: string, error: unknown) => void;
  flushTimeoutMs?: number;
}

/**
 * Builds the idempotent quit sequence. The first call runs it; later calls (for example, several
 * `before-quit` events in one shutdown) return the same promise, so nothing runs twice.
 *
 * Order: stop heartbeat, `app_exited`, bounded flush, clear run marker, cleanup (its own failure
 * is logged), then `close()` and `exit(0)` in every case. A stalled cleanup leaves the process
 * waiting after `app_exited` and the flush, so the exit event is never lost to it.
 */
export function createExitSequence(deps: ExitSequenceDeps): { run: () => Promise<void> } {
  let running: Promise<void> | null = null;
  const log = deps.log ?? (() => undefined);
  const flushTimeoutMs = deps.flushTimeoutMs ?? EXIT_FLUSH_TIMEOUT_MS;

  const run = (): Promise<void> => {
    if (running) return running;
    running = (async () => {
      const lifecycle = safely(deps.lifecycleActive, false);
      try {
        try { deps.stopHeartbeat?.(); } catch (error) { log('[Telemetry] heartbeat stop failed', error); }
        if (lifecycle) {
          try { await deps.trackExited(); } catch (error) { log('[Telemetry] app_exited failed', error); }
          try { await deps.flush(flushTimeoutMs); } catch (error) { log('[Telemetry] exit flush failed', error); }
          try { deps.clearRunMarker(); } catch (error) { log('[Telemetry] run marker clear failed', error); }
        }
        try {
          await deps.cleanup();
        } catch (error) {
          log('[App] Error during cleanup', error);
        }
      } finally {
        try { await deps.close(); } catch (error) { log('[Telemetry] close failed', error); }
        deps.exit(0);
      }
    })();
    return running;
  };

  return { run };
}

function safely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}
