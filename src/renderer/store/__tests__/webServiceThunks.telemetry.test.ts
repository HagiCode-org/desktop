// Telemetry contract for web service start/restart requests (tasks 5.2, 5.5, 5.6).
// Payloads are asserted at window.electronAPI.cloudTelemetry.event, the same bridge trackEvent uses.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { before, beforeEach, after, describe, it } from 'node:test';
import { configureStore } from '@reduxjs/toolkit';
import webServiceReducer from '../slices/webServiceSlice.js';

// The thunk imports '../../i18n' (a directory) and extensionless sibling modules, which Node ESM cannot
// resolve through the TS source loader. This hook stubs the i18n import and appends '.ts' to extensionless
// relative imports under src/renderer. It is registered per test file because node --test isolates each file.
const i18nStubHook = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '../../i18n' && context.parentURL?.endsWith('/store/thunks/webServiceThunks.ts')) {
    return {
      url: 'data:text/javascript,' + encodeURIComponent('export default { t: (key) => key };'),
      shortCircuit: true,
    };
  }
  if (/^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?[jt]sx?$|\\.json$/.test(specifier) && context.parentURL?.includes('/src/renderer/')) {
    try {
      return await nextResolve(specifier + '.ts', context);
    } catch {
      // fall through to the default resolution below
    }
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(i18nStubHook)}`);

type Thunks = typeof import('../thunks/webServiceThunks.js');

let thunks: Thunks;

before(async () => {
  thunks = await import('../thunks/webServiceThunks.js');
});

interface Emitted {
  name: string;
  properties: Record<string, unknown>;
}

interface StartResult {
  success: boolean;
  error?: { type: string; details: string };
  startupFailure?: unknown;
  telemetry?: Record<string, unknown>;
}

interface Harness {
  emitted: Emitted[];
  startCalls: unknown[][];
  restartCalls: number;
}

const runningStatus = {
  status: 'running',
  uptime: 0,
  startTime: null,
  pid: null,
  url: null,
  restartCount: 0,
  phase: 'running',
  host: '127.0.0.1',
  port: 5000,
};

function installWindow(options: {
  startWebService?: () => Promise<StartResult>;
  restartWebService?: () => Promise<boolean>;
}): Harness {
  const harness: Harness = { emitted: [], startCalls: [], restartCalls: 0 };
  const electronAPI = {
    startWebService: (...args: unknown[]) => {
      harness.startCalls.push(args);
      return options.startWebService ? options.startWebService() : Promise.resolve({ success: true });
    },
    restartWebService: () => {
      harness.restartCalls += 1;
      return options.restartWebService ? options.restartWebService() : Promise.resolve(true);
    },
    getWebServiceStatus: async () => runningStatus,
    cloudTelemetry: {
      event: async (name: string, properties: Record<string, unknown>) => {
        harness.emitted.push({ name, properties });
      },
    },
  };
  (globalThis as { window?: unknown }).window = { electronAPI };
  return harness;
}

function createStore() {
  return configureStore({ reducer: { webService: webServiceReducer } });
}

function namesOf(emitted: Emitted[]): string[] {
  return emitted.map((entry) => entry.name);
}

function startFinished(emitted: Emitted[]): Emitted[] {
  return emitted.filter((entry) => entry.name === 'web_service_start_finished');
}

function failureResult(type: string, telemetry?: Record<string, unknown>): StartResult {
  return {
    success: false,
    error: { type, details: 'details' },
    ...(telemetry ? { telemetry } : {}),
  };
}

describe('web service start telemetry', () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = undefined;
  });

  after(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  describe('requested events', () => {
    it('emits requested with home_button by default, before finished', async () => {
      const harness = installWindow({});
      await createStore().dispatch(thunks.startWebService());

      assert.deepEqual(namesOf(harness.emitted), ['web_service_start_requested', 'web_service_start_finished']);
      assert.deepEqual(harness.emitted[0].properties, { trigger: 'home_button' });
      assert.equal(harness.emitted[1].properties.status, 'success');
    });

    it('emits requested with the trigger passed to startWebService before finished', async () => {
      const harness = installWindow({});
      await createStore().dispatch(thunks.startWebService({ trigger: 'auto' }));

      assert.deepEqual(namesOf(harness.emitted), ['web_service_start_requested', 'web_service_start_finished']);
      assert.deepEqual(harness.emitted[0].properties, { trigger: 'auto' });
    });

    it('emits exactly one requested event for confirmStartWithWarning and does not route through startWebService', async () => {
      const harness = installWindow({});
      await createStore().dispatch(thunks.confirmStartWithWarning());

      assert.deepEqual(namesOf(harness.emitted), ['web_service_start_requested', 'web_service_start_finished']);
      assert.deepEqual(harness.emitted[0].properties, { trigger: 'home_button' });
      assert.deepEqual(harness.startCalls, [[true]]);
    });

    it('emits requested with restart before restart finished', async () => {
      const harness = installWindow({});
      await createStore().dispatch(thunks.restartWebService());

      assert.deepEqual(namesOf(harness.emitted), ['web_service_start_requested', 'web_service_restart_finished']);
      assert.deepEqual(harness.emitted[0].properties, { trigger: 'restart' });
      assert.equal(harness.restartCalls, 1);
    });

    it('keeps the requested event for a request that never finishes', async () => {
      const harness = installWindow({ startWebService: () => new Promise<StartResult>(() => undefined) });
      void createStore().dispatch(thunks.startWebService({ trigger: 'home_button' }));
      await new Promise((resolve) => setImmediate(resolve));

      assert.deepEqual(namesOf(harness.emitted), ['web_service_start_requested']);
      assert.deepEqual(harness.emitted[0].properties, { trigger: 'home_button' });
    });
  });

  describe('finished detail fields', () => {
    it('forwards failedPhase, missingDependency and missingCount for dependencies_missing', async () => {
      const harness = installWindow({
        startWebService: async () => failureResult('dependency-requirements-not-met', {
          failedPhase: 'checking_dependencies',
          missingDependency: 'nodejs',
          missingCount: 2,
        }),
      });
      await createStore().dispatch(thunks.startWebService());

      const [finished] = startFinished(harness.emitted);
      assert.deepEqual(finished.properties, {
        status: 'failure',
        errorKind: 'dependencies_missing',
        duration: finished.properties.duration,
        failedPhase: 'checking_dependencies',
        missingDependency: 'nodejs',
        missingCount: 2,
      });
    });

    it('forwards failedPhase only and omits missingDependency and missingCount for other error kinds', async () => {
      const harness = installWindow({
        startWebService: async () => failureResult('version-not-ready', {
          failedPhase: 'spawning',
          missingDependency: 'nodejs',
          missingCount: 2,
        }),
      });
      await createStore().dispatch(thunks.startWebService());

      const [finished] = startFinished(harness.emitted);
      assert.equal(finished.properties.errorKind, 'version_not_ready');
      assert.equal(finished.properties.failedPhase, 'spawning');
      assert.equal('missingDependency' in finished.properties, false);
      assert.equal('missingCount' in finished.properties, false);
    });

    it('omits every detail field when the failure carries no telemetry', async () => {
      const harness = installWindow({ startWebService: async () => failureResult('no-active-version') });
      await createStore().dispatch(thunks.startWebService());

      const [finished] = startFinished(harness.emitted);
      assert.deepEqual(Object.keys(finished.properties).sort(), ['duration', 'errorKind', 'status']);
      assert.equal(finished.properties.errorKind, 'no_active_version');
    });

    it('omits every detail field on success even when telemetry is present', async () => {
      const harness = installWindow({
        startWebService: async () => ({
          success: true,
          telemetry: { failedPhase: 'spawning', missingDependency: 'nodejs', missingCount: 1 },
        }),
      });
      await createStore().dispatch(thunks.startWebService());

      const [finished] = startFinished(harness.emitted);
      assert.deepEqual(Object.keys(finished.properties).sort(), ['duration', 'status']);
      assert.equal(finished.properties.status, 'success');
    });

    it('drops out-of-range and unknown detail values', async () => {
      const harness = installWindow({
        startWebService: async () => failureResult('dependency-requirements-not-met', {
          failedPhase: 'bogus_phase',
          missingDependency: 'python',
          missingCount: 500,
        }),
      });
      await createStore().dispatch(thunks.startWebService());

      const [finished] = startFinished(harness.emitted);
      assert.equal(finished.properties.errorKind, 'dependencies_missing');
      assert.equal('failedPhase' in finished.properties, false);
      assert.equal('missingDependency' in finished.properties, false);
      assert.equal('missingCount' in finished.properties, false);
    });

    it('drops a negative missingCount while keeping valid siblings', async () => {
      const harness = installWindow({
        startWebService: async () => failureResult('dependency-requirements-not-met', {
          failedPhase: 'checking_dependencies',
          missingDependency: 'dotnet-runtime',
          missingCount: -1,
        }),
      });
      await createStore().dispatch(thunks.startWebService());

      const [finished] = startFinished(harness.emitted);
      assert.equal(finished.properties.failedPhase, 'checking_dependencies');
      assert.equal(finished.properties.missingDependency, 'dotnet-runtime');
      assert.equal('missingCount' in finished.properties, false);
    });

    it('forwards the same detail from confirmStartWithWarning failures', async () => {
      const harness = installWindow({
        startWebService: async () => failureResult('dependency-requirements-not-met', {
          failedPhase: 'checking_dependencies',
          missingDependency: 'claude-code',
          missingCount: 1,
        }),
      });
      await createStore().dispatch(thunks.confirmStartWithWarning());

      const [finished] = startFinished(harness.emitted);
      assert.equal(finished.properties.errorKind, 'dependencies_missing');
      assert.equal(finished.properties.missingDependency, 'claude-code');
      assert.equal(finished.properties.missingCount, 1);
      assert.equal(finished.properties.failedPhase, 'checking_dependencies');
    });
  });
});
