import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type Store from 'electron-store';
import {
  CHINESE_RSS_FEED_URL,
  DEFAULT_RSS_LANGUAGE,
  DEFAULT_RSS_FEED_URL,
  ENGLISH_RSS_FEED_URL,
  FRENCH_RSS_FEED_URL,
  GERMAN_RSS_FEED_URL,
  JAPANESE_RSS_FEED_URL,
  KOREAN_RSS_FEED_URL,
  PORTUGUESE_RSS_FEED_URL,
  RUSSIAN_RSS_FEED_URL,
  SPANISH_RSS_FEED_URL,
  TRADITIONAL_CHINESE_RSS_FEED_URL,
  RSSFeedManager,
  resolveRSSFeedLanguage,
  resolveRSSFeedUrl,
} from '../rss-feed-manager.js';
import { ConfigManager, type AppConfig } from '../config.js';
import type { DesktopHttpClient, HttpResponse } from '../http-client.js';

function response<T>(data: T, status = 200): HttpResponse<T> {
  return {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {},
    data,
  };
}

function createMemoryStore(initial: Record<string, unknown> = {}): Store {
  const data = structuredClone(initial);

  return {
    get: (key: string) => data[key],
    set: (key: string, value: unknown) => {
      data[key] = value;
    },
    delete: (key: string) => {
      delete data[key];
    },
    clear: () => {
      for (const key of Object.keys(data)) {
        delete data[key];
      }
    },
    get store() {
      return data;
    },
  } as unknown as Store;
}

function createFeedXml(title: string, link: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Hagicode Blog</title>
    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <pubDate>Sun, 26 Apr 2026 12:00:00 GMT</pubDate>
      <description>${title} description</description>
    </item>
  </channel>
</rss>`;
}

afterEach(() => {
  try {
    RSSFeedManager.getInstance().destroy();
  } catch {
    // No singleton was created in this test.
  }
});

describe('localized RSS manager behavior', () => {
  it('maps each desktop language to its localized docs RSS URL', () => {
    assert.equal(resolveRSSFeedLanguage('zh-CN'), 'zh-CN');
    assert.equal(resolveRSSFeedLanguage('zh-TW'), 'zh-Hant');
    assert.equal(resolveRSSFeedLanguage('en-US'), 'en-US');
    assert.equal(resolveRSSFeedLanguage('ja'), 'ja-JP');
    assert.equal(resolveRSSFeedLanguage('ko'), 'ko-KR');
    assert.equal(resolveRSSFeedLanguage('de'), 'de-DE');
    assert.equal(resolveRSSFeedLanguage('fr'), 'fr-FR');
    assert.equal(resolveRSSFeedLanguage('es'), 'es-ES');
    assert.equal(resolveRSSFeedLanguage('pt'), 'pt-BR');
    assert.equal(resolveRSSFeedLanguage('ru'), 'ru-RU');
    assert.equal(resolveRSSFeedLanguage('unsupported-locale'), DEFAULT_RSS_LANGUAGE);

    assert.equal(resolveRSSFeedUrl('zh-CN'), CHINESE_RSS_FEED_URL);
    assert.equal(resolveRSSFeedUrl('zh-HK'), TRADITIONAL_CHINESE_RSS_FEED_URL);
    assert.equal(resolveRSSFeedUrl('en-US'), ENGLISH_RSS_FEED_URL);
    assert.equal(resolveRSSFeedUrl('ja-JP'), JAPANESE_RSS_FEED_URL);
    assert.equal(resolveRSSFeedUrl('ko-KR'), KOREAN_RSS_FEED_URL);
    assert.equal(resolveRSSFeedUrl('de-DE'), GERMAN_RSS_FEED_URL);
    assert.equal(resolveRSSFeedUrl('fr-FR'), FRENCH_RSS_FEED_URL);
    assert.equal(resolveRSSFeedUrl('es-ES'), SPANISH_RSS_FEED_URL);
    assert.equal(resolveRSSFeedUrl('pt-BR'), PORTUGUESE_RSS_FEED_URL);
    assert.equal(resolveRSSFeedUrl('ru-RU'), RUSSIAN_RSS_FEED_URL);
  });

  it('updates the RSS context on language switches and only falls back to same-language cache entries', async () => {
    const requests: string[] = [];
    const payloads = new Map<string, Array<string | Error>>([
      [TRADITIONAL_CHINESE_RSS_FEED_URL, [createFeedXml('繁體文章', 'https://docs.hagicode.com/zh-Hant/blog/post')]],
      [JAPANESE_RSS_FEED_URL, [new Error('japanese feed offline')]],
    ]);

    const httpClient: DesktopHttpClient = {
      requestJson: async () => response({}),
      requestBinary: async () => response(Buffer.alloc(0)),
      requestText: async (url) => {
        requests.push(url);
        const queue = payloads.get(url);
        const next = queue?.shift();

        if (next instanceof Error) {
          throw next;
        }

        return response(next ?? createFeedXml('fallback', 'https://docs.hagicode.com/blog/fallback'));
      },
    } as DesktopHttpClient;

    const manager = RSSFeedManager.getInstance({
      feedUrl: DEFAULT_RSS_FEED_URL,
      language: 'zh-Hant',
      refreshInterval: 24 * 60 * 60 * 1000,
      maxItems: 20,
      storeKey: 'rssFeed',
    }, createMemoryStore(), httpClient);

    const traditionalChineseItems = await manager.refreshFeed();
    assert.equal(traditionalChineseItems[0]?.title, '繁體文章');
    assert.equal(manager.getCurrentFeedUrl(), TRADITIONAL_CHINESE_RSS_FEED_URL);

    manager.switchLanguage('ja-JP');
    assert.equal(manager.getCurrentFeedUrl(), JAPANESE_RSS_FEED_URL);
    await assert.rejects(() => manager.refreshFeed(), /japanese feed offline/);

    payloads.set(TRADITIONAL_CHINESE_RSS_FEED_URL, [new Error('traditional chinese feed offline')]);
    manager.switchLanguage('zh-Hant');
    const fallbackItems = await manager.refreshFeed();

    assert.equal(fallbackItems[0]?.title, '繁體文章');
    assert.deepEqual(requests, [
      TRADITIONAL_CHINESE_RSS_FEED_URL,
      JAPANESE_RSS_FEED_URL,
      TRADITIONAL_CHINESE_RSS_FEED_URL,
    ]);
  });
});

describe('desktop language config persistence', () => {
  it('reads and writes the canonical settings.language field', () => {
    const store = createMemoryStore({
      settings: {
        language: 'en-US',
      },
      language: 'zh-CN',
    }) as unknown as Store<AppConfig>;
    const configManager = new ConfigManager(store);

    assert.equal(configManager.getCurrentLanguage(), 'en-US');
    assert.equal((store as unknown as { get: (key: string) => unknown }).get('language'), undefined);

    configManager.setCurrentLanguage('zh-CN');

    assert.deepEqual(configManager.get('settings'), {
      language: 'zh-CN',
    });
    assert.equal((store as unknown as { get: (key: string) => unknown }).get('language'), undefined);
  });

  it('migrates a legacy root language value into settings.language during startup', () => {
    const store = createMemoryStore({
      language: 'en-US',
    }) as unknown as Store<AppConfig>;
    const configManager = new ConfigManager(store);

    assert.equal(configManager.getCurrentLanguage(), 'en-US');
    assert.deepEqual(configManager.get('settings'), {
      language: 'en-US',
    });
  });
});
