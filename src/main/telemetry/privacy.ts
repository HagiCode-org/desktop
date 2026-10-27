import {
  SEMVER_MAX_LENGTH,
  SEMVER_PATTERN,
  TELEMETRY_DISTRIBUTION_MODES,
  TELEMETRY_SERVICE_REGIONS,
  type TelemetryPropertySpec,
} from '../../shared/telemetry-events.js';
import { SUPPORTED_DESKTOP_LANGUAGE_CODES } from '../../shared/desktop-languages.js';
import type { TelemetryContext, TelemetryDimensions } from './types.js';

const ALLOWED_KEYS = new Set([
  'appVersion', 'platform', 'arch', 'sessionId',
  'duration', 'status', 'kind', 'source', 'count', 'name',
]);
export const SENSITIVE_KEY_PATTERN = /prompt|password|secret|token|credential|authorization|api[-_]?key|payload/i;

export function createTelemetryContext(base: Omit<TelemetryContext, 'sessionId'>, sessionId: string): TelemetryContext {
  return { ...base, sessionId };
}

/**
 * Keeps only the dimensions whose values are members of their enumerations.
 * Unknown or invalid values are omitted rather than guessed.
 */
export function sanitizeDimensions(input: Partial<Record<keyof TelemetryDimensions, unknown>> | undefined): Partial<TelemetryDimensions> {
  const output: Partial<TelemetryDimensions> = {};
  if (!input) return output;
  if (includes(TELEMETRY_DISTRIBUTION_MODES, input.distribution)) output.distribution = input.distribution;
  if (includes(TELEMETRY_SERVICE_REGIONS, input.serviceRegion)) output.serviceRegion = input.serviceRegion;
  if (includes(SUPPORTED_DESKTOP_LANGUAGE_CODES, input.language)) output.language = input.language;
  return output;
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
  if (schema) applyOnlyWhen(output, schema);
  return output;
}

/** Second pass: a property with `onlyWhen` survives only when its sibling carries an allowed value. */
function applyOnlyWhen(
  output: Record<string, string | number | boolean | null>,
  schema: Readonly<Record<string, TelemetryPropertySpec>>,
): void {
  for (const key of Object.keys(output)) {
    const spec = schema[key];
    if (!spec || spec.type !== 'enum' || !spec.onlyWhen) continue;
    const sibling = output[spec.onlyWhen.property];
    if (typeof sibling !== 'string' || !spec.onlyWhen.values.includes(sibling)) delete output[key];
  }
}

function matchesPropertySpec(spec: TelemetryPropertySpec, value: unknown): value is string | number | boolean {
  switch (spec.type) {
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && value >= spec.min && value <= spec.max;
    case 'boolean':
      return typeof value === 'boolean';
    case 'semver':
      return typeof value === 'string' && value.length <= SEMVER_MAX_LENGTH && SEMVER_PATTERN.test(value);
  }
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
