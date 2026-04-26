import Parser from 'rss-parser';
import Store from 'electron-store';
import log from 'electron-log';
import type {
  RSSFeedItem,
  RSSFeedCache,
  RSSFeedConfig
} from './types/rss-types.js';
import { desktopHttpClient, type DesktopHttpClient } from './http-client.js';

export const DEFAULT_RSS_LANGUAGE = 'zh-CN';
export const CHINESE_RSS_FEED_URL = 'https://docs.hagicode.com/blog/rss.zh-CN.xml';
export const ENGLISH_RSS_FEED_URL = 'https://docs.hagicode.com/blog/rss.en.xml';
export const DEFAULT_RSS_FEED_URL = CHINESE_RSS_FEED_URL;

type SupportedRSSLanguage = 'zh-CN' | 'en-US';

function normalizeLanguage(language?: string): string {
  return language?.trim() || DEFAULT_RSS_LANGUAGE;
}

export function resolveRSSFeedLanguage(language?: string): SupportedRSSLanguage {
  return normalizeLanguage(language).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function resolveRSSFeedUrl(language?: string): string {
  return resolveRSSFeedLanguage(language) === 'zh-CN'
    ? CHINESE_RSS_FEED_URL
    : ENGLISH_RSS_FEED_URL;
}

/**
 * RSS Feed Manager
 * Singleton class for managing RSS feed fetching, parsing, and caching
 */
export class RSSFeedManager {
  private static instance: RSSFeedManager | null = null;
  private parser: Parser;
  private store: Store;
  private config: Required<RSSFeedConfig>;
  private refreshTimer: NodeJS.Timeout | null = null;
  private httpClient: DesktopHttpClient;
  private currentLanguage: string;
  private currentFeedLanguage: SupportedRSSLanguage;
  private currentFeedUrl: string;

  private constructor(config: RSSFeedConfig, store?: Store, httpClient: DesktopHttpClient = desktopHttpClient) {
    const initialLanguage = normalizeLanguage(config.language);
    this.config = {
      feedUrl: config.feedUrl,
      language: initialLanguage,
      refreshInterval: config.refreshInterval ?? 24 * 60 * 60 * 1000, // 24 hours
      maxItems: config.maxItems ?? 20,
      storeKey: config.storeKey ?? 'rssFeed',
    };
    this.currentLanguage = initialLanguage;
    this.currentFeedLanguage = resolveRSSFeedLanguage(initialLanguage);
    this.currentFeedUrl = resolveRSSFeedUrl(initialLanguage);

    // Initialize parser with custom options
    this.parser = new Parser({
      timeout: 10000,
      customFields: {
        item: ['description', 'content:encoded'],
      },
    });

    // Use provided store or create new one
    this.store = store ?? new Store();
    this.httpClient = httpClient;

    log.info('[RSSFeedManager] Initialized with config:', {
      configuredFeedUrl: this.config.feedUrl,
      currentFeedUrl: this.currentFeedUrl,
      currentLanguage: this.currentLanguage,
      currentFeedLanguage: this.currentFeedLanguage,
      refreshInterval: this.config.refreshInterval,
      maxItems: this.config.maxItems,
      storeKey: this.config.storeKey,
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: RSSFeedConfig, store?: Store, httpClient?: DesktopHttpClient): RSSFeedManager {
    if (!RSSFeedManager.instance) {
      if (!config) {
        throw new Error('[RSSFeedManager] Config required for first initialization');
      }
      RSSFeedManager.instance = new RSSFeedManager(config, store, httpClient);
    }
    return RSSFeedManager.instance;
  }

  /**
   * Fetch RSS feed from URL
   */
  private async fetchRSSFeed(): Promise<string> {
    log.info('[RSSFeedManager] Fetching RSS feed from:', this.currentFeedUrl, 'language:', this.currentFeedLanguage);

    const response = await this.httpClient.requestText(this.currentFeedUrl, {
      timeoutMs: 15000,
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    return response.data;
  }

  /**
   * Parse RSS XML content into feed items
   */
  private async parseRSSXML(xmlContent: string): Promise<RSSFeedItem[]> {
    log.info('[RSSFeedManager] Parsing RSS XML content');

    try {
      const feed = await this.parser.parseString(xmlContent);

      if (!feed.items || feed.items.length === 0) {
        log.warn('[RSSFeedManager] No items found in RSS feed');
        return [];
      }

      const items: RSSFeedItem[] = feed.items
        .map((item: any) => ({
          title: item.title || 'Untitled',
          link: item.link || '',
          pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
          description: item.contentSnippet || item.description || '',
          guid: item.guid || item.link,
          contentSnippet: item.contentSnippet || item.description || '',
        }))
        .filter((item: RSSFeedItem) => item.link) // Filter out items without link
        .slice(0, this.config.maxItems); // Limit max items

      log.info('[RSSFeedManager] Parsed', items.length, 'RSS items');
      return items;
    } catch (error) {
      log.error('[RSSFeedManager] Failed to parse RSS XML:', error);
      throw new Error(`RSS parsing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get cached feed data
   */
  getCachedFeed(): RSSFeedCache | null {
    try {
      const cached = this.store.get(this.getCacheKey()) as RSSFeedCache | undefined;
      if (cached && this.isCacheContextValid(cached)) {
        log.info('[RSSFeedManager] Retrieved cached feed from', cached.lastUpdate);
        return cached;
      }
      if (cached) {
        log.warn('[RSSFeedManager] Ignoring cached feed with mismatched context', {
          expectedLanguage: this.currentFeedLanguage,
          cachedLanguage: cached.language,
          expectedFeedUrl: this.currentFeedUrl,
          cachedFeedUrl: cached.feedUrl,
        });
      }
      return null;
    } catch (error) {
      log.error('[RSSFeedManager] Failed to get cached feed:', error);
      return null;
    }
  }

  /**
   * Save feed data to cache
   */
  private saveCache(items: RSSFeedItem[]): void {
    try {
      const cache: RSSFeedCache = {
        items,
        lastUpdate: new Date().toISOString(),
        language: this.currentFeedLanguage,
        feedUrl: this.currentFeedUrl,
      };

      this.store.set(this.getCacheKey(), cache);
      log.info('[RSSFeedManager] Saved', items.length, 'items to cache');
    } catch (error) {
      log.error('[RSSFeedManager] Failed to save cache:', error);
    }
  }

  /**
   * Refresh RSS feed data
   */
  async refreshFeed(): Promise<RSSFeedItem[]> {
    log.info('[RSSFeedManager] Refreshing RSS feed');

    try {
      // Fetch RSS data
      const xmlContent = await this.fetchRSSFeed();

      // Parse RSS data
      const items = await this.parseRSSXML(xmlContent);

      // Save to cache
      this.saveCache(items);

      return items;
    } catch (error) {
      log.error('[RSSFeedManager] Failed to refresh feed:', error);

      // Return cached data as fallback
      const cached = this.getCachedFeed();
      if (cached) {
        log.info('[RSSFeedManager] Returning cached data as fallback');
        return cached.items;
      }

      throw error;
    }
  }

  /**
   * Get feed items (from cache or fetch if needed)
   */
  async getFeedItems(forceRefresh: boolean = false): Promise<RSSFeedItem[]> {
    const cached = this.getCachedFeed();

    // If cache exists and not forcing refresh, check if still valid
    if (cached && !forceRefresh) {
      const cacheAge = Date.now() - new Date(cached.lastUpdate).getTime();
      if (cacheAge < this.config.refreshInterval) {
        log.info('[RSSFeedManager] Returning cached feed (age:', Math.round(cacheAge / 1000 / 60), 'minutes)');
        return cached.items;
      }
    }

    // Fetch fresh data
    return await this.refreshFeed();
  }

  /**
   * Get last update time
   */
  getLastUpdateTime(): string | null {
    const cached = this.getCachedFeed();
    return cached?.lastUpdate ?? null;
  }

  switchLanguage(language: string): boolean {
    const nextLanguage = normalizeLanguage(language);
    const nextFeedLanguage = resolveRSSFeedLanguage(nextLanguage);
    const nextFeedUrl = resolveRSSFeedUrl(nextLanguage);
    const changed = this.currentLanguage !== nextLanguage
      || this.currentFeedLanguage !== nextFeedLanguage
      || this.currentFeedUrl !== nextFeedUrl;

    this.currentLanguage = nextLanguage;
    this.currentFeedLanguage = nextFeedLanguage;
    this.currentFeedUrl = nextFeedUrl;
    this.config.language = nextLanguage;

    log.info('[RSSFeedManager] Updated language context:', {
      changed,
      currentLanguage: this.currentLanguage,
      currentFeedLanguage: this.currentFeedLanguage,
      currentFeedUrl: this.currentFeedUrl,
    });

    return changed;
  }

  getCurrentLanguage(): string {
    return this.currentLanguage;
  }

  getCurrentFeedUrl(): string {
    return this.currentFeedUrl;
  }

  /**
   * Start auto-refresh timer
   */
  startAutoRefresh(): void {
    // Stop existing timer if any
    this.stopAutoRefresh();

    log.info('[RSSFeedManager] Starting auto-refresh timer (interval:', this.config.refreshInterval, 'ms)');

    this.refreshTimer = setInterval(async () => {
      log.info('[RSSFeedManager] Auto-refresh triggered');
      try {
        await this.refreshFeed();
      } catch (error) {
        log.error('[RSSFeedManager] Auto-refresh failed:', error);
      }
    }, this.config.refreshInterval);
  }

  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      log.info('[RSSFeedManager] Stopped auto-refresh timer');
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopAutoRefresh();
    RSSFeedManager.instance = null;
    log.info('[RSSFeedManager] Destroyed');
  }

  private getCacheKey(): string {
    return `${this.config.storeKey}.${this.currentFeedLanguage}`;
  }

  private isCacheContextValid(cache: RSSFeedCache): boolean {
    return cache.language === this.currentFeedLanguage && cache.feedUrl === this.currentFeedUrl;
  }
}
