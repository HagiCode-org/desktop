import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { type VersionAutoUpdateSettings } from '../config.js';
import {
  createEmptyVersionUpdateSnapshot,
  type VersionUpdateSnapshot,
} from '../state-manager.js';
import { VersionUpdateManager, selectLatestCompatibleVersion } from '../version-update-manager.js';
import type { Version } from '../version-manager.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

class MemoryStateManager {
  snapshot: VersionUpdateSnapshot = createEmptyVersionUpdateSnapshot();

  async getVersionUpdateSnapshot(): Promise<VersionUpdateSnapshot> {
    return structuredClone(this.snapshot);
  }

  async setVersionUpdateSnapshot(snapshot: VersionUpdateSnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }
}

class MemoryConfigManager {
  settings: VersionAutoUpdateSettings = {
    enabled: true,
    retainedArchiveCount: 5,
  };

  getVersionAutoUpdateSettings(): VersionAutoUpdateSettings {
    return { ...this.settings };
  }

  setVersionAutoUpdateSettings(nextSettings: Partial<VersionAutoUpdateSettings>): VersionAutoUpdateSettings {
    this.settings = {
      ...this.settings,
      ...nextSettings,
    };
    return this.getVersionAutoUpdateSettings();
  }
}

function createVersion(version: string): Version {
  return {
    id: `hagicode-${version}-linux-x64-nort`,
    version,
    platform: 'linux-x64',
    packageFilename: `hagicode-${version}-linux-x64-nort.zip`,
    sourceType: 'http-index',
  };
}

