import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveSiteLinks } from '@hagicode/hagilight-core/links';
import { buildRelatedSitesModel, type RelatedSitesResolver } from './related-sites.js';

describe('related sites model', () => {
  it('localizes the title, names and descriptions for English and Chinese', () => {
    const english = buildRelatedSitesModel('en-US');
    const chinese = buildRelatedSitesModel('zh-CN');

    assert.ok(english);
    assert.ok(chinese);
    assert.equal(english.title, 'Ecosystem Sites');
    assert.equal(chinese.title, '生态站点');

    const englishHagiTask = english.entries.find((entry) => entry.id === 'hagitask');
    const chineseHagiTask = chinese.entries.find((entry) => entry.id === 'hagitask');
    assert.equal(englishHagiTask?.name, 'HagiTask');
    assert.equal(englishHagiTask?.description, 'Task and workflow management.');
    assert.equal(chineseHagiTask?.name, 'HagiTask');
    assert.equal(chineseHagiTask?.description, '任务与工作流管理');
  });

  it('falls back to the core default language for a locale without a translation', () => {
    const fallback = buildRelatedSitesModel('xx-YY');
    const english = buildRelatedSitesModel('en-US');

    assert.ok(fallback);
    assert.ok(english);
    assert.equal(fallback.title, english.title);
    assert.deepEqual(fallback.entries, english.entries);
  });

  it('maps every entry to an https href with a non-empty name', () => {
    const model = buildRelatedSitesModel('en-US');

    assert.ok(model);
    assert.ok(model.entries.length > 0);
    for (const entry of model.entries) {
      assert.ok(entry.name.length > 0, `entry ${entry.id} has an empty name`);
      assert.match(entry.href, /^https:\/\/\S+$/, `entry ${entry.id} has an unsafe href`);
    }
  });

  it('omits description when the core data has none', () => {
    const model = buildRelatedSitesModel('en-US');
    const awesome = model?.entries.find((entry) => entry.id === 'awesome-sites');

    assert.ok(awesome);
    assert.equal(awesome.description, undefined);
  });

  it('returns null when the resolver yields an empty list', () => {
    const emptyResolver = ((locale) => ({
      ...resolveSiteLinks(locale),
      relatedSites: [],
    })) as RelatedSitesResolver;

    assert.equal(buildRelatedSitesModel('en-US', emptyResolver), null);
  });

  it('returns null and logs when the resolver throws', () => {
    const originalError = console.error;
    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };

    try {
      const throwingResolver = (() => {
        throw new Error('related-sites.json is unavailable');
      }) as RelatedSitesResolver;

      assert.equal(buildRelatedSitesModel('en-US', throwingResolver), null);
      assert.equal(logged.length, 1);
    } finally {
      console.error = originalError;
    }
  });
});
