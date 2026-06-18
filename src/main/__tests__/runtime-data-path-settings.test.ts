import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { createRuntimeDataPathSettingsSnapshot, saveRuntimeDataPathPreset } from '../runtime-data-path-settings.js';
import { resolveDesktopCanonicalRuntimeDataRoot } from '../runtime-data-root.js';
import type { StartResult } from '../manifest-reader.js';
import type { RuntimeDataPathPreset } from '../../types/runtime-data-path.js';

class MockConfigManager {
  constructor(private preset: RuntimeDataPathPreset = 'userData-runtime-data') {}

  getRuntimeDataPathPreset(): RuntimeDataPathPreset {
    return this.preset;
  }

  setRuntimeDataPathPreset(preset: RuntimeDataPathPreset): RuntimeDataPathPreset {
    this.preset = preset;
    return preset;
  }
}

class MockPathManager {
  public refreshCalls = 0;
  private runtimeDataRoot: string;

  constructor(
    private readonly configManager: MockConfigManager,
    private readonly userDataPath: string = path.join('/tmp', 'hagicode-user-data'),
  ) {
    this.runtimeDataRoot = resolveDesktopCanonicalRuntimeDataRoot({
      preset: this.configManager.getRuntimeDataPathPreset(),
      userDataPath: this.userDataPath,
      overrideRoot: process.env.HAGICODE_RUNTIME_DATA_HOME,
    });
  }

  getUserDataPath(): string {
    return this.userDataPath;
  }

  getRuntimeDataHome(): string {
    return this.runtimeDataRoot;
  }

  refreshRuntimeDataPaths() {
    this.refreshCalls += 1;
    this.runtimeDataRoot = resolveDesktopCanonicalRuntimeDataRoot({
      preset: this.configManager.getRuntimeDataPathPreset(),
      userDataPath: this.userDataPath,
      overrideRoot: process.env.HAGICODE_RUNTIME_DATA_HOME,
    });
    return {
      runtimeDataRoot: this.runtimeDataRoot,
    };
  }
}

class MockWebServiceManager {
  public stopCalls = 0;
  public startCalls = 0;

  constructor(
    private status: 'running' | 'stopped' = 'stopped',
    private readonly stopResult: boolean = true,
    private readonly startResult: StartResult = createStartResult(true),
  ) {}

  async getStatus() {
    return {
      status: this.status,
      uptime: 0,
      startTime: null,
      url: this.status === 'running' ? 'http://127.0.0.1:36546' : null,
      restartCount: 0,
      phase: this.status === 'running' ? 'running' : 'idle',
      host: '127.0.0.1',
      port: 36546,
    };
  }

  async stop(): Promise<boolean> {
    this.stopCalls += 1;
    if (this.stopResult) {
      this.status = 'stopped';
    }
    return this.stopResult;
  }

  async start(): Promise<StartResult> {
    this.startCalls += 1;
    if (this.startResult.success) {
      this.status = 'running';
    }
    return this.startResult;
  }
}

function createStartResult(success: boolean, errorMessage = 'restart failed'): StartResult {
  return {
    success,
    resultSession: {
      exitCode: success ? 0 : 1,
      stdout: success ? 'ok' : '',
      stderr: success ? '' : errorMessage,
      duration: 0,
      timestamp: '2026-06-04T00:00:00.000Z',
      success,
    },
    parsedResult: success
      ? {
          success: true,
          rawOutput: 'ok',
          url: 'http://127.0.0.1:36546',
          port: 36546,
        }
      : {
          success: false,
          errorMessage,
          rawOutput: errorMessage,
        },
  };
}

const originalRuntimeDataHome = process.env.HAGICODE_RUNTIME_DATA_HOME;

afterEach(() => {
  if (originalRuntimeDataHome === undefined) {
    delete process.env.HAGICODE_RUNTIME_DATA_HOME;
  } else {
    process.env.HAGICODE_RUNTIME_DATA_HOME = originalRuntimeDataHome;
  }
});

