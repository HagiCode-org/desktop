import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigManager } from '../config.js';

class MemoryStore {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): T {
    return this.values.get(key) as T;
  }

  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }

  delete(key: string): void {
    this.values.delete(key);
  }
}

describe('service-region configuration persistence', () => {
  it('persists explicit choices across ConfigManager instances and validates stored values', () => {
    const store = new MemoryStore();
    const firstLaunch = new ConfigManager(store as never);

    assert.equal(firstLaunch.getServiceRegionPreference(), undefined);
    firstLaunch.setServiceRegionPreference('INTERNATIONAL');

    const restarted = new ConfigManager(store as never);
    assert.equal(restarted.getServiceRegionPreference(), 'INTERNATIONAL');

    store.set('serviceRegionPreference', 'invalid');
    assert.equal(new ConfigManager(store as never).getServiceRegionPreference(), undefined);
  });
});
