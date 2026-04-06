import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Store from 'electron-store';
import {
  normalizeLocale,
  RegionDetector,
  resolveRegionFromLocale,
} from '../region-detector.js';

class MemoryStore {
  private readonly data = new Map<string, unknown>();

  get(key: string) {
    return this.data.get(key);
  }

  set(key: string, value: unknown) {
    this.data.set(key, value);
  }

  delete(key: string) {
    this.data.delete(key);
  }
}

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('region-detector locale normalization', () => {
  it('canonicalizes locale variants for stable snapshot comparison', () => {
    assert.equal(normalizeLocale('zh_hans_cn'), 'zh-Hans-CN');
    assert.equal(normalizeLocale('EN_us'), 'en-US');
    assert.equal(normalizeLocale('   '), null);
  });

  it('maps Chinese locale families to CN and others to INTERNATIONAL', () => {
    const chineseLocales = ['zh', 'zh-CN', 'zh-Hans', 'zh-Hans-CN', 'zh-SG', 'zh-TW', 'zh-HK'];
    for (const locale of chineseLocales) {
      assert.equal(resolveRegionFromLocale(locale), 'CN', `expected ${locale} to map to CN`);
    }

    for (const locale of ['en-US', 'ja-JP', 'fr-FR']) {
      assert.equal(resolveRegionFromLocale(locale), 'INTERNATIONAL', `expected ${locale} to map to INTERNATIONAL`);
    }
  });
});

describe('RegionDetector cache behavior', () => {
  it('reuses cached detection when the normalized locale snapshot stays the same', () => {
    const store = new MemoryStore();
    let nowMs = Date.parse('2026-03-10T00:00:00.000Z');
    const detector = new RegionDetector(store as unknown as Store<Record<string, unknown>>, {
      getLocale: () => 'zh-Hans-CN',
      now: () => new Date(nowMs),
      logger: silentLogger,
    });

    const first = detector.detectWithCache();
    assert.equal(first.region, 'CN');
    assert.equal(first.method, 'locale');
    assert.equal(first.localeSnapshot, 'zh-Hans-CN');

    nowMs += 5_000;
    const second = detector.detectWithCache();
    assert.equal(second.region, 'CN');
    assert.equal(second.method, 'cache');
    assert.equal(second.localeSnapshot, 'zh-Hans-CN');
  });

  it('invalidates cached detection when the normalized locale snapshot changes', () => {
    const store = new MemoryStore();
    let nowMs = Date.parse('2026-03-10T00:00:00.000Z');
    let locale = 'zh-CN';
    const detector = new RegionDetector(store as unknown as Store<Record<string, unknown>>, {
      getLocale: () => locale,
      now: () => new Date(nowMs),
      logger: silentLogger,
    });

    const first = detector.detectWithCache();
    assert.equal(first.region, 'CN');
    assert.equal(first.method, 'locale');

    locale = 'en-US';
    nowMs += 5_000;
    const second = detector.detectWithCache();
    assert.equal(second.region, 'INTERNATIONAL');
    assert.equal(second.method, 'locale');
    assert.equal(second.localeSnapshot, 'en-US');
  });

  it('clears stale results when redetect is requested manually', () => {
    const store = new MemoryStore();
    let locale = 'zh';
    const detector = new RegionDetector(store as unknown as Store<Record<string, unknown>>, {
      getLocale: () => locale,
      now: () => new Date('2026-03-10T00:00:00.000Z'),
      logger: silentLogger,
    });

    detector.detectWithCache();
    locale = 'ja-JP';

    const redetected = detector.redetect();
    assert.equal(redetected.region, 'INTERNATIONAL');
    assert.equal(redetected.method, 'locale');
    assert.equal(redetected.localeSnapshot, 'ja-JP');
  });

  it('marks locale resolution failures as error-fallback for conservative callers', () => {
    const store = new MemoryStore();
    const detector = new RegionDetector(store as unknown as Store<Record<string, unknown>>, {
      getLocale: () => {
        throw new Error('locale unavailable');
      },
      now: () => new Date('2026-03-10T00:00:00.000Z'),
      logger: silentLogger,
    });

    const detection = detector.detectWithCache();
    assert.equal(detection.region, 'INTERNATIONAL');
    assert.equal(detection.method, 'locale');
    assert.equal(detection.matchedRule, 'error-fallback');
    assert.equal(detection.localeSnapshot, null);
  });
});
