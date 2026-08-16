import type { PublicTelemetryConfig } from './types.js';
const DEFAULT_POSTHOG_KEY = 'phc_qiVVihsL925ovhPYNdLJWz4k7aoKVMwYCevgZPE6PER5';
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const DEFAULT_POSTHOG_DEFAULTS = '2026-05-30';

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
  return {
    enabled: env.HAGICODE_TELEMETRY_ENABLED !== '0',
    sampleRate: sampleRate(env.HAGICODE_TELEMETRY_SAMPLE_RATE),
    sessionReplay: env.HAGICODE_TELEMETRY_SESSION_REPLAY === '1',
    posthog: {
      apiKey: publicValue(env.HAGICODE_POSTHOG_PUBLIC_KEY) ?? DEFAULT_POSTHOG_KEY,
      host: publicValue(env.HAGICODE_POSTHOG_HOST) ?? DEFAULT_POSTHOG_HOST,
      projectId: publicValue(env.HAGICODE_POSTHOG_PROJECT_ID) ?? '',
      defaults: publicValue(env.HAGICODE_POSTHOG_DEFAULTS) ?? DEFAULT_POSTHOG_DEFAULTS,
      personProfiles: env.HAGICODE_POSTHOG_PERSON_PROFILES === 'always' ? 'always' : 'identified_only',
    },
  };
}

export function validatePublicTelemetryConfig(config: PublicTelemetryConfig): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(config.sampleRate) || config.sampleRate < 0 || config.sampleRate > 1) {
    errors.push('sampleRate must be between 0 and 1');
  }
  if (!config.posthog.apiKey || !config.posthog.host) {
    errors.push('PostHog public identifiers are incomplete');
  }
  return errors;
}
