import { ipcMain } from 'electron';
import { RSSFeedManager } from '../../rss-feed-manager.js';

// Module state
let rssFeedManager: RSSFeedManager | null = null;

/**
 * Initialize RSS handlers with dependencies
 */
export function initRssHandlers(manager: RSSFeedManager | null): void {
  rssFeedManager = manager;
}

/**
 * Register RSS feed IPC handlers
 */
export function registerRssHandlers(manager: RSSFeedManager | null): void {
  rssFeedManager = manager;

  // RSS get feed items handler
  ipcMain.handle('rss-get-feed-items', async () => {
    if (!rssFeedManager) {
      return [];
    }
    try {
      const items = await rssFeedManager.getFeedItems();
      return items;
    } catch (error) {
      console.error('Failed to get RSS feed items:', error);
      return [];
    }
  });

  // RSS refresh feed handler
  ipcMain.handle('rss-refresh-feed', async () => {
    if (!rssFeedManager) {
      return [];
    }
    try {
      const items = await rssFeedManager.refreshFeed();
      return items;
    } catch (error) {
      console.error('Failed to refresh RSS feed:', error);
      return [];
    }
  });

  // RSS get last update handler
  ipcMain.handle('rss-get-last-update', async () => {
    if (!rssFeedManager) {
      return null;
    }
    try {
      return rssFeedManager.getLastUpdateTime();
    } catch (error) {
      console.error('Failed to get last RSS update time:', error);
      return null;
    }
  });

  console.log('[IPC] RSS handlers registered');
}
