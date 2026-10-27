import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TELEMETRY_EVENT_CATALOG } from '../../shared/telemetry-events.js';
import { sanitizeProperties } from '../telemetry/privacy.js';
import {
  buildStartFinishedProperties,
  classifyMissingStartDependencies,
  runOnboardingStartService,
  type StartOutcome,
} from '../telemetry/start-funnel.js';

describe('web service start funnel properties', () => {
  it('carries no failure detail on success', () => {
    assert.deepEqual(buildStartFinishedProperties({
      success: true,
      durationMs: 1200,
      detail: { failedPhase: 'running', missingDependency: 'nodejs', missingCount: 2 },
    }), { status: 'success', duration: 1200 });
  });

  it('carries failedPhase on any failure, and the dependency fields only for dependencies_missing', () => {
    assert.deepEqual(buildStartFinishedProperties({
      success: false,
      errorKind: 'dependencies_missing',
      durationMs: 300,
      detail: { failedPhase: 'checking_dependencies', missingDependency: 'cli-tool', missingCount: 2 },
    }), {
      status: 'failure',
      errorKind: 'dependencies_missing',
      duration: 300,
      failedPhase: 'checking_dependencies',
      missingDependency: 'cli-tool',
      missingCount: 2,
    });

    assert.deepEqual(buildStartFinishedProperties({
      success: false,
      errorKind: 'other',
      durationMs: 300,
      detail: { failedPhase: 'waiting_listening', missingDependency: 'nodejs', missingCount: 1 },
    }), {
      status: 'failure',
      errorKind: 'other',
      duration: 300,
      failedPhase: 'waiting_listening',
    });
  });

  it('omits failedPhase when the phase at failure is unknown', () => {
    assert.deepEqual(buildStartFinishedProperties({ success: false, durationMs: 5 }), {
      status: 'failure',
      errorKind: 'other',
      duration: 5,
    });
  });

  it('keeps every produced property inside the catalog for web_service_start_finished', () => {
    const spec = TELEMETRY_EVENT_CATALOG.web_service_start_finished.properties;
    const payload = buildStartFinishedProperties({
      success: false,
      errorKind: 'dependencies_missing',
      durationMs: 42,
      detail: { failedPhase: 'checking_dependencies', missingDependency: 'unknown', missingCount: 1 },
    });
    assert.deepEqual(sanitizeProperties(payload, spec), payload);
  });
});

function recordingDeps(
  outcome: (() => Promise<StartOutcome>) | StartOutcome,
  clock: number[] = [1000, 1450],
) {
  const events: Array<{ name: string; properties: Record<string, unknown> }> = [];
  let firstServiceCalls = 0;
  let progressCalls = 0;
  return {
    events,
    get firstServiceCalls() { return firstServiceCalls; },
    get progressCalls() { return progressCalls; },
    deps: {
      startWebService: async (_versionId: string, onProgress: (progress: unknown) => void) => {
        onProgress({ phase: 'starting' });
        if (typeof outcome === 'function') return outcome();
        return outcome;
      },
      onProgress: () => { progressCalls += 1; },
      track: (name: 'web_service_start_requested' | 'web_service_start_finished', properties: Record<string, unknown>) => {
        events.push({ name, properties });
      },
      reportFirstServiceStarted: () => { firstServiceCalls += 1; },
      now: () => clock.shift() ?? 0,
    },
  };
}

