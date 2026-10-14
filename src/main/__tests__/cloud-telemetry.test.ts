import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TELEMETRY_EVENT_CATALOG } from '../../shared/telemetry-events.js';
import { readPublicTelemetryConfig, validatePublicTelemetryConfig } from '../telemetry/config.js';
import { sanitizeProperties } from '../telemetry/privacy.js';
import { TelemetryManager } from '../telemetry/telemetry-manager.js';
import type {
  PublicTelemetryConfig,
  ProviderStatus,
  TelemetryEvent,
  TelemetryProvider,
  TelemetryUser,
} from '../telemetry/types.js';

const INSTALL_ID = '3f2b8c1e-9a4d-4e6f-8b7c-1d2e3f4a5b6c';

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

function recordingProvider() {
  const events: TelemetryEvent[] = [];
  const identified: TelemetryUser[] = [];
  const status: ProviderStatus = {
    state: 'idle',
    capabilities: new Set(['error', 'event', 'performance', 'heartbeat']),
  };
  const provider: TelemetryProvider = {
    status,
    init: async () => { status.state = 'ready'; },
    stop: async () => {},
    flush: async () => {},
    dispose: async () => {},
    identify: async (user) => { identified.push(user); },
    send: async (event) => { events.push(event); },
  };
  return { factory: () => provider, events, identified };
}

async function startManager(options: {
  config?: Partial<PublicTelemetryConfig>;
  installId?: string;
  random?: () => number;
} = {}) {
  const recorder = recordingProvider();
  const manager = new TelemetryManager({
    config: config(options.config),
    appVersion: 'test',
    createProvider: recorder.factory,
    installId: options.installId,
    random: options.random,
    sessionId: 'session-1',
  });
  await manager.init();
  return { manager, ...recorder };
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

  it('filters sensitive and non-whitelisted properties without a schema', () => {
    assert.deepEqual(sanitizeProperties({
      duration: 12,
      password: 'hidden',
      prompt: 'hidden',
      arbitrary: 'discarded',
      status: 'ok',
    }), { duration: 12, status: 'ok' });
  });

  it('keeps only schema-declared properties whose values match their declaration', () => {
    const spec = TELEMETRY_EVENT_CATALOG.web_service_start_finished.properties;
    assert.deepEqual(sanitizeProperties({
      status: 'failure',
      errorKind: 'other',
      duration: 12,
      path: 'C:/secret',
      message: 'boom',
    }, spec), { status: 'failure', errorKind: 'other', duration: 12 });
  });

  it('drops out-of-enumeration strings and out-of-range numbers', () => {
    const spec = TELEMETRY_EVENT_CATALOG.web_service_start_finished.properties;
    assert.deepEqual(sanitizeProperties({
      status: 'maybe',
      errorKind: '/Users/alice',
      duration: -1,
    }, spec), {});
    assert.deepEqual(sanitizeProperties({ duration: Number.NaN }, spec), {});
  });

  it('never passes sensitive keys even when a schema declares them', () => {
    assert.deepEqual(sanitizeProperties({ apiToken: 'x', status: 'success' }, {
      apiToken: { type: 'enum', values: ['x'] },
      status: { type: 'enum', values: ['success'] },
    }), { status: 'success' });
  });

  it('drops events whose name is not in the catalog', async () => {
    const { manager, events } = await startManager();
    await manager.track('not_in_catalog', { status: 'success' });
    assert.deepEqual(events, []);
  });

  it('delivers catalogued events under their catalog name with declared properties only', async () => {
    const { manager, events } = await startManager();
    await manager.track('view_entered', { view: 'system', previousView: 'none', name: 'x', path: '/a' });
    assert.equal(events.length, 1);
    assert.equal(events[0].eventName, 'view_entered');
    assert.deepEqual(events[0].properties, { view: 'system', previousView: 'none' });
  });

  it('samples session-class events with one draw per session', async () => {
    const cases: Array<[sampleRate: number, draw: number, delivered: boolean]> = [
      [0, 0, false],
      [0.1, 0.05, true],
      [0.1, 0.5, false],
      [1, 0.999, true],
    ];
    for (const [sampleRate, draw, delivered] of cases) {
      const { manager, events } = await startManager({ config: { sampleRate }, random: () => draw });
      await manager.track('view_entered', { view: 'system', previousView: 'none' });
      await manager.track('language_changed', { language: 'zh-CN' });
      await manager.heartbeat({});
      assert.equal(events.length, delivered ? 3 : 0, `sampleRate=${sampleRate} draw=${draw}`);
    }
  });

  it('delivers always-class milestones even when the session is sampled out', async () => {
    const { manager, events } = await startManager({ config: { sampleRate: 0 }, random: () => 0.9 });
    await manager.track('app_started', { source: 'main_process', kind: 'startup' });
    await manager.track('view_entered', { view: 'system', previousView: 'none' });
    await manager.reportError(new TypeError('x'));
    assert.deepEqual(events.map((event) => event.eventName ?? event.name), ['app_started']);
  });

  it('uses the installation id as the event user and identifies at init', async () => {
    const { manager, events, identified } = await startManager({ installId: INSTALL_ID });
    await manager.track('app_started', { source: 'main_process', kind: 'startup' });
    assert.deepEqual(identified, [{ id: INSTALL_ID, anonymous: true }]);
    assert.deepEqual(events[0].user, { id: INSTALL_ID, anonymous: true });
  });

  it('falls back to the session identity when no installation id is available', async () => {
    const { manager, events, identified } = await startManager();
    await manager.track('app_started', { source: 'main_process', kind: 'startup' });
    assert.deepEqual(identified, []);
    assert.equal(events[0].user, undefined);
    assert.equal(events[0].context.sessionId, 'session-1');
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
    await manager.track('view_entered', { view: 'system', previousView: 'none' });
    assert.deepEqual(events, ['posthog:init', 'posthog:event']);
  });
});
