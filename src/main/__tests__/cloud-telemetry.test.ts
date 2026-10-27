import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TELEMETRY_EVENT_CATALOG } from '../../shared/telemetry-events.js';
import { readPublicTelemetryConfig, validatePublicTelemetryConfig } from '../telemetry/config.js';
import { sanitizeDimensions, sanitizeProperties } from '../telemetry/privacy.js';
import { TelemetryManager, type TelemetryManagerOptions } from '../telemetry/telemetry-manager.js';
import type {
  PublicTelemetryConfig,
  ProviderStatus,
  TelemetryDimensions,
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
      uiHost: 'https://ui.example.test',
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
    capabilities: new Set(['event']),
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
  getDimensions?: TelemetryManagerOptions['getDimensions'];
} = {}) {
  const recorder = recordingProvider();
  const manager = new TelemetryManager({
    config: config(options.config),
    appVersion: 'test',
    createProvider: recorder.factory,
    installId: options.installId,
    random: options.random,
    getDimensions: options.getDimensions,
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
      host: 'https://t.hagicode.com',
      uiHost: 'https://us.posthog.com',
      projectId: '',
      defaults: '2026-05-30',
      personProfiles: 'identified_only',
    });
  });

  it('overrides the API host from HAGICODE_POSTHOG_HOST and keeps the other defaults', () => {
    const result = readPublicTelemetryConfig({ HAGICODE_POSTHOG_HOST: 'https://proxy.example.test' });
    assert.equal(result.posthog.host, 'https://proxy.example.test');
    assert.equal(result.posthog.uiHost, 'https://us.posthog.com');
  });

  it('overrides the UI host from HAGICODE_POSTHOG_UI_HOST', () => {
    const result = readPublicTelemetryConfig({ HAGICODE_POSTHOG_UI_HOST: 'https://ui.example.test' });
    assert.equal(result.posthog.uiHost, 'https://ui.example.test');
    assert.equal(result.posthog.host, 'https://t.hagicode.com');
  });

  it('falls back to the built-in defaults for blank host overrides', () => {
    const result = readPublicTelemetryConfig({
      HAGICODE_POSTHOG_HOST: '   ',
      HAGICODE_POSTHOG_UI_HOST: '',
    });
    assert.equal(result.posthog.host, 'https://t.hagicode.com');
    assert.equal(result.posthog.uiHost, 'https://us.posthog.com');
  });

  it('resolves person profiles to identified_only unless the value is exactly always', () => {
    assert.equal(readPublicTelemetryConfig({}).posthog.personProfiles, 'identified_only');
    assert.equal(readPublicTelemetryConfig({ HAGICODE_POSTHOG_PERSON_PROFILES: 'always' }).posthog.personProfiles, 'always');
    for (const value of ['Always', ' always', 'never', '']) {
      assert.equal(
        readPublicTelemetryConfig({ HAGICODE_POSTHOG_PERSON_PROFILES: value }).posthog.personProfiles,
        'identified_only',
        JSON.stringify(value),
      );
    }
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
      await manager.track('promote_link_opened', { source: 'home_promote' });
      assert.equal(events.length, delivered ? 3 : 0, `sampleRate=${sampleRate} draw=${draw}`);
    }
  });

  it('delivers always-class milestones even when the session is sampled out', async () => {
    const { manager, events } = await startManager({ config: { sampleRate: 0 }, random: () => 0.9 });
    await manager.track('app_started', { source: 'main_process', kind: 'startup' });
    await manager.track('view_entered', { view: 'system', previousView: 'none' });
    await manager.track('app_error', { kind: 'main_uncaught' });
    assert.deepEqual(events.map((event) => event.eventName ?? event.name), ['app_started', 'app_error']);
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

  it('documents every catalogued event once, with the same sampling class as the catalog', () => {
    const doc = readFileSync(fileURLToPath(new URL('../../../docs/cloud-telemetry.md', import.meta.url)), 'utf8');
    const catalogSection = doc.slice(doc.indexOf('## Event catalog'), doc.indexOf('## Dimensions'));
    const rows = [...catalogSection.matchAll(/^\| `([a-z_]+)` \| (always|session) \|/gm)].map((match) => [match[1], match[2]] as const);
    const documented = new Map(rows);
    assert.equal(rows.length, documented.size, 'each event has exactly one table row');
    assert.deepEqual([...documented.keys()].sort(), Object.keys(TELEMETRY_EVENT_CATALOG).sort());
    for (const [name, spec] of Object.entries(TELEMETRY_EVENT_CATALOG)) {
      assert.equal(documented.get(name), spec.sampling, name);
    }
  });

  it('keeps only the declared properties of every new or changed event', () => {
    const cases: Array<[eventName: keyof typeof TELEMETRY_EVENT_CATALOG, input: Record<string, unknown>, expected: Record<string, unknown>]> = [
      ['app_started',
        { source: 'main_process', kind: 'startup', previousExit: 'unclean', sampled: true, sampleRate: 0.25, daysSinceFirstLaunch: 12, extra: 'x' },
        { source: 'main_process', kind: 'startup', previousExit: 'unclean', sampled: true, sampleRate: 0.25, daysSinceFirstLaunch: 12 }],
      ['main_view_entered', { source: 'renderer', kind: 'main_view', duration: 900, extra: 'x' }, { source: 'renderer', kind: 'main_view', duration: 900 }],
      ['app_exited', { status: 'normal', duration: 200 * 24 * 3600 * 1000, extra: 'x' }, { status: 'normal', duration: 200 * 24 * 3600 * 1000 }],
      ['app_heartbeat', { duration: 6 * 3600 * 1000, extra: 'x' }, { duration: 6 * 3600 * 1000 }],
      ['app_upgraded', { previousVersion: '0.3.1', extra: 'x' }, { previousVersion: '0.3.1' }],
      ['app_error', { kind: 'main_uncaught', message: 'boom', stack: 'at x', path: '/a' }, { kind: 'main_uncaught' }],
      ['web_service_start_requested', { trigger: 'home_button', extra: 'x' }, { trigger: 'home_button' }],
      ['web_service_start_finished',
        { status: 'failure', errorKind: 'dependencies_missing', duration: 1200, failedPhase: 'checking_dependencies', missingDependency: 'nodejs', missingCount: 2, message: 'boom' },
        { status: 'failure', errorKind: 'dependencies_missing', duration: 1200, failedPhase: 'checking_dependencies', missingDependency: 'nodejs', missingCount: 2 }],
      ['first_service_started', { sinceFirstLaunch: 3600 * 1000, extra: 'x' }, { sinceFirstLaunch: 3600 * 1000 }],
      ['dependency_install_finished', { status: 'success', count: 3, extra: 'x' }, { status: 'success', count: 3 }],
    ];
    for (const [eventName, input, expected] of cases) {
      assert.deepEqual(sanitizeProperties(input, TELEMETRY_EVENT_CATALOG[eventName].properties), expected, eventName);
    }
  });

  it('drops invalid enum values and out-of-range or non-finite numbers in the new events', () => {
    const started = TELEMETRY_EVENT_CATALOG.app_started.properties;
    assert.deepEqual(sanitizeProperties({
      source: 'main_process',
      kind: 'startup',
      previousExit: 'maybe',
      sampled: 'yes',
      sampleRate: 2,
      daysSinceFirstLaunch: -1,
    }, started), { source: 'main_process', kind: 'startup' });
    assert.deepEqual(sanitizeProperties({ sinceFirstLaunch: Number.POSITIVE_INFINITY }, TELEMETRY_EVENT_CATALOG.first_service_started.properties), {});
    assert.deepEqual(sanitizeProperties({ duration: -5 }, TELEMETRY_EVENT_CATALOG.app_heartbeat.properties), {});
    assert.deepEqual(sanitizeProperties({ trigger: 'bogus' }, TELEMETRY_EVENT_CATALOG.web_service_start_requested.properties), {});
    assert.deepEqual(sanitizeProperties({
      failedPhase: '/tmp/x',
      missingDependency: 'nodejs',
      missingCount: 101,
    }, TELEMETRY_EVENT_CATALOG.web_service_start_finished.properties), { missingDependency: 'nodejs' });
  });

  it('accepts semver strings and rejects anything else for app_upgraded', () => {
    const spec = TELEMETRY_EVENT_CATALOG.app_upgraded.properties;
    for (const accepted of ['1.2.3', '1.2.3-beta.1']) {
      assert.deepEqual(sanitizeProperties({ previousVersion: accepted }, spec), { previousVersion: accepted }, accepted);
    }
    for (const rejected of ['1.2', 'v1.2.3', '1.2.3 beta', 'C:/apps/hagicode', `1.2.3-${'a'.repeat(64)}`]) {
      assert.deepEqual(sanitizeProperties({ previousVersion: rejected }, spec), {}, rejected);
    }
  });

  it('keeps app_error reason only for the *_gone kinds', () => {
    const spec = TELEMETRY_EVENT_CATALOG.app_error.properties;
    assert.deepEqual(sanitizeProperties({ kind: 'renderer_gone', reason: 'oom' }, spec), { kind: 'renderer_gone', reason: 'oom' });
    assert.deepEqual(sanitizeProperties({ kind: 'child_gone', reason: 'killed' }, spec), { kind: 'child_gone', reason: 'killed' });
    assert.deepEqual(sanitizeProperties({ kind: 'main_uncaught', reason: 'oom' }, spec), { kind: 'main_uncaught' });
    assert.deepEqual(sanitizeProperties({ kind: 'main_rejection', reason: 'other' }, spec), { kind: 'main_rejection' });
    assert.deepEqual(sanitizeProperties({ kind: 'renderer_uncaught', reason: 'other' }, spec), { kind: 'renderer_uncaught' });
  });

  it('attaches the current dimensions to every event and omits invalid ones', async () => {
    let dimensions: Partial<TelemetryDimensions> = { distribution: 'steam', serviceRegion: 'CN', language: 'zh-CN' };
    const { manager, events } = await startManager({ getDimensions: () => dimensions });
    await manager.track('view_entered', { view: 'system', previousView: 'none' });
    dimensions = { language: 'en-US' };
    await manager.track('view_entered', { view: 'web', previousView: 'system' });
    assert.equal(events[0].context.distribution, 'steam');
    assert.equal(events[0].context.serviceRegion, 'CN');
    assert.equal(events[0].context.language, 'zh-CN');
    assert.equal(events[1].context.language, 'en-US');
    assert.equal(events[1].context.distribution, undefined);
    assert.equal(events[1].context.serviceRegion, undefined);
  });

  it('omits dimensions with values outside their enumerations and still delivers the event', async () => {
    const { manager, events } = await startManager({
      getDimensions: () => ({ distribution: 'mars', serviceRegion: 'EU', language: 'xx-YY' } as unknown as Partial<TelemetryDimensions>),
    });
    await manager.track('view_entered', { view: 'system', previousView: 'none' });
    assert.equal(events.length, 1);
    for (const key of ['distribution', 'serviceRegion', 'language']) {
      assert.equal(key in events[0].context, false, key);
    }
  });

  it('omits every dimension when the resolver throws', async () => {
    const { manager, events } = await startManager({
      getDimensions: () => { throw new Error('settings unavailable'); },
    });
    await manager.track('view_entered', { view: 'system', previousView: 'none' });
    assert.equal(events.length, 1);
    assert.deepEqual(sanitizeDimensions({ distribution: 'mars' }), {});
    assert.equal('language' in events[0].context, false);
  });

  it('reports getSampling equal to the decision applied to session events', async () => {
    const cases: Array<[sampleRate: number, draw: number, sampled: boolean]> = [
      [0, 0, false],
      [1, 0.999, true],
      [0.25, 0.1, true],
      [0.25, 0.5, false],
    ];
    for (const [sampleRate, draw, sampled] of cases) {
      const { manager, events } = await startManager({ config: { sampleRate }, random: () => draw });
      assert.deepEqual(manager.getSampling(), { sampled, sampleRate }, `sampleRate=${sampleRate} draw=${draw}`);
      await manager.track('view_entered', { view: 'system', previousView: 'none' });
      assert.equal(events.length, sampled ? 1 : 0, `sampleRate=${sampleRate} draw=${draw}`);
    }
  });

  it('delivers dependency_install_finished in a launch that was sampled out', async () => {
    const { manager, events } = await startManager({ config: { sampleRate: 0 }, random: () => 0.9 });
    await manager.track('dependency_install_finished', { status: 'success', count: 2 });
    assert.deepEqual(events.map((event) => event.eventName), ['dependency_install_finished']);
  });

  it('bounds flush by the timeout when the provider flush never settles', async () => {
    const manager = new TelemetryManager({
      config: config(),
      appVersion: 'test',
      createProvider: () => providerWithFlush(() => new Promise<void>(() => {})),
    });
    await manager.init();
    const started = Date.now();
    await manager.flush(20);
    assert.ok(Date.now() - started < 2000);
  });

  it('flush resolves when the provider flush rejects', async () => {
    const manager = new TelemetryManager({
      config: config(),
      appVersion: 'test',
      createProvider: () => providerWithFlush(async () => { throw new Error('network down'); }),
    });
    await manager.init();
    await assert.doesNotReject(manager.flush(1000));
  });
});

function providerWithFlush(flush: () => Promise<void>): TelemetryProvider {
  const status: ProviderStatus = { state: 'idle', capabilities: new Set(['event']) };
  return {
    status,
    init: async () => { status.state = 'ready'; },
    stop: async () => {},
    flush,
    dispose: async () => {},
    identify: async () => {},
    send: async () => {},
  };
}
