import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  setItems,
  setLoading,
  setError,
  setLastUpdate,
  clearError,
  type RSSFeedItem,
} from '../slices/rssFeedSlice';

/**
 * Fetch RSS feed items
 * Replaces rssFeedSaga/fetchFeedItemsSaga
 */
export const fetchFeedItems = createAsyncThunk(
  'rssFeed/fetchItems',
  async (_, { dispatch }) => {
    return runFeedRequest(dispatch, {
      loader: () => window.electronAPI.rss.getFeedItems(),
      errorMessage: 'Failed to fetch feed items',
    });
  }
);

/**
 * Refresh RSS feed
 * Replaces rssFeedSaga/refreshFeedSaga
 */
export const refreshFeed = createAsyncThunk(
  'rssFeed/refreshFeed',
  async (_, { dispatch }) => {
    return runFeedRequest(dispatch, {
      loader: () => window.electronAPI.rss.refreshFeed(),
      errorMessage: 'Failed to refresh feed',
    });
  }
);

export const refreshFeedForLanguageChange = createAsyncThunk(
  'rssFeed/refreshFeedForLanguageChange',
  async (_language: string, { dispatch }) => {
    return runFeedRequest(dispatch, {
      loader: () => window.electronAPI.rss.refreshFeed(),
      errorMessage: 'Failed to refresh feed',
      resetVisibleState: true,
    });
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
    try {
      return await runFeedRequest(dispatch, {
        loader: () => window.electronAPI.rss.getFeedItems(),
        errorMessage: 'Failed to initialize feed',
      });
    } catch (e) {
      console.log('RSS feed not available yet');
      return [];
    }
  }
);

async function runFeedRequest(
  dispatch: (action: unknown) => void,
  options: {
    loader: () => Promise<RSSFeedItem[]>;
    errorMessage: string;
    resetVisibleState?: boolean;
  },
): Promise<RSSFeedItem[]> {
  try {
    dispatch(setLoading(true));
    dispatch(clearError());

    if (options.resetVisibleState) {
      dispatch(setItems([]));
      dispatch(setLastUpdate(null));
    }

    const items: RSSFeedItem[] = await options.loader();
    dispatch(setItems(items));

    const lastUpdate: string | null = await window.electronAPI.rss.getLastUpdate();
    dispatch(setLastUpdate(lastUpdate));

    return items;
  } catch (error) {
    const message = error instanceof Error ? error.message : options.errorMessage;
    console.error(`${options.errorMessage}:`, error);
    dispatch(setError(message));
    throw error;
  } finally {
    dispatch(setLoading(false));
  }
}
