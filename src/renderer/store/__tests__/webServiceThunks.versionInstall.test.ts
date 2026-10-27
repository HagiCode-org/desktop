// Regression test for version_install_finished in installWebServicePackage (tasks 6.1-6.3).
//
// Result at HEAD before the 6.2 fix (trackVersionInstallFinished read installProgress from Redux at outcome time):
//   - normal progress state: success, failure and thrown error each emit version_install_finished once (pass).
//   - installProgress forced to null when the outcome is processed: all three outcomes drop the event (fail).
//   - source-fallback progress followed by a switching event: mode is reported as http-direct (fail).
// After the 6.2 fix every case below must emit exactly one event with the mode the download actually used.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';
import { configureStore } from '@reduxjs/toolkit';
import webServiceReducer, { setInstallProgress, type InstallProgress } from '../slices/webServiceSlice.js';
import type { InstallWebServicePackageResult } from '../../../types/version-install.js';

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

type Outcome = 'success' | 'failure' | 'throw';

interface Scenario {
  outcome: Outcome;
  forceNullProgress: boolean;
  progressEvents: InstallProgress[];
}

const httpDirectProgress: InstallProgress = {
  stage: 'downloading',
  mode: 'http-direct',
  current: 1,
  total: 2,
  percentage: 50,
  message: 'direct-http',
};

const httpDirectVerifying: InstallProgress = {
  stage: 'verifying',
  mode: 'http-direct',
  current: 2,
  total: 2,
  percentage: 90,
  message: 'sha256-verifying',
};

const sourceFallbackProgress: InstallProgress = {
  stage: 'downloading',
  mode: 'source-fallback',
  current: 1,
  total: 2,
  percentage: 40,
  message: 'source-fallback-active',
};

const switchingProgress: InstallProgress = {
  stage: 'switching',
  mode: 'http-direct',
  current: 95,
  total: 100,
  percentage: 95,
  message: 'switching-active-version',
};

function setupRun(scenario: Scenario) {
  const emitted: Emitted[] = [];
  const progressListeners = new Set<(progress: InstallProgress) => void>();

  const electronAPI = {
    onPackageInstallProgress: (callback: (progress: InstallProgress) => void) => {
      progressListeners.add(callback);
      return () => {
        progressListeners.delete(callback);
      };
    },
    installWebServicePackage: async (): Promise<InstallWebServicePackageResult> => {
      for (const progress of scenario.progressEvents) {
        progressListeners.forEach((listener) => listener(progress));
      }
      if (scenario.forceNullProgress) {
        store.dispatch(setInstallProgress(null));
      }
      if (scenario.outcome === 'throw') {
        throw new Error('install transport failed');
      }
      return {
        success: scenario.outcome === 'success',
        autoSwitched: false,
        activeVersionId: null,
      };
    },
    checkPackageInstallation: async () => ({ installed: true, version: '1.2.3' }),
    getWebServiceVersion: async () => '1.2.3',
    versionGetActive: async () => null,
    cloudTelemetry: {
      event: async (name: string, properties: Record<string, unknown>) => {
        emitted.push({ name, properties });
      },
    },
  };

  (globalThis as { window?: unknown }).window = { electronAPI };

  const store = configureStore({ reducer: { webService: webServiceReducer } });
  // Mirrors the store wiring in src/renderer/store/index.ts: IPC progress is dispatched into Redux.
  electronAPI.onPackageInstallProgress((progress) => {
    store.dispatch(setInstallProgress({
      ...progress,
      percentage: typeof progress.percentage === 'number' ? progress.percentage : 0,
      message: progress.message || progress.stage,
    }));
  });

  return { store, emitted };
}

function versionInstallEvents(emitted: Emitted[]): Emitted[] {
  return emitted.filter((entry) => entry.name === 'version_install_finished');
}

describe('installWebServicePackage version_install_finished telemetry', () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = undefined;
  });

  after(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  const cases: Array<{ name: string; scenario: Scenario; expectedStatus: string; expectedMode: string }> = [
    {
      name: 'success with normal progress state',
      scenario: { outcome: 'success', forceNullProgress: false, progressEvents: [httpDirectProgress, httpDirectVerifying] },
      expectedStatus: 'success',
      expectedMode: 'http-direct',
    },
    {
      name: 'failure with normal progress state',
      scenario: { outcome: 'failure', forceNullProgress: false, progressEvents: [httpDirectProgress] },
      expectedStatus: 'failure',
      expectedMode: 'http-direct',
    },
    {
      name: 'thrown error with normal progress state',
      scenario: { outcome: 'throw', forceNullProgress: false, progressEvents: [httpDirectProgress] },
      expectedStatus: 'failure',
      expectedMode: 'http-direct',
    },
    {
      name: 'success when installProgress is null at outcome',
      scenario: { outcome: 'success', forceNullProgress: true, progressEvents: [httpDirectProgress] },
      expectedStatus: 'success',
      expectedMode: 'http-direct',
    },
    {
      name: 'failure when installProgress is null at outcome',
      scenario: { outcome: 'failure', forceNullProgress: true, progressEvents: [httpDirectProgress] },
      expectedStatus: 'failure',
      expectedMode: 'http-direct',
    },
    {
      name: 'thrown error when installProgress is null at outcome',
      scenario: { outcome: 'throw', forceNullProgress: true, progressEvents: [httpDirectProgress] },
      expectedStatus: 'failure',
      expectedMode: 'http-direct',
    },
    {
      name: 'source-fallback download followed by a switching event reports source-fallback',
      scenario: {
        outcome: 'success',
        forceNullProgress: false,
        progressEvents: [sourceFallbackProgress, switchingProgress],
      },
      expectedStatus: 'success',
      expectedMode: 'source-fallback',
    },
  ];

  for (const testCase of cases) {
    it(`emits exactly one version_install_finished: ${testCase.name}`, async () => {
      const { store, emitted } = setupRun(testCase.scenario);

      await store.dispatch(thunks.installWebServicePackage('1.2.3'));

      const finished = versionInstallEvents(emitted);
      assert.equal(finished.length, 1, `expected one version_install_finished, got ${finished.length}`);
      assert.equal(finished[0].properties.status, testCase.expectedStatus);
      assert.equal(finished[0].properties.mode, testCase.expectedMode);
      assert.equal(typeof finished[0].properties.duration, 'number');
    });
  }
});
