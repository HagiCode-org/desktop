import assert from 'node:assert/strict';
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

describe('package source validation', () => {
  it('rejects an empty local-folder source without mutating the active saved source', () => {
    const officialSource = {
      id: 'http-index-default',
      type: 'http-index' as const,
      name: 'Official',
      indexUrl: OFFICIAL_SERVER_HTTP_INDEX_URL,
      createdAt: '2026-04-11T00:00:00.000Z',
    };
    const store = new MockStore({
      sources: [officialSource],
      activeSourceId: officialSource.id,
      defaultSourceId: officialSource.id,
    });
    const manager = new PackageSourceConfigManager(store as never);

    assert.throws(() => {
      manager.addSource({
        type: 'local-folder',
        name: 'Local folder source',
        path: '',
      });
    }, /Local folder source requires a path/);

    assert.equal(manager.getActiveSource()?.id, officialSource.id);
    assert.deepEqual(manager.getAllSources(), [officialSource]);
  });
});