describe('version update manager', () => {
  it('selects the newest compatible version above the current active version', () => {
    const selected = selectLatestCompatibleVersion([
      createVersion('1.0.1'),
      createVersion('1.2.0'),
      createVersion('1.1.5'),
    ], '1.0.0');

    assert.equal(selected?.version, '1.2.0');
  });

  it('skips predownloads in portable mode and returns a disabled snapshot', async () => {
    const stateManager = new MemoryStateManager();
    const configManager = new MemoryConfigManager();
    let predownloadCalls = 0;
    const manager = new VersionUpdateManager({
      stateManager,
      configManager,
      versionManager: {
        getActiveVersion: async () => ({
          id: 'active',
          version: '1.0.0',
          packageFilename: 'active.zip',
          platform: 'linux-x64',
        }) as any,
        getCurrentSourceConfig: () => ({ id: 'source-1' }) as any,
        isPortableVersionMode: () => true,
        listVersions: async () => [],
        predownloadVersion: async () => {
          predownloadCalls += 1;
          return { success: false } as any;
        },
      },
    });

    const snapshot = await manager.refreshSnapshot('test-portable');

    assert.equal(snapshot.status, 'disabled');
    assert.equal(snapshot.disabledReason, 'portable-mode');
    assert.equal(predownloadCalls, 0);
  });

  it('reuses a single refresh promise to prevent duplicate background downloads', async () => {
    const stateManager = new MemoryStateManager();
    const configManager = new MemoryConfigManager();
    let predownloadCalls = 0;
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-update-lock-'));
    tempDirectories.push(tempRoot);
    const archivePath = path.join(tempRoot, 'latest.zip');
    await fs.writeFile(archivePath, 'archive', 'utf8');

    const manager = new VersionUpdateManager({
      stateManager,
      configManager,
      versionManager: {
        getActiveVersion: async () => ({
          id: 'active',
          version: '1.0.0',
          packageFilename: 'active.zip',
          platform: 'linux-x64',
        }) as any,
        getCurrentSourceConfig: () => ({ id: 'source-1' }) as any,
        isPortableVersionMode: () => false,
        listVersions: async () => [createVersion('1.1.0')],
        predownloadVersion: async () => {
          predownloadCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return {
            success: true,
            version: createVersion('1.1.0'),
            cachePath: archivePath,
            fileSize: 7,
          } as any;
        },
      },
    });

    const [first, second] = await Promise.all([
      manager.refreshSnapshot('parallel-a'),
      manager.refreshSnapshot('parallel-b'),
    ]);

    assert.equal(predownloadCalls, 1);
    assert.equal(first.status, 'ready');
    assert.equal(second.downloadedVersionId, first.downloadedVersionId);
  });

  it('honors disabled settings before attempting a background refresh', async () => {
    const stateManager = new MemoryStateManager();
    const configManager = new MemoryConfigManager();
    configManager.settings.enabled = false;
    let listCalls = 0;
    const manager = new VersionUpdateManager({
      stateManager,
      configManager,
      versionManager: {
        getActiveVersion: async () => ({
          id: 'active',
          version: '1.0.0',
          packageFilename: 'active.zip',
          platform: 'linux-x64',
        }) as any,
        getCurrentSourceConfig: () => ({ id: 'source-1' }) as any,
        isPortableVersionMode: () => false,
        listVersions: async () => {
          listCalls += 1;
          return [createVersion('1.1.0')];
        },
        predownloadVersion: async () => ({ success: false } as any),
      },
    });

    const snapshot = await manager.refreshSnapshot('settings-disabled');

    assert.equal(snapshot.status, 'disabled');
    assert.equal(snapshot.disabledReason, 'settings-disabled');
    assert.equal(listCalls, 0);
  });

  it('cleans stale archive records and retains only the configured newest verified archives', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-update-retention-'));
    tempDirectories.push(tempRoot);
    const oldArchiveA = path.join(tempRoot, '1.0.1.zip');
    const oldArchiveB = path.join(tempRoot, '1.0.2.zip');
    const newArchive = path.join(tempRoot, '1.0.3.zip');
    await Promise.all([
      fs.writeFile(oldArchiveA, 'a', 'utf8'),
      fs.writeFile(oldArchiveB, 'b', 'utf8'),
      fs.writeFile(newArchive, 'c', 'utf8'),
    ]);

    const stateManager = new MemoryStateManager();
    stateManager.snapshot = {
      ...createEmptyVersionUpdateSnapshot(),
      cachedArchives: [
        {
          versionId: '1.0.1',
          version: '1.0.1',
          packageFilename: '1.0.1.zip',
          cachePath: oldArchiveA,
          retainedAt: '2026-04-01T00:00:00.000Z',
          verifiedAt: '2026-04-01T00:00:00.000Z',
          fileSize: 1,
        },
        {
          versionId: '1.0.2',
          version: '1.0.2',
          packageFilename: '1.0.2.zip',
          cachePath: oldArchiveB,
          retainedAt: '2026-04-02T00:00:00.000Z',
          verifiedAt: '2026-04-02T00:00:00.000Z',
          fileSize: 1,
        },
        {
          versionId: 'missing',
          version: '0.9.9',
          packageFilename: 'missing.zip',
          cachePath: path.join(tempRoot, 'missing.zip'),
          retainedAt: '2026-03-30T00:00:00.000Z',
          verifiedAt: '2026-03-30T00:00:00.000Z',
          fileSize: 1,
        },
      ],
    };

    const configManager = new MemoryConfigManager();
    configManager.settings.retainedArchiveCount = 2;
    const manager = new VersionUpdateManager({
      stateManager,
      configManager,
      versionManager: {
        getActiveVersion: async () => ({
          id: 'active',
          version: '1.0.0',
          packageFilename: 'active.zip',
          platform: 'linux-x64',
        }) as any,
        getCurrentSourceConfig: () => ({ id: 'source-1' }) as any,
        isPortableVersionMode: () => false,
        listVersions: async () => [createVersion('1.0.3')],
        predownloadVersion: async () => ({
          success: true,
          version: createVersion('1.0.3'),
          cachePath: newArchive,
          fileSize: 1,
        } as any),
      },
    });

    const snapshot = await manager.refreshSnapshot('retention');

    assert.equal(snapshot.status, 'ready');
    assert.deepEqual(snapshot.cachedArchives.map((archive) => archive.version).sort(), ['1.0.2', '1.0.3']);
    await assert.rejects(() => fs.access(oldArchiveA));
  });
});
