import type { TelemetryContext } from './types.js';

const ALLOWED_KEYS = new Set([
  'appVersion', 'platform', 'arch', 'region', 'sessionId',
  'duration', 'status', 'kind', 'source', 'count', 'name',
]);
const SENSITIVE = /prompt|password|secret|token|credential|authorization|api[-_]?key|payload/i;

export function createTelemetryContext(
  base: Omit<TelemetryContext, 'sessionId'>,
  sessionId: string,
): TelemetryContext {
  return { ...base, sessionId };
}

export function sanitizeProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> {
  if (!properties) return {};
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_KEYS.has(key) || SENSITIVE.test(key)) continue;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      output[key] = value;
    }
  }
  return output;
}
