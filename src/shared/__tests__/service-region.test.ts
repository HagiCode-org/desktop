import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveEffectiveServiceRegion,
  serviceRegionPreferenceAfterSourceChange,
} from '../service-region.js';
import {
  OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
  OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL,
} from '../package-source-defaults.js';

describe('service-region resolution', () => {
  it('prefers an explicit preference over the active source', () => {
    assert.equal(
      resolveEffectiveServiceRegion('INTERNATIONAL', {
        type: 'http-index',
        indexUrl: OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL,
      }),
      'INTERNATIONAL',
    );
  });

  it('infers the region from an official active HTTP index when no preference exists', () => {
    assert.equal(
      resolveEffectiveServiceRegion(undefined, {
        type: 'http-index',
        indexUrl: OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
      }),
      'INTERNATIONAL',
    );
  });

  it('defaults to mainland without replacing custom or local sources', () => {
    assert.equal(resolveEffectiveServiceRegion(undefined, {
      type: 'http-index',
      indexUrl: 'https://packages.example.test/index.json',
    }), 'CN');
    assert.equal(resolveEffectiveServiceRegion(undefined, {
      type: 'local-folder',
    }), 'CN');
  });

  it('ignores invalid persisted preferences', () => {
    assert.equal(resolveEffectiveServiceRegion('invalid', null), 'CN');
  });

  it('reconciles explicit official source changes and preserves the prior region for custom sources', () => {
    const international = {
      type: 'http-index' as const,
      indexUrl: OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
    };
    const mainland = {
      type: 'http-index' as const,
      indexUrl: OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL,
    };

    assert.equal(serviceRegionPreferenceAfterSourceChange(undefined, international, mainland), 'CN');
    assert.equal(serviceRegionPreferenceAfterSourceChange(undefined, international, {
      type: 'local-folder',
    }), 'INTERNATIONAL');
    assert.equal(serviceRegionPreferenceAfterSourceChange('INTERNATIONAL', mainland, {
      type: 'local-folder',
    }), undefined);
  });
});
