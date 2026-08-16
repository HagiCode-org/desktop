import type { PublicTelemetryConfig, TelemetryRegion } from './types.js';

const DEFAULT_DETECTION_URL = 'https://api.hagicode.com/geo';
const DEFAULT_POSTHOG_KEY = 'phc_qiVVihsL925ovhPYNdLJWz4k7aoKVMwYCevgZPE6PER5';
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const DEFAULT_POSTHOG_DEFAULTS = '2026-05-30';

function region(value: string | undefined, fallback: TelemetryRegion): TelemetryRegion {
  return value === 'cn' || value === 'overseas' ? value : fallback;
}

function sampleRate(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0.1;
}

function publicValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function readPublicTelemetryConfig(
  env: NodeJS.ProcessEnv = process.env,
): PublicTelemetryConfig {
  const defaultRegion = region(env.HAGICODE_TELEMETRY_DEFAULT_REGION, 'overseas');
  const detectionUrl = publicValue(env.HAGICODE_TELEMETRY_REGION_URL) ?? DEFAULT_DETECTION_URL;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(detectionUrl);
  } catch {
    parsedUrl = new URL(DEFAULT_DETECTION_URL);
  }

  return {
    enabled: env.HAGICODE_TELEMETRY_ENABLED !== '0',
    defaultRegion,
    regionDetectionUrl: parsedUrl.toString(),
    sampleRate: sampleRate(env.HAGICODE_TELEMETRY_SAMPLE_RATE),
    sessionReplay: env.HAGICODE_TELEMETRY_SESSION_REPLAY === '1',
    cloudcare: env.HAGICODE_CLOUDCARE_APP_ID && env.HAGICODE_CLOUDCARE_CLIENT_TOKEN
      ? {
        appId: env.HAGICODE_CLOUDCARE_APP_ID,
        clientToken: env.HAGICODE_CLOUDCARE_CLIENT_TOKEN,
        site: publicValue(env.HAGICODE_CLOUDCARE_SITE) ?? 'https://rum-api.cloudcare.cn',
      }
      : undefined,
    sentry: env.HAGICODE_SENTRY_DSN
      ? { dsn: env.HAGICODE_SENTRY_DSN, projectId: publicValue(env.HAGICODE_SENTRY_PROJECT_ID) ?? '' }
      : undefined,
    posthog: publicValue(env.HAGICODE_POSTHOG_PUBLIC_KEY) ?? DEFAULT_POSTHOG_KEY
      ? {
        apiKey: publicValue(env.HAGICODE_POSTHOG_PUBLIC_KEY) ?? DEFAULT_POSTHOG_KEY,
        host: publicValue(env.HAGICODE_POSTHOG_HOST) ?? DEFAULT_POSTHOG_HOST,
        projectId: publicValue(env.HAGICODE_POSTHOG_PROJECT_ID) ?? '',
        defaults: publicValue(env.HAGICODE_POSTHOG_DEFAULTS) ?? DEFAULT_POSTHOG_DEFAULTS,
        personProfiles: env.HAGICODE_POSTHOG_PERSON_PROFILES === 'always'
          ? 'always'
          : 'identified_only',
      }
      : undefined,
  };
}

export function validatePublicTelemetryConfig(config: PublicTelemetryConfig): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(config.sampleRate) || config.sampleRate < 0 || config.sampleRate > 1) {
    errors.push('sampleRate must be between 0 and 1');
  }
  try {
    new URL(config.regionDetectionUrl);
  } catch {
    errors.push('regionDetectionUrl must be an absolute URL');
  }
  if (config.cloudcare && (!config.cloudcare.appId || !config.cloudcare.clientToken)) {
    errors.push('cloudcare public identifiers are incomplete');
  }
  if (config.sentry && !config.sentry.dsn) {
    errors.push('sentry DSN is required when Sentry is configured');
  }
  if (config.posthog && (!config.posthog.apiKey || !config.posthog.host)) {
    errors.push('PostHog public identifiers are incomplete');
  }
  return errors;
}
