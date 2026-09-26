import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServiceRegionController } from '../service-region-controller.js';
import type { ServiceRegion } from '../../types/service-region.js';
import {
  OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
  OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL,
} from '../../shared/package-source-defaults.js';

class PreferenceStore {
  preference: ServiceRegion | undefined;
  failWrites = false;
  failNextWrite = false;

  getServiceRegionPreference(): ServiceRegion | undefined {
    return this.preference;
  }

  setServiceRegionPreference(region: ServiceRegion): void {
    if (this.failWrites || this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('preference write failed');
    }
    this.preference = region;
  }

  clearServiceRegionPreference(): void {
    this.preference = undefined;
  }
}

class SourceManager {
  source: { id: string; type: 'http-index' | 'local-folder'; indexUrl?: string } | null;
  private readonly sources = new Map<string, NonNullable<SourceManager['source']>>();
  failSwitch = false;
  failRestore = false;

  constructor(source: SourceManager['source']) {
    this.source = source;
    if (source) {
      this.sources.set(source.id, source);
    }
  }

  getCurrentSourceConfig(): SourceManager['source'] {
    return this.source;
  }

  async switchSource(sourceId: string): Promise<boolean> {
    if (this.failRestore && sourceId !== this.source?.id) {
      return false;
    }
    const source = this.sources.get(sourceId);
    if (!source) {
      return false;
    }
    this.source = source;
    return true;
  }

  async switchToServiceRegion(region: ServiceRegion): Promise<boolean> {
    if (this.failSwitch) {
      return false;
    }
    this.source = {
      id: region === 'CN' ? 'mainland' : 'international',
      type: 'http-index',
      indexUrl: region === 'CN'
        ? OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL
        : OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
    };
    this.sources.set(this.source.id, this.source);
    return true;
  }
}

describe('ServiceRegionController', () => {
  it('switches to the matching official index and persists both regions', async () => {
    const preferences = new PreferenceStore();
    const sources = new SourceManager({ id: 'custom', type: 'local-folder' });
    const controller = new ServiceRegionController(preferences, sources);

    const international = await controller.setRegion('INTERNATIONAL');
    assert.equal(international.success, true);
    assert.equal(international.state?.region, 'INTERNATIONAL');
    assert.equal(preferences.preference, 'INTERNATIONAL');
    assert.equal(sources.source?.indexUrl, OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL);

    const mainland = await controller.setRegion('CN');
    assert.equal(mainland.success, true);
    assert.equal(mainland.state?.region, 'CN');
    assert.equal(preferences.preference, 'CN');
    assert.equal(sources.source?.indexUrl, OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL);
  });

  it('resets the explicit preference without changing the active package source', async () => {
    const preferences = new PreferenceStore();
    preferences.preference = 'INTERNATIONAL';
    const sources = new SourceManager({
      id: 'international',
      type: 'http-index',
      indexUrl: OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
    });
    const controller = new ServiceRegionController(preferences, sources);

    const result = await controller.resetPreference();

    assert.equal(result.success, true);
    assert.equal(result.state?.region, 'INTERNATIONAL');
    assert.equal(result.state?.isExplicit, false);
    assert.equal(preferences.preference, undefined);
    assert.equal(sources.source?.id, 'international');
  });

  it('rejects invalid choices and preserves the current state on source-switch failure', async () => {
    const preferences = new PreferenceStore();
    preferences.preference = 'INTERNATIONAL';
    const sources = new SourceManager({
      id: 'international',
      type: 'http-index',
      indexUrl: OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
    });
    sources.failSwitch = true;
    const controller = new ServiceRegionController(preferences, sources);

    assert.equal((await controller.setRegion('global')).success, false);
    const failedChange = await controller.setRegion('CN');
    assert.equal(failedChange.success, false);
    assert.equal(failedChange.state?.region, 'INTERNATIONAL');
    assert.equal(preferences.preference, 'INTERNATIONAL');
  });

  it('rolls the active source and preference back when persistence fails', async () => {
    const preferences = new PreferenceStore();
    const sources = new SourceManager({ id: 'custom', type: 'local-folder' });
    const controller = new ServiceRegionController(preferences, sources);
    const originalSwitch = sources.switchToServiceRegion.bind(sources);
    sources.switchToServiceRegion = async (region) => {
      const switched = await originalSwitch(region);
      preferences.failWrites = true;
      return switched;
    };

    const result = await controller.setRegion('INTERNATIONAL');
    assert.equal(result.success, false);
    assert.equal(result.state?.region, 'CN');
    assert.equal(sources.source?.id, 'custom');
    assert.equal(preferences.preference, undefined);
    assert.match(result.error ?? '', /preference write failed/);
  });

  it('reports and synchronizes the actual official source when source rollback fails', async () => {
    const preferences = new PreferenceStore();
    preferences.preference = 'INTERNATIONAL';
    const sources = new SourceManager({
      id: 'international',
      type: 'http-index',
      indexUrl: OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
    });
    const controller = new ServiceRegionController(preferences, sources);
    const originalSwitch = sources.switchToServiceRegion.bind(sources);
    sources.switchToServiceRegion = async (region) => {
      const switched = await originalSwitch(region);
      sources.failRestore = true;
      preferences.failNextWrite = true;
      return switched;
    };

    const result = await controller.setRegion('CN');
    assert.equal(result.success, false);
    assert.equal(result.state?.region, 'CN');
    assert.equal(preferences.preference, 'CN');
    assert.match(result.error ?? '', /package source rollback failed/);
  });
});
