const MAX_MAIN_VIEW_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Adds `duration` (milliseconds since process start) to a `main_view_entered` record when the
 * renderer did not send one. Returns the properties unchanged when the process start time is
 * unavailable, so old records and failed reads both stay valid.
 */
export function withMainViewDuration(
  properties: Record<string, unknown> | undefined,
  uptimeMs: () => number = () => process.uptime() * 1000,
): Record<string, unknown> | undefined {
  if (properties && typeof properties.duration === 'number') return properties;
  let elapsed: number;
  try {
    elapsed = Math.round(uptimeMs());
  } catch {
    return properties;
  }
  if (!Number.isFinite(elapsed)) return properties;
  return { ...properties, duration: Math.min(MAX_MAIN_VIEW_DURATION_MS, Math.max(0, elapsed)) };
}
