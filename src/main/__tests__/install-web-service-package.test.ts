import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// @ts-ignore Node's test runner executes the source TypeScript module directly in this package.
import { installWebServicePackageWithAutoSwitch } from '../install-web-service-package.ts';

interface HarnessOptions {
  serviceStatus?: 'running' | 'stopped';
  initialActiveVersionId?: string | null;
  switchResult?: { success: boolean; error?: string };
}

function createHarness(options: HarnessOptions = {}) {
  const sentEvents: Array<{ channel: string; payload: unknown }> = [];
  const runtimeUpdates: unknown[] = [];
  const snapshotReasons: string[] = [];
  const switchCalls: string[] = [];
  const versionId = '2.0.0';
  let installed = false;
  let activeVersionId = options.initialActiveVersionId ?? '1.0.0';

  const mainWindow = {
    webContents: {
      send: (channel: string, payload: unknown) => {
        sentEvents.push({ channel, payload });
      },
    },
  };

  const deps = {
    versionManager: {
      getInstalledVersions: async () => {
        const versions = [{ id: '1.0.0' }];
        if (installed) {
          versions.unshift({ id: versionId });
        }
        return versions;
      },
      installVersion: async () => {
        installed = true;
        return { success: true };
      },
      reinstallVersion: async () => {
        installed = true;
        return { success: true };
      },
      switchVersion: async (nextVersionId: string) => {
        switchCalls.push(nextVersionId);
        const switchResult = options.switchResult ?? { success: true };
        if (switchResult.success) {
          activeVersionId = nextVersionId;
          mainWindow.webContents.send('version:activeVersionChanged', { id: nextVersionId });
        }
        return switchResult;
      },
      getActiveVersion: async () => (activeVersionId ? { id: activeVersionId } : null),
      getActiveRuntimeDescriptor: async () => (
        activeVersionId
          ? {
              kind: 'installed-version' as const,
              rootPath: `/fake/${activeVersionId}`,
              versionId: activeVersionId,
              versionLabel: activeVersionId,
              displayName: `Version ${activeVersionId}`,
              isReadOnly: false,
            }
          : null
      ),
    },
    webServiceManager: {
      getStatus: async () => ({ status: options.serviceStatus ?? 'stopped' }),
      setActiveRuntime: (runtime: unknown) => {
        runtimeUpdates.push(runtime);
      },
    },
    mainWindow,
    refreshVersionUpdateSnapshot: async (reason: string) => {
      snapshotReasons.push(reason);
    },
  };

  return {
    deps,
    sentEvents,
    runtimeUpdates,
    snapshotReasons,
    switchCalls,
    versionId,
  };
}

describe('install web service package orchestration', () => {
  it('auto-switches the installed version when the service is idle', async () => {
    const harness = createHarness({ serviceStatus: 'stopped' });

    const result = await installWebServicePackageWithAutoSwitch(
      harness.deps,
      harness.versionId,
      { autoSwitchWhenIdle: true },
    );

    assert.deepEqual(result, {
      success: true,
      autoSwitched: true,
      activeVersionId: harness.versionId,
    });
    assert.equal(harness.runtimeUpdates.length, 2);
    assert.deepEqual(harness.snapshotReasons, ['web-service-package-installed']);

    const installedIndex = harness.sentEvents.findIndex((event) => event.channel === 'version:installedVersionsChanged');
    const activeIndex = harness.sentEvents.findIndex((event) => event.channel === 'version:activeVersionChanged');
    assert.ok(installedIndex >= 0);
    assert.ok(activeIndex > installedIndex);
  });

  it('skips the automatic switch when the service is still running', async () => {
    const harness = createHarness({ serviceStatus: 'running' });

    const result = await installWebServicePackageWithAutoSwitch(
      harness.deps,
      harness.versionId,
      { autoSwitchWhenIdle: true },
    );

    assert.deepEqual(result, {
      success: true,
      autoSwitched: false,
      activeVersionId: '1.0.0',
    });
    assert.deepEqual(harness.switchCalls, []);
    assert.equal(
      harness.sentEvents.some((event) => event.channel === 'version:activeVersionChanged'),
      false,
    );
  });

  it('keeps the previous active version when automatic switch protections block the change', async () => {
    const harness = createHarness({
      serviceStatus: 'stopped',
      switchResult: {
        success: false,
        error: 'Package requires a newer Desktop version.',
      },
    });

    const result = await installWebServicePackageWithAutoSwitch(
      harness.deps,
      harness.versionId,
      { autoSwitchWhenIdle: true },
    );

    assert.deepEqual(result, {
      success: true,
      autoSwitched: false,
      activeVersionId: '1.0.0',
      switchError: 'Package requires a newer Desktop version.',
    });
    assert.deepEqual(harness.switchCalls, [harness.versionId]);
  });
});