describe('onboarding start path', () => {
  it('emits requested with trigger onboarding before exactly one finished on success, then first_service_started', async () => {
    const recorder = recordingDeps({ success: true });
    const result = await runOnboardingStartService('v1', recorder.deps);
    assert.equal(result.success, true);
    assert.deepEqual(recorder.events, [
      { name: 'web_service_start_requested', properties: { trigger: 'onboarding' } },
      { name: 'web_service_start_finished', properties: { status: 'success', duration: 450 } },
    ]);
    assert.equal(recorder.firstServiceCalls, 1);
    assert.equal(recorder.progressCalls, 1);
  });

  it('reports a failed start with its phase and no first_service_started', async () => {
    const recorder = recordingDeps({
      success: false,
      error: 'Startup failed',
      telemetry: { failedPhase: 'waiting_listening' },
    });
    const result = await runOnboardingStartService('v1', recorder.deps);
    assert.equal(result.success, false);
    assert.deepEqual(recorder.events.map((event) => event.name), [
      'web_service_start_requested',
      'web_service_start_finished',
    ]);
    assert.deepEqual(recorder.events[1].properties, {
      status: 'failure',
      errorKind: 'other',
      duration: 450,
      failedPhase: 'waiting_listening',
    });
    assert.equal(recorder.firstServiceCalls, 0);
  });

  it('emits one finished failure and returns an error when the start throws', async () => {
    const recorder = recordingDeps(async () => { throw new Error('spawn ENOENT C:/secret'); });
    const result = await runOnboardingStartService('v1', recorder.deps);
    assert.deepEqual(result, { success: false, error: 'spawn ENOENT C:/secret' });
    const finished = recorder.events.filter((event) => event.name === 'web_service_start_finished');
    assert.equal(finished.length, 1);
    assert.deepEqual(finished[0].properties, { status: 'failure', errorKind: 'other', duration: 450 });
    assert.equal(recorder.firstServiceCalls, 0);
  });
});

describe('web service failed-phase recording (source contract)', () => {
  it('records the last working phase before an error, resets it per attempt, and reports it on failure', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const managerSource = await readFile(path.resolve(process.cwd(), 'src/main/web-service-manager.ts'), 'utf-8');
    const resultSource = await readFile(path.resolve(process.cwd(), 'src/main/manifest-reader.ts'), 'utf-8');
    const mainSource = await readFile(path.resolve(process.cwd(), 'src/main/main.ts'), 'utf-8');

    assert.match(managerSource, /if \(phase !== StartupPhase\.Error\) this\.lastNonErrorPhase = phase;/);
    assert.match(managerSource, /private async startInternal\(\): Promise<StartResult> \{[\s\S]*?this\.lastNonErrorPhase = null;/);
    assert.match(managerSource, /failedPhase: this\.lastNonErrorPhase \?\? undefined,/);
    assert.match(resultSource, /failedPhase\?: string;/);
    assert.match(mainSource, /telemetry: \{ failedPhase: result\.failedPhase \}/);
    assert.match(mainSource, /telemetry: \{\s*failedPhase: StartupPhase\.CheckingDependencies,\s*\.\.\.dependencyValidation\.missing,/);
  });
});

describe('missing start dependency classification', () => {
  it('maps an unavailable Node/npm environment to nodejs with a count of one', () => {
    assert.deepEqual(classifyMissingStartDependencies({ reason: 'environment-unavailable' }), {
      missingDependency: 'nodejs',
      missingCount: 1,
    });
  });

  it('maps unsatisfied required managed packages to cli-tool with their count', () => {
    assert.deepEqual(classifyMissingStartDependencies({ reason: 'required-packages', unsatisfiedCount: 3 }), {
      missingDependency: 'cli-tool',
      missingCount: 3,
    });
  });

  it('falls back to unknown when the dependency service is uninitialized or no package is unsatisfied', () => {
    assert.deepEqual(classifyMissingStartDependencies({ reason: 'service-uninitialized' }), {
      missingDependency: 'unknown',
      missingCount: 1,
    });
    assert.deepEqual(classifyMissingStartDependencies({ reason: 'required-packages', unsatisfiedCount: 0 }), {
      missingDependency: 'unknown',
      missingCount: 1,
    });
  });

  it('produces values the catalog accepts for web_service_start_finished', () => {
    const spec = TELEMETRY_EVENT_CATALOG.web_service_start_finished.properties;
    for (const input of [
      { reason: 'environment-unavailable' as const },
      { reason: 'required-packages' as const, unsatisfiedCount: 2 },
      { reason: 'service-uninitialized' as const },
    ]) {
      const detail = classifyMissingStartDependencies(input);
      const payload = buildStartFinishedProperties({
        success: false,
        errorKind: 'dependencies_missing',
        durationMs: 1,
        detail: { failedPhase: 'checking_dependencies', ...detail },
      });
      assert.deepEqual(sanitizeProperties(payload, spec), payload);
    }
  });
});
