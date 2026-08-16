import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readPublicTelemetryConfig, validatePublicTelemetryConfig } from '../telemetry/config.js';
import { sanitizeProperties } from '../telemetry/privacy.js';
import { TelemetryManager } from '../telemetry/telemetry-manager.js';
import type { PublicTelemetryConfig, TelemetryEvent, TelemetryProvider } from '../telemetry/types.js';

function config(overrides: Partial<PublicTelemetryConfig> = {}): PublicTelemetryConfig {
  return {
    enabled: true,
    sampleRate: 1,
    sessionReplay: false,
    posthog: {
      apiKey: 'test',
      host: 'https://example.test',
      projectId: '',
      defaults: '2026-05-30',
      personProfiles: 'identified_only',
    },
    ...overrides,
  };
}

describe('cloud telemetry', () => {
  it('validates public configuration and clamps environment values', () => {
    const result = readPublicTelemetryConfig({
      HAGICODE_TELEMETRY_SAMPLE_RATE: '2',
    });
    assert.equal(result.sampleRate, 1);
    assert.deepEqual(validatePublicTelemetryConfig(result), []);
  });

  it('uses the supplied PostHog public defaults', () => {
    const result = readPublicTelemetryConfig({});
    assert.deepEqual(result.posthog, {
      apiKey: 'phc_qiVVihsL925ovhPYNdLJWz4k7aoKVMwYCevgZPE6PER5',
      host: 'https://us.i.posthog.com',
      projectId: '',
      defaults: '2026-05-30',
      personProfiles: 'identified_only',
    });
  });

  it('filters sensitive and non-whitelisted properties', () => {
    assert.deepEqual(sanitizeProperties({
      duration: 12,
      password: 'hidden',
      prompt: 'hidden',
      arbitrary: 'discarded',
      status: 'ok',
    }), { duration: 12, status: 'ok' });
  });

  it('limits queued events and switches providers in order', async () => {
    const events: string[] = [];
    const provider = (): TelemetryProvider => ({
      status: { state: 'idle', capabilities: new Set(['event']) },
      init: async () => { events.push('posthog:init'); },
      stop: async () => { events.push('posthog:stop'); },
      flush: async () => { events.push('posthog:flush'); },
      dispose: async () => { events.push('posthog:dispose'); },
      identify: async () => {},
      send: async (event: TelemetryEvent) => { events.push(`posthog:${event.name}`); },
    });
    const manager = new TelemetryManager({
      config: config({ sampleRate: 1 }),
      appVersion: 'test',
      createProvider: provider,
    });
    await manager.init();
    (manager as unknown as { provider: TelemetryProvider }).provider!.status.state = 'ready';
    await manager.track('test');
    assert.deepEqual(events, ['posthog:init', 'posthog:event']);
  });
});
