import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PackageSourceConfigManager } from '../package-source-config-manager.js';
import {
  OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
  OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL,
} from '../../shared/package-source-defaults.js';

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

describe('official regional package sources', () => {
  it('initializes mainland and international sources with mainland active and default', () => {
    const manager = new PackageSourceConfigManager(new MockStore() as never);
    const sources = manager.getAllSources();

    assert.deepEqual(
      sources.filter(source => source.type === 'http-index').map(source => source.indexUrl),
      [OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL, OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL],
    );
    assert.equal(manager.getActiveSource()?.indexUrl, OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL);
    assert.equal(manager.getDefaultSource()?.indexUrl, OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL);
  });

  it('adds missing official sources on upgrade without changing saved IDs or custom sources', () => {
    const mainland = {
      id: 'saved-mainland',
      type: 'http-index' as const,
      name: 'Existing official source',
      indexUrl: OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const custom = {
      id: 'custom-source',
      type: 'local-folder' as const,
      name: 'Custom packages',
      path: '/packages',
      createdAt: '2026-01-02T00:00:00.000Z',
    };
    const store = new MockStore({
      sources: [mainland, custom],
      activeSourceId: custom.id,
      defaultSourceId: mainland.id,
    });
    const manager = new PackageSourceConfigManager(store as never);

    assert.equal(manager.getActiveSource()?.id, custom.id);
    assert.equal(manager.getDefaultSource()?.id, mainland.id);
    assert.deepEqual(manager.getAllSources().find(source => source.id === mainland.id), mainland);
    assert.equal(manager.getAllSources().some(source => source.id === custom.id), true);
    assert.equal(
      manager.getAllSources().filter(source => source.indexUrl === OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL).length,
      1,
    );
  });

  it('does not duplicate sources during repeated initialization', () => {
    const store = new MockStore();
    new PackageSourceConfigManager(store as never);
    const manager = new PackageSourceConfigManager(store as never);

    assert.equal(manager.getAllSources().length, 2);
  });

  it('does not restore an official source removed after seeding and restart', () => {
    const store = new MockStore();
    const manager = new PackageSourceConfigManager(store as never);
    const international = manager.getAllSources().find(
      source => source.indexUrl === OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
    );

    assert.ok(international);
    assert.equal(manager.removeSource(international.id), true);

    const restartedManager = new PackageSourceConfigManager(store as never);
    assert.equal(
      restartedManager.getAllSources().some(source => source.indexUrl === OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL),
      false,
    );
  });

  it('does not recreate defaults after all package sources are deliberately removed', () => {
    const store = new MockStore();
    const manager = new PackageSourceConfigManager(store as never);

    for (const source of manager.getAllSources()) {
      assert.equal(manager.removeSource(source.id), true);
    }

    const restartedManager = new PackageSourceConfigManager(store as never);
    assert.deepEqual(restartedManager.getAllSources(), []);
  });

  it('selects the international source through the existing source manager path', () => {
    const manager = new PackageSourceConfigManager(new MockStore() as never);
    const international = manager.getAllSources().find(
      source => source.indexUrl === OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
    );

    assert.ok(international);
    assert.equal(manager.setActiveSource(international.id), true);
    assert.equal(manager.getActiveSource()?.indexUrl, OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL);
  });

  it('recreates only the explicitly requested official source after it was removed', () => {
    const manager = new PackageSourceConfigManager(new MockStore() as never);
    const international = manager.getAllSources().find(
      source => source.indexUrl === OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
    );

    assert.ok(international);
    assert.equal(manager.removeSource(international.id), true);

    const recreated = manager.getOrCreateOfficialSource('INTERNATIONAL');
    assert.equal(recreated.indexUrl, OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL);
    assert.equal(manager.getAllSources().filter(
      source => source.indexUrl === OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
    ).length, 1);
  });

  it('does not match another official index when the requested index is missing', () => {
    const manager = new PackageSourceConfigManager(new MockStore() as never);
    const international = manager.getAllSources().find(
      source => source.indexUrl === OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
    );

    assert.ok(international);
    assert.equal(manager.removeSource(international.id), true);
    assert.equal(manager.findSourceForConfig({
      type: 'http-index',
      indexUrl: OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
    }), null);
    assert.equal(manager.findSourceForConfig({
      type: 'http-index',
      indexUrl: OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL,
    })?.indexUrl, OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL);
  });

  it('keeps environment overrides active while seeding both official choices', () => {
    const previousOverride = process.env.UPDATE_SOURCE_OVERRIDE;
    process.env.UPDATE_SOURCE_OVERRIDE = JSON.stringify({
      type: 'local-folder',
      name: 'Environment packages',
      path: '/override-packages',
    });

    try {
      const manager = new PackageSourceConfigManager(new MockStore() as never);

      assert.equal(manager.getActiveSource()?.name, 'Environment packages');
      assert.equal(manager.getAllSources().length, 3);
      assert.equal(
        manager.getAllSources().some(source => source.indexUrl === OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL),
        true,
      );
    } finally {
      if (previousOverride === undefined) {
        delete process.env.UPDATE_SOURCE_OVERRIDE;
      } else {
        process.env.UPDATE_SOURCE_OVERRIDE = previousOverride;
      }
    }
  });
});
