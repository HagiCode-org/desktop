/**
 * RSS Feed Types
 * Types for RSS feed data structures used in blog feed integration
 */

/**
 * Represents a single RSS feed item (blog article)
 */
export interface RSSFeedItem {
  /** Article title */
  title: string;
  /** URL to the full article */
  link: string;
  /** Publication date in ISO 8601 format */
  pubDate: string;
  /** Article description/summary */
  description: string;
  /** Unique identifier (optional) */
  guid?: string;
  /** Content snippet (optional, may contain HTML) */
  contentSnippet?: string;
}

/**
 * Cached RSS feed data stored in electron-store
 */
export interface RSSFeedCache {
  /** Array of RSS feed items */
  items: RSSFeedItem[];
  /** ISO 8601 timestamp of last update */
  lastUpdate: string;
  /** Canonical language context for this cache entry */
  language: string;
  /** Feed URL used to populate this cache entry */
  feedUrl: string;
}

/**
 * Configuration for RSS feed manager
 */
export interface RSSFeedConfig {
  /** URL of the RSS feed */
  feedUrl: string;
  /** Initial application language for feed selection */
  language?: string;
  /** Auto-refresh interval in milliseconds (default: 24 hours) */
  refreshInterval?: number;
  /** Maximum number of items to store (default: 20) */
  maxItems?: number;
  /** Store key for caching */
  storeKey?: string;
}
