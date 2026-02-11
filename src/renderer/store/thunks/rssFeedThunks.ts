import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  setItems,
  setLoading,
  setError,
  setLastUpdate,
  clearError,
  type RSSFeedItem,
} from '../slices/rssFeedSlice';

// Types for window electronAPI
declare global {
  interface Window {
    electronAPI: {
      rss: {
        getFeedItems: () => Promise<RSSFeedItem[]>;
        refreshFeed: () => Promise<RSSFeedItem[]>;
        getLastUpdate: () => Promise<string | null>;
      };
    };
  }
}

/**
 * Fetch RSS feed items
 * Replaces rssFeedSaga/fetchFeedItemsSaga
 */
export const fetchFeedItems = createAsyncThunk(
  'rssFeed/fetchItems',
  async (_, { dispatch }) => {
    try {
      dispatch(setLoading(true));
      dispatch(clearError());

      const items: RSSFeedItem[] = await window.electronAPI.rss.getFeedItems();

      dispatch(setItems(items));

      // Also fetch last update time
      const lastUpdate: string | null = await window.electronAPI.rss.getLastUpdate();
      if (lastUpdate) {
        dispatch(setLastUpdate(lastUpdate));
      }

      return items;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch feed items';
      console.error('Fetch feed items error:', error);
      dispatch(setError(errorMessage));
      throw error;
    } finally {
      dispatch(setLoading(false));
    }
  }
);

/**
 * Refresh RSS feed
 * Replaces rssFeedSaga/refreshFeedSaga
 */
export const refreshFeed = createAsyncThunk(
  'rssFeed/refreshFeed',
  async (_, { dispatch }) => {
    try {
      dispatch(setLoading(true));
      dispatch(clearError());

      const items: RSSFeedItem[] = await window.electronAPI.rss.refreshFeed();

      dispatch(setItems(items));

      // Also fetch last update time
      const lastUpdate: string | null = await window.electronAPI.rss.getLastUpdate();
      if (lastUpdate) {
        dispatch(setLastUpdate(lastUpdate));
      }

      return items;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh feed';
      console.error('Refresh feed error:', error);
      dispatch(setError(errorMessage));
      throw error;
    } finally {
      dispatch(setLoading(false));
    }
  }
);

/**
 * Fetch last update time
 * Replaces rssFeedSaga/fetchLastUpdateSaga
 */
export const fetchLastUpdate = createAsyncThunk(
  'rssFeed/fetchLastUpdate',
  async (_, { dispatch }) => {
    try {
      const lastUpdate: string | null = await window.electronAPI.rss.getLastUpdate();

      if (lastUpdate) {
        dispatch(setLastUpdate(lastUpdate));
      }

      return lastUpdate;
    } catch (error) {
      console.error('Fetch last update error:', error);
      // Don't set error for last update fetch failure
      return null;
    }
  }
);

/**
 * Initialize RSS feed on app startup
 * Replaces rssFeedSaga/initializeRSSFeedSaga
 */
export const initializeRSSFeed = createAsyncThunk(
  'rssFeed/initialize',
  async (_, { dispatch }) => {
    dispatch(setLoading(true));

    try {
      const items: RSSFeedItem[] = await window.electronAPI.rss.getFeedItems();
      dispatch(setItems(items));

      const lastUpdate: string | null = await window.electronAPI.rss.getLastUpdate();
      if (lastUpdate) {
        dispatch(setLastUpdate(lastUpdate));
      }

      return items;
    } catch (e) {
      console.log('RSS feed not available yet');
      return [];
    } finally {
      dispatch(setLoading(false));
    }
  }
);
