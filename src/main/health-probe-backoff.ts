const BASE_PROBE_INTERVAL_MS = 5_000;
const MAX_PROBE_INTERVAL_MS = 60_000;
// Timer ticks can land a few milliseconds before the computed probe time.
const PROBE_TIMING_TOLERANCE_MS = 500;

/**
 * Spaces out health probes of an owned backend that is alive but failing.
 * The gap after the Nth consecutive failure is 5 s, 10 s, 20 s and so on, capped at 60 s.
 */
export class HealthProbeBackoff {
  private consecutiveFailures = 0;
  private nextProbeAt = 0;

  shouldProbe(now: number): boolean {
    return now + PROBE_TIMING_TOLERANCE_MS >= this.nextProbeAt;
  }

  recordFailure(probeStartedAt: number): void {
    this.consecutiveFailures += 1;
    const delayMs = Math.min(
      BASE_PROBE_INTERVAL_MS * 2 ** (this.consecutiveFailures - 1),
      MAX_PROBE_INTERVAL_MS,
    );
    this.nextProbeAt = probeStartedAt + delayMs;
  }

  reset(): void {
    this.consecutiveFailures = 0;
    this.nextProbeAt = 0;
  }
}
