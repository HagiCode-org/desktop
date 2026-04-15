import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import yaml from 'js-yaml';
import {
  ConfigManager as DesktopConfigManager,
  DEFAULT_MANAGED_WEB_TELEMETRY_SETTINGS,
} from '../config.js';
import { ConfigManager as YamlConfigManager } from '../config-manager.js';
import { setManagedWebTelemetryPayload } from '../managed-web-telemetry.js';

const tempDirectories: string[] = [];
const mainProcessPath = path.resolve(process.cwd(), 'src/main/main.ts');
const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

class MockStore {
  private data: Record<string, unknown>;

  constructor(initial: Record<string, unknown> = {}) {
    this.data = { ...initial };
  }

  get<T>(key: string): T {
    return this.data[key] as T;
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
  }

  delete(key: string): void {
    delete this.data[key];
  }

  clear(): void {
    this.data = {};
  }

  get store(): Record<string, unknown> {
    return this.data;
  }
}

function createPathManagerLike(root: string) {
  const appsInstalled = path.join(root, 'apps', 'installed');

  return {
    getPaths: () => ({ appsInstalled }),
    getAppSettingsPath: (versionId: string) => path.join(appsInstalled, versionId, 'config', 'appsettings.yml'),
  };
}

describe('managed Web telemetry settings', () => {
  it('uses backend-aligned defaults and persists the local cached preference', () => {
    const store = new MockStore();
    const manager = new DesktopConfigManager(store as never);

    assert.deepEqual(manager.getManagedWebTelemetrySettings(), DEFAULT_MANAGED_WEB_TELEMETRY_SETTINGS);

    const saved = manager.setManagedWebTelemetrySettings({
      enabled: false,
      endpoint: '  http://collector.internal:4317  ',
    });

    assert.deepEqual(saved, {
      ...DEFAULT_MANAGED_WEB_TELEMETRY_SETTINGS,
      enabled: false,
      endpoint: 'http://collector.internal:4317',
    });
    assert.deepEqual(manager.getManagedWebTelemetrySettings(), saved);
  });

  it('synchronizes telemetry values across installed versions without overwriting unrelated OTLP settings', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-desktop-telemetry-'));
    tempDirectories.push(tempRoot);
    const pathManager = createPathManagerLike(tempRoot);
    const manager = new YamlConfigManager(pathManager as never);
    const versionIds = ['hagicode-1.0.0-linux-x64-nort', 'hagicode-1.0.1-linux-x64-nort'];

    await Promise.all(versionIds.map(async (versionId) => {
      const configPath = pathManager.getAppSettingsPath(versionId);
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, yaml.dump({
        Telemetry: {
          Enabled: true,
          EnableTracing: true,
          EnableMetrics: true,
          Otlp: {
            Enabled: false,
            Endpoint: '',
            Headers: 'authorization=keep-me',
            Protocol: 'grpc',
            TimeoutMilliseconds: 10000,
          },
        },
      }), 'utf8');
    }));

    const result = await manager.updateAllTelemetrySettings({
      ...DEFAULT_MANAGED_WEB_TELEMETRY_SETTINGS,
      enabled: false,
      endpoint: 'http://collector.internal:4317',
    });

    assert.equal(result.state, 'synced');
    assert.deepEqual(result.syncedVersionIds, versionIds);
    assert.deepEqual(result.unsyncedVersionIds, []);

    const updatedConfig = yaml.load(
      await fs.readFile(pathManager.getAppSettingsPath(versionIds[0]), 'utf8'),
    ) as Record<string, any>;
    assert.equal(updatedConfig.Telemetry.Enabled, false);
    assert.equal(updatedConfig.Telemetry.EnableTracing, true);
    assert.equal(updatedConfig.Telemetry.EnableMetrics, true);
    assert.equal(updatedConfig.Telemetry.Otlp.Endpoint, 'http://collector.internal:4317');
    assert.equal(updatedConfig.Telemetry.Otlp.Headers, 'authorization=keep-me');
    assert.equal(updatedConfig.Telemetry.Otlp.Protocol, 'grpc');
    assert.equal(updatedConfig.Telemetry.Otlp.TimeoutMilliseconds, 10000);
  });

  it('keeps the local cached preference when one installed version fails YAML synchronization and returns warning metadata', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-desktop-telemetry-partial-'));
    tempDirectories.push(tempRoot);
    const pathManager = createPathManagerLike(tempRoot);
    const yamlManager = new YamlConfigManager(pathManager as never);
    const store = new MockStore();
    const desktopManager = new DesktopConfigManager(store as never);
    const goodVersion = 'hagicode-1.0.0-linux-x64-nort';
    const brokenVersion = 'hagicode-1.0.1-linux-x64-nort';

    const goodConfigPath = pathManager.getAppSettingsPath(goodVersion);
    const brokenConfigPath = pathManager.getAppSettingsPath(brokenVersion);
    await fs.mkdir(path.dirname(goodConfigPath), { recursive: true });
    await fs.mkdir(path.dirname(brokenConfigPath), { recursive: true });
    await fs.writeFile(goodConfigPath, yaml.dump({ Telemetry: { Otlp: { Headers: 'keep' } } }), 'utf8');
    await fs.writeFile(brokenConfigPath, 'Telemetry: [\n', 'utf8');

    const result = await setManagedWebTelemetryPayload(
      {
        configManager: desktopManager,
        yamlConfigManager: yamlManager,
      },
      {
        enabled: false,
        endpoint: ' http://collector.internal:4317 ',
      },
    );

    assert.deepEqual(desktopManager.getManagedWebTelemetrySettings(), {
      ...DEFAULT_MANAGED_WEB_TELEMETRY_SETTINGS,
      enabled: false,
      endpoint: 'http://collector.internal:4317',
    });
    assert.equal(result.status.state, 'partial');
    assert.deepEqual(result.status.syncedVersionIds, [goodVersion]);
    assert.deepEqual(result.status.unsyncedVersionIds, [brokenVersion]);
    assert.deepEqual(result.warning, {
      code: 'partial-sync',
      failedVersionIds: [brokenVersion],
    });

    const syncedConfig = yaml.load(await fs.readFile(goodConfigPath, 'utf8')) as Record<string, any>;
    assert.equal(syncedConfig.Telemetry.Enabled, false);
    assert.equal(syncedConfig.Telemetry.Otlp.Endpoint, 'http://collector.internal:4317');
    assert.equal(syncedConfig.Telemetry.Otlp.Headers, 'keep');
  });

  it('registers telemetry IPC handlers in the main process and exposes the preload bridge', async () => {
    const [mainSource, preloadSource] = await Promise.all([
      fs.readFile(mainProcessPath, 'utf8'),
      fs.readFile(preloadPath, 'utf8'),
    ]);

    assert.match(mainSource, /ipcMain\.handle\('telemetry:get'/);
    assert.match(mainSource, /ipcMain\.handle\('telemetry:set'/);
    assert.match(preloadSource, /telemetry: ManagedWebTelemetryBridge;/);
    assert.match(preloadSource, /telemetry: \{\s*get: \(\) => ipcRenderer\.invoke\('telemetry:get'\),\s*set: \(settings\) => ipcRenderer\.invoke\('telemetry:set', settings\),\s*\},/s);
  });
});
