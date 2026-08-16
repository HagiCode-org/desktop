import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readPublicTelemetryConfig, validatePublicTelemetryConfig } from '../telemetry/config.js';
import { MemoryRegionCache, RegionResolver } from '../telemetry/region-resolver.js';
import { sanitizeProperties } from '../telemetry/privacy.js';
import { TelemetryManager } from '../telemetry/telemetry-manager.js';
import type { PublicTelemetryConfig, TelemetryEvent, TelemetryProvider } from '../telemetry/types.js';

function config(overrides: Partial<PublicTelemetryConfig> = {}): PublicTelemetryConfig {
  return {
    enabled: true,
    defaultRegion: 'overseas',
    regionDetectionUrl: 'https://example.test/geo',
    sampleRate: 1,
    sessionReplay: false,
    ...overrides,
  };
}

describe('cloud telemetry', () => {
  it('validates public configuration and clamps environment values', () => {
    const result = readPublicTelemetryConfig({
      HAGICODE_TELEMETRY_DEFAULT_REGION: 'cn',
      HAGICODE_TELEMETRY_SAMPLE_RATE: '2',
      HAGICODE_TELEMETRY_REGION_URL: 'not a url',
    });
    assert.equal(result.defaultRegion, 'cn');
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

  it('uses cache first and keeps invalid detection responses out of the cache', async () => {
    const cache = new MemoryRegionCache();
    cache.set('cn');
    const resolver = new RegionResolver({
      defaultRegion: 'overseas',
      detectionUrl: 'https://example.test/geo',
      cache,
      fetcher: async () => new Response(JSON.stringify({ region: 'invalid' }), { status: 200 }),
    });
    assert.equal(resolver.initial(), 'cn');
    assert.equal(await resolver.detect(), null);
    assert.equal(cache.get(), 'cn');
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
    const provider = (region: 'cn' | 'overseas'): TelemetryProvider => ({
      region,
      status: { region, state: 'idle', capabilities: new Set(['event']) },
      init: async () => { events.push(`${region}:init`); },
      stop: async () => { events.push(`${region}:stop`); },
      flush: async () => { events.push(`${region}:flush`); },
      dispose: async () => { events.push(`${region}:dispose`); },
      identify: async () => {},
      send: async (event: TelemetryEvent) => { events.push(`${region}:${event.name}`); },
    });
    const manager = new TelemetryManager({
      config: config({ sampleRate: 1 }),
      appVersion: 'test',
      createProvider: provider,
    });
    await manager.init();
    (manager as unknown as { provider: TelemetryProvider }).provider!.status.state = 'ready';
    await manager.track('test');
    await manager.switchRegion('cn');
    assert.deepEqual(events, ['overseas:init', 'overseas:event', 'overseas:stop', 'overseas:flush', 'overseas:dispose', 'cn:init']);
  });
});
