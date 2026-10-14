import type { TelemetryPropertySpec } from '../../shared/telemetry-events.js';
import type { TelemetryContext } from './types.js';

const ALLOWED_KEYS = new Set([
  'appVersion', 'platform', 'arch', 'sessionId',
  'duration', 'status', 'kind', 'source', 'count', 'name',
]);
export const SENSITIVE_KEY_PATTERN = /prompt|password|secret|token|credential|authorization|api[-_]?key|payload/i;

export function createTelemetryContext(base: Omit<TelemetryContext, 'sessionId'>, sessionId: string): TelemetryContext {
  return { ...base, sessionId };
}

export function sanitizeProperties(
  properties: Record<string, unknown> | undefined,
  schema?: Readonly<Record<string, TelemetryPropertySpec>>,
): Record<string, string | number | boolean | null> {
  if (!properties) return {};
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (schema) {
      if (!Object.prototype.hasOwnProperty.call(schema, key)) continue;
      if (matchesPropertySpec(schema[key], value)) output[key] = value;
      continue;
    }
    if (!ALLOWED_KEYS.has(key)) continue;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      output[key] = value;
    }
  }
  return output;
}

function matchesPropertySpec(spec: TelemetryPropertySpec, value: unknown): value is string | number | boolean {
  switch (spec.type) {
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && value >= spec.min && value <= spec.max;
    case 'boolean':
      return typeof value === 'boolean';
  }
}
