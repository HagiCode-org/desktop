import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PackageSourceConfigManager } from '../package-source-config-manager.js';
import { OFFICIAL_SERVER_HTTP_INDEX_URL } from '../../shared/package-source-defaults.js';

class MockStore {
  private data: Record<string, unknown>;

  constructor(initial: Record<string, unknown> = {}) {
    this.data = {
      sources: [],
      activeSourceId: null,
      defaultSourceId: null,
      ...initial,
    };
  }

  get<T>(key: string, defaultValue?: T): T {
    return (key in this.data ? this.data[key] : defaultValue) as T;
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
  }
}

const packageSourceContractPath = path.resolve(process.cwd(), 'src/main/package-sources/package-source.ts');
const versionManagerPath = path.resolve(process.cwd(), 'src/main/version-manager.ts');
const packageSourceHandlersPath = path.resolve(process.cwd(), 'src/main/ipc/handlers/packageSourceHandlers.ts');
const mainProcessEntryPath = path.resolve(process.cwd(), 'src/main/main.ts');
const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('package source github-release removal', () => {
  it('migrates a legacy github-release active source to an existing http-index source', () => {
    const store = new MockStore({
      sources: [
        {
          id: 'legacy-github',
          type: 'github-release',
          owner: 'HagiCode-org',
          repo: 'releases',
          createdAt: '2026-03-01T00:00:00.000Z',
        },
        {
          id: 'official-http',
          type: 'http-index',
          name: 'Official HTTP Index',
          indexUrl: OFFICIAL_SERVER_HTTP_INDEX_URL,
          createdAt: '2026-03-02T00:00:00.000Z',
        },
      ],
      activeSourceId: 'legacy-github',
      defaultSourceId: 'legacy-github',
    });

    const manager = new PackageSourceConfigManager(store as never);
    const sources = manager.getAllSources();

    assert.equal(sources.some(source => (source as { type?: string }).type === 'github-release'), false);
    assert.equal(sources.filter(source => source.type === 'http-index').length, 1);
    assert.equal(manager.getActiveSource()?.id, 'official-http');
    assert.equal(manager.getDefaultSource()?.id, 'official-http');
  });

  it('creates a default http-index source when only legacy github-release config exists', () => {
    const store = new MockStore({
      sources: [
        {
          id: 'legacy-github',
          type: 'github-release',
          owner: 'HagiCode-org',
          repo: 'releases',
          createdAt: '2026-03-01T00:00:00.000Z',
        },
      ],
      activeSourceId: 'legacy-github',
      defaultSourceId: 'legacy-github',
    });

    const manager = new PackageSourceConfigManager(store as never);
    const sources = manager.getAllSources();

    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.type, 'http-index');
    assert.equal(sources[0]?.indexUrl, OFFICIAL_SERVER_HTTP_INDEX_URL);
    assert.equal(manager.getActiveSource()?.type, 'http-index');
    assert.equal(manager.getDefaultSource()?.type, 'http-index');
  });

  it('falls back to the default http-index source when UPDATE_SOURCE_OVERRIDE still uses github-release', () => {
    const previousOverride = process.env.UPDATE_SOURCE_OVERRIDE;
    process.env.UPDATE_SOURCE_OVERRIDE = JSON.stringify({
      type: 'github-release',
      owner: 'HagiCode-org',
      repo: 'releases',
    });

    try {
      const manager = new PackageSourceConfigManager(new MockStore() as never);
      const source = manager.getActiveSource();

      assert.equal(source?.type, 'http-index');
      assert.equal(source?.indexUrl, OFFICIAL_SERVER_HTTP_INDEX_URL);
    } finally {
      if (previousOverride === undefined) {
        delete process.env.UPDATE_SOURCE_OVERRIDE;
      } else {
        process.env.UPDATE_SOURCE_OVERRIDE = previousOverride;
      }
    }
  });

  it('migrates the legacy official http-index URL to the new official server index URL', () => {
    const store = new MockStore({
      sources: [
        {
          id: 'legacy-official-http',
          type: 'http-index',
          name: 'HagiCode 官方源',
          indexUrl: 'https://server.dl.hagicode.com/index.json',
          createdAt: '2026-03-01T00:00:00.000Z',
        },
      ],
      activeSourceId: 'legacy-official-http',
      defaultSourceId: 'legacy-official-http',
    });

    const manager = new PackageSourceConfigManager(store as never);
    const source = manager.getActiveSource();

    assert.equal(source?.type, 'http-index');
    assert.equal(source?.indexUrl, OFFICIAL_SERVER_HTTP_INDEX_URL);
    assert.equal(manager.getDefaultSource()?.indexUrl, OFFICIAL_SERVER_HTTP_INDEX_URL);
  });

  it('removes github package source contracts and IPC bridges from the main/preload surfaces', async () => {
    const [contractSource, versionManagerSource, handlerSource, mainSource, preloadSource] = await Promise.all([
      fs.readFile(packageSourceContractPath, 'utf8'),
      fs.readFile(versionManagerPath, 'utf8'),
      fs.readFile(packageSourceHandlersPath, 'utf8'),
      fs.readFile(mainProcessEntryPath, 'utf8'),
      fs.readFile(preloadPath, 'utf8'),
    ]);

    assert.doesNotMatch(contractSource, /GitHubReleaseConfig/);
    assert.match(versionManagerSource, /ensureSupportedSourceType/);
    assert.match(versionManagerSource, /is no longer supported\. Use http-index or local-folder instead\./);
    assert.doesNotMatch(versionManagerSource, /config\.type === 'github-release'/);
    assert.doesNotMatch(handlerSource, /fetch-github/);
    assert.match(mainSource, /registerPackageSourceHandlers\(/);
    assert.doesNotMatch(mainSource, /package-source:fetch-github/);
    assert.doesNotMatch(preloadSource, /fetchGithub/);
  });
});
