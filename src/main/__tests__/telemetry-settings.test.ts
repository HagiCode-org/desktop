import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import yaml from 'js-yaml';
import { ConfigManager as DesktopConfigManager } from '../config.js';
import { ConfigManager as YamlConfigManager } from '../config-manager.js';

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

describe('desktop telemetry retirement', () => {
  it('removes legacy local telemetry data without affecting supported settings', () => {
    const store = new MockStore({
      telemetry: {
        enabled: false,
        endpoint: 'http://collector.internal:4317',
      },
      remoteMode: {
        enabled: true,
        url: 'https://remote.hagicode.test',
      },
      versionAutoUpdate: {
        enabled: false,
        retainedArchiveCount: 9,
      },
    });
    const manager = new DesktopConfigManager(store as never);

    assert.equal(store.get('telemetry'), undefined);
    assert.deepEqual(manager.get('remoteMode'), {
      enabled: true,
      url: 'https://remote.hagicode.test',
    });
    assert.deepEqual(manager.getVersionAutoUpdateSettings(), {
      enabled: false,
      retainedArchiveCount: 9,
    });
    assert.equal('telemetry' in manager.getAll(), false);
  });

  it('keeps existing Telemetry YAML blocks untouched while unrelated DataDir sync still works', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-desktop-config-'));
    tempDirectories.push(tempRoot);
    const pathManager = createPathManagerLike(tempRoot);
    const manager = new YamlConfigManager(pathManager as never);
    const versionId = 'hagicode-1.0.0-linux-x64-nort';
    const configPath = pathManager.getAppSettingsPath(versionId);

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, yaml.dump({
      SomeOtherSetting: true,
      Telemetry: {
        Enabled: true,
        EnableTracing: false,
        EnableMetrics: true,
        Otlp: {
          Endpoint: 'http://existing-collector:4317',
          Headers: 'authorization=keep-me',
        },
      },
    }), 'utf8');

    const updatedVersions = await manager.updateAllDataDirs('/tmp/hagicode-data');

    assert.deepEqual(updatedVersions, [versionId]);

    const updatedConfig = yaml.load(
      await fs.readFile(configPath, 'utf8'),
    ) as Record<string, any>;
    assert.equal(updatedConfig.DataDir, '/tmp/hagicode-data');
    assert.equal(updatedConfig.SomeOtherSetting, true);
    assert.equal(updatedConfig.Telemetry.Enabled, true);
    assert.equal(updatedConfig.Telemetry.EnableTracing, false);
    assert.equal(updatedConfig.Telemetry.EnableMetrics, true);
    assert.equal(updatedConfig.Telemetry.Otlp.Endpoint, 'http://existing-collector:4317');
    assert.equal(updatedConfig.Telemetry.Otlp.Headers, 'authorization=keep-me');
  });

  it('omits telemetry IPC handlers and preload bridge exposure from the runtime', async () => {
    const [mainSource, preloadSource] = await Promise.all([
      fs.readFile(mainProcessPath, 'utf8'),
      fs.readFile(preloadPath, 'utf8'),
    ]);

    assert.equal(mainSource.includes("ipcMain.handle('telemetry:get'"), false);
    assert.equal(mainSource.includes("ipcMain.handle('telemetry:set'"), false);
    assert.equal(preloadSource.includes('telemetry:'), false);
    assert.equal(preloadSource.includes("ipcRenderer.invoke('telemetry:get')"), false);
    assert.equal(preloadSource.includes("ipcRenderer.invoke('telemetry:set'"), false);
  });
});