describe('runtime data path settings', () => {
  it('builds snapshots from the configured preset and current effective root', () => {
    process.env.HAGICODE_RUNTIME_DATA_HOME = ' /tmp/runtime-override ';
    const configManager = new MockConfigManager('home-runtime-data');
    const pathManager = new MockPathManager(configManager, '/tmp/electron-user-data');
    pathManager.refreshRuntimeDataPaths();

    const snapshot = createRuntimeDataPathSettingsSnapshot(configManager, pathManager);

    assert.equal(snapshot.configuredPreset, 'home-runtime-data');
    assert.equal(snapshot.configuredRoot.logicalPath, path.join(homedir(), '.hagicode', 'runtime-data'));
    assert.equal(snapshot.configuredRoot.displayPath, path.join(homedir(), '.hagicode', 'runtime-data'));
    assert.equal(snapshot.effectiveRoot.logicalPath, path.resolve('/tmp/runtime-override'));
    assert.equal(snapshot.effectiveRoot.displayPath, path.resolve('/tmp/runtime-override'));
    assert.equal(snapshot.environmentOverrideActive, true);
    assert.equal(snapshot.environmentOverride?.logicalPath, path.resolve('/tmp/runtime-override'));
  });

  it('keeps unchanged saves side-effect free', async () => {
    delete process.env.HAGICODE_RUNTIME_DATA_HOME;
    const configManager = new MockConfigManager('userData-runtime-data');
    const pathManager = new MockPathManager(configManager, '/tmp/electron-user-data');
    const webServiceManager = new MockWebServiceManager('running');

    const result = await saveRuntimeDataPathPreset({
      preset: 'userData-runtime-data',
      configManager,
      pathManager,
      webServiceManager,
    });

    assert.equal(result.status, 'unchanged');
    assert.equal(pathManager.refreshCalls, 0);
    assert.equal(webServiceManager.stopCalls, 0);
    assert.equal(webServiceManager.startCalls, 0);
  });

  it('refreshes in-process paths immediately when no managed service restart is needed', async () => {
    delete process.env.HAGICODE_RUNTIME_DATA_HOME;
    const configManager = new MockConfigManager('userData-runtime-data');
    const pathManager = new MockPathManager(configManager, '/tmp/electron-user-data');

    const result = await saveRuntimeDataPathPreset({
      preset: 'home-runtime-data',
      configManager,
      pathManager,
    });

    assert.equal(result.status, 'restarted');
    assert.equal(result.restartAttempted, false);
    assert.equal(result.restartCompleted, false);
    assert.equal(pathManager.refreshCalls, 1);
    assert.equal(result.settings.effectiveRoot.logicalPath, path.join(homedir(), '.hagicode', 'runtime-data'));
  });

  it('stops running managed services before starting them again on the new preset', async () => {
    delete process.env.HAGICODE_RUNTIME_DATA_HOME;
    const configManager = new MockConfigManager('userData-runtime-data');
    const pathManager = new MockPathManager(configManager, '/tmp/electron-user-data');
    const webServiceManager = new MockWebServiceManager('running');

    const result = await saveRuntimeDataPathPreset({
      preset: 'home-runtime-data',
      configManager,
      pathManager,
      webServiceManager,
    });

    assert.equal(result.status, 'restarted');
    assert.equal(result.restartAttempted, true);
    assert.equal(result.restartCompleted, true);
    assert.equal(webServiceManager.stopCalls, 1);
    assert.equal(webServiceManager.startCalls, 1);
    assert.equal(pathManager.refreshCalls, 1);
    assert.equal(result.settings.effectiveRoot.logicalPath, path.join(homedir(), '.hagicode', 'runtime-data'));
  });

  it('reports stop failures without switching the effective in-process root', async () => {
    delete process.env.HAGICODE_RUNTIME_DATA_HOME;
    const configManager = new MockConfigManager('userData-runtime-data');
    const pathManager = new MockPathManager(configManager, '/tmp/electron-user-data');
    const webServiceManager = new MockWebServiceManager('running', false);

    const result = await saveRuntimeDataPathPreset({
      preset: 'home-runtime-data',
      configManager,
      pathManager,
      webServiceManager,
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.restartAttempted, true);
    assert.equal(result.restartCompleted, false);
    assert.equal(pathManager.refreshCalls, 0);
    assert.match(result.error ?? '', /Failed to stop the running managed service/);
    assert.equal(
      result.settings.effectiveRoot.logicalPath,
      path.join('/tmp/electron-user-data', 'runtime-data'),
    );
  });

  it('resolves display paths to the package-private physical location when Microsoft Store virtualization is active', () => {
    delete process.env.HAGICODE_RUNTIME_DATA_HOME;
    const configManager = new MockConfigManager('userData-runtime-data');
    const pathManager = new MockPathManager(
      configManager,
      'C:\\Users\\Tester\\AppData\\Roaming\\Hagicode Desktop',
    );

    const snapshot = createRuntimeDataPathSettingsSnapshot(configManager, pathManager, {
      isWindowsStore: true,
      pathDisplay: {
        platform: 'win32',
        execPath: 'C:\\Program Files\\WindowsApps\\newbe36524.Hagicode_0.1.0.0_x64__8wekyb3d8bbwe\\Hagicode Desktop.exe',
        env: {
          LOCALAPPDATA: 'C:\\Users\\Tester\\AppData\\Local',
          APPDATA: 'C:\\Users\\Tester\\AppData\\Roaming',
        },
      },
    });

    assert.equal(
      snapshot.configuredRoot.displayPath,
      'C:\\Users\\Tester\\AppData\\Local\\Packages\\newbe36524.Hagicode_8wekyb3d8bbwe\\LocalCache\\Roaming\\Hagicode Desktop\\runtime-data',
    );
    assert.equal(snapshot.configuredRoot.virtualizationKind, 'windows-store-appdata');
  });

  it('marks snapshot as locked when running in Microsoft Store mode', () => {
    delete process.env.HAGICODE_RUNTIME_DATA_HOME;
    const configManager = new MockConfigManager('userData-runtime-data');
    const pathManager = new MockPathManager(configManager, '/tmp/electron-user-data');

    const snapshot = createRuntimeDataPathSettingsSnapshot(configManager, pathManager, {
      isWindowsStore: true,
    });

    assert.equal(snapshot.lockedByRuntime, true);
    assert.match(snapshot.readOnlyReason ?? '', /Microsoft Store/);
  });

  it('does not lock snapshot when not in Microsoft Store mode', () => {
    delete process.env.HAGICODE_RUNTIME_DATA_HOME;
    const configManager = new MockConfigManager('userData-runtime-data');
    const pathManager = new MockPathManager(configManager, '/tmp/electron-user-data');

    const snapshot = createRuntimeDataPathSettingsSnapshot(configManager, pathManager);

    assert.equal(snapshot.lockedByRuntime, false);
    assert.equal(snapshot.readOnlyReason, undefined);
  });

  it('rejects save attempts when locked by Microsoft Store', async () => {
    delete process.env.HAGICODE_RUNTIME_DATA_HOME;
    const configManager = new MockConfigManager('userData-runtime-data');
    const pathManager = new MockPathManager(configManager, '/tmp/electron-user-data');

    await assert.rejects(
      saveRuntimeDataPathPreset({
        preset: 'home-runtime-data',
        configManager,
        pathManager,
        isWindowsStore: true,
      }),
      (error: Error) => {
        assert.match(error.message, /Microsoft Store/);
        return true;
      },
    );

    assert.equal(configManager.getRuntimeDataPathPreset(), 'userData-runtime-data');
  });
});
