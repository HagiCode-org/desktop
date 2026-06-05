import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ConfigManager as DesktopConfigManager } from '../config.js';

const mainProcessPath = path.resolve(process.cwd(), 'src/main/main.ts');
const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

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
      dependencyManagementMode: 'external',
    });
    const manager = new DesktopConfigManager(store as never);

    assert.equal(store.get('telemetry'), undefined);
    assert.equal(store.get('remoteMode'), undefined);
    assert.deepEqual(manager.getVersionAutoUpdateSettings(), {
      enabled: false,
      retainedArchiveCount: 9,
    });
    assert.equal(manager.getDependencyManagementMode(), 'external');
    assert.equal(manager.setDependencyManagementMode('internal'), 'internal');
    assert.equal(manager.getDependencyManagementMode(), 'internal');
    assert.equal('telemetry' in manager.getAll(), false);
    assert.equal('remoteMode' in manager.getAll(), false);
  });

  it('forces dependency management mode external on first Win Store launch and keeps standard runs internal by default', () => {
    const firstRunStore = new MockStore();
    const firstRunManager = new DesktopConfigManager(firstRunStore as never);

    assert.equal(firstRunManager.getDependencyManagementMode(true), 'external');
    assert.equal(firstRunStore.get('dependencyManagementMode'), 'external');
    assert.equal(firstRunManager.getRuntimeDataPathPreset(), 'userData-runtime-data');
    assert.equal(firstRunStore.get('runtimeDataPath'), 'userData-runtime-data');
    assert.equal(firstRunManager.getDependencyManagementMode(false), 'external');

    const existingStore = new MockStore({
      dependencyManagementMode: 'internal',
    });
    const existingManager = new DesktopConfigManager(existingStore as never);

    assert.equal(existingManager.getDependencyManagementMode(true), 'external');
    assert.equal(existingStore.get('dependencyManagementMode'), 'external');
    assert.equal(existingManager.setDependencyManagementMode('internal', true), 'external');
    assert.equal(existingStore.get('dependencyManagementMode'), 'external');

    const nonWinStoreStore = new MockStore();
    const nonWinStoreManager = new DesktopConfigManager(nonWinStoreStore as never);

    assert.equal(nonWinStoreManager.getDependencyManagementMode(false), 'internal');
    assert.equal(nonWinStoreStore.get('dependencyManagementMode'), 'internal');
  });

  it('normalizes persisted runtime data path presets and keeps the supported values stable', () => {
    const invalidStore = new MockStore({
      runtimeDataPath: 'custom-folder',
    });
    const invalidManager = new DesktopConfigManager(invalidStore as never);

    assert.equal(invalidManager.getRuntimeDataPathPreset(), 'userData-runtime-data');
    assert.equal(invalidStore.get('runtimeDataPath'), 'userData-runtime-data');
    assert.equal(invalidManager.setRuntimeDataPathPreset('home-runtime-data'), 'home-runtime-data');
    assert.equal(invalidManager.getRuntimeDataPathPreset(), 'home-runtime-data');
  });

  it('omits retired telemetry and remote-mode IPC handlers and preload bridge exposure from the runtime', async () => {
    const [mainSource, preloadSource] = await Promise.all([
      fs.readFile(mainProcessPath, 'utf8'),
      fs.readFile(preloadPath, 'utf8'),
    ]);

    assert.equal(mainSource.includes("ipcMain.handle('telemetry:get'"), false);
    assert.equal(mainSource.includes("ipcMain.handle('telemetry:set'"), false);
    assert.equal(preloadSource.includes('telemetry:'), false);
    assert.equal(preloadSource.includes("ipcRenderer.invoke('telemetry:get')"), false);
    assert.equal(preloadSource.includes("ipcRenderer.invoke('telemetry:set')"), false);
    assert.equal(mainSource.includes("ipcMain.handle('remote-mode:set'"), false);
    assert.equal(mainSource.includes("ipcMain.handle('remote-mode:get'"), false);
    assert.equal(mainSource.includes("ipcMain.handle('remote-mode:validate-url'"), false);
    assert.equal(preloadSource.includes('remoteMode:'), false);
    assert.equal(preloadSource.includes("ipcRenderer.invoke('remote-mode:set')"), false);
    assert.equal(preloadSource.includes("ipcRenderer.invoke('remote-mode:get')"), false);
    assert.equal(preloadSource.includes("ipcRenderer.invoke('remote-mode:validate-url')"), false);
  });
});
