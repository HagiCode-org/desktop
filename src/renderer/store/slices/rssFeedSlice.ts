import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * RSS feed item type (matches main process type)
 */
export interface RSSFeedItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  guid?: string;
  contentSnippet?: string;
}

/**
 * RSS Feed state
 */
export interface RSSFeedState {
  /** RSS feed items */
  items: RSSFeedItem[];
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Last update timestamp (ISO 8601) */
  lastUpdate: string | null;
}

const initialState: RSSFeedState = {
  items: [],
  loading: false,
  error: null,
  lastUpdate: null,
};

export const rssFeedSlice = createSlice({
  name: 'rssFeed',
  initialState,
  reducers: {
    // Set RSS feed items
    setItems: (state, action: PayloadAction<RSSFeedItem[]>) => {
      state.items = action.payload;
      state.error = null;
    },

    // Set loading state
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },

    // Set error message
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.loading = false;
    },

    // Set last update time
    setLastUpdate: (state, action: PayloadAction<string | null>) => {
      state.lastUpdate = action.payload;
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },

    // Reset state
    reset: () => initialState,
  },
});

// Export actions
export const {
  setItems,
  setLoading,
  setError,
  setLastUpdate,
  clearError,
  reset,
} = rssFeedSlice.actions;

// Selectors
export const selectRSSFeedItems = (state: { rssFeed: RSSFeedState }) => state.rssFeed.items;
export const selectRSSFeedLoading = (state: { rssFeed: RSSFeedState }) => state.rssFeed.loading;
export const selectRSSFeedError = (state: { rssFeed: RSSFeedState }) => state.rssFeed.error;
export const selectRSSFeedLastUpdate = (state: { rssFeed: RSSFeedState }) => state.rssFeed.lastUpdate;

// Export reducer
export default rssFeedSlice.reducer;
