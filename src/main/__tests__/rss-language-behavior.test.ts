import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type Store from 'electron-store';
import {
  CHINESE_RSS_FEED_URL,
  DEFAULT_RSS_FEED_URL,
  ENGLISH_RSS_FEED_URL,
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
  it('maps Chinese and English application languages to localized docs RSS URLs', () => {
    assert.equal(resolveRSSFeedLanguage('zh-CN'), 'zh-CN');
    assert.equal(resolveRSSFeedLanguage('zh-TW'), 'zh-CN');
    assert.equal(resolveRSSFeedLanguage('en-US'), 'en-US');
    assert.equal(resolveRSSFeedUrl('zh-HK'), CHINESE_RSS_FEED_URL);
    assert.equal(resolveRSSFeedUrl('en-US'), ENGLISH_RSS_FEED_URL);
  });

  it('updates the RSS context on language switches and only falls back to same-language cache entries', async () => {
    const requests: string[] = [];
    const payloads = new Map<string, Array<string | Error>>([
      [CHINESE_RSS_FEED_URL, [createFeedXml('中文文章', 'https://docs.hagicode.com/blog/zh')]],
      [ENGLISH_RSS_FEED_URL, [new Error('english feed offline')]],
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
      language: 'zh-CN',
      refreshInterval: 24 * 60 * 60 * 1000,
      maxItems: 20,
      storeKey: 'rssFeed',
    }, createMemoryStore(), httpClient);

    const chineseItems = await manager.refreshFeed();
    assert.equal(chineseItems[0]?.title, '中文文章');
    assert.equal(manager.getCurrentFeedUrl(), CHINESE_RSS_FEED_URL);

    manager.switchLanguage('en-US');
    assert.equal(manager.getCurrentFeedUrl(), ENGLISH_RSS_FEED_URL);
    await assert.rejects(() => manager.refreshFeed(), /english feed offline/);

    payloads.set(CHINESE_RSS_FEED_URL, [new Error('chinese feed offline')]);
    manager.switchLanguage('zh-CN');
    const fallbackItems = await manager.refreshFeed();

    assert.equal(fallbackItems[0]?.title, '中文文章');
    assert.deepEqual(requests, [
      CHINESE_RSS_FEED_URL,
      ENGLISH_RSS_FEED_URL,
      CHINESE_RSS_FEED_URL,
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
