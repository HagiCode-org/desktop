import { call, put, takeEvery, takeLatest } from 'redux-saga/effects';
import {
  setItems,
  setLoading,
  setError,
  setLastUpdate,
  clearError,
  type RSSFeedItem,
} from '../slices/rssFeedSlice';

// Action types for sagas
export const FETCH_FEED_ITEMS = 'rssFeed/fetchItemsSaga';
export const REFRESH_FEED = 'rssFeed/refreshFeedSaga';
export const FETCH_LAST_UPDATE = 'rssFeed/fetchLastUpdateSaga';

// Action creators
export const fetchFeedItemsAction = () => ({ type: FETCH_FEED_ITEMS });
export const refreshFeedAction = () => ({ type: REFRESH_FEED });
export const fetchLastUpdateAction = () => ({ type: FETCH_LAST_UPDATE });

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

// Saga: Fetch RSS feed items
function* fetchFeedItemsSaga() {
  try {
    yield put(setLoading(true));
    yield put(clearError());

    const items: RSSFeedItem[] = yield call(window.electronAPI.rss.getFeedItems);

    yield put(setItems(items));
    yield put(setLoading(false));

    // Also fetch last update time
    const lastUpdate: string | null = yield call(window.electronAPI.rss.getLastUpdate);
    if (lastUpdate) {
      yield put(setLastUpdate(lastUpdate));
    }
  } catch (error) {
    console.error('Fetch feed items saga error:', error);
    yield put(setError(error instanceof Error ? error.message : 'Failed to fetch feed items'));
    yield put(setLoading(false));
  }
}

// Saga: Refresh RSS feed
function* refreshFeedSaga() {
  try {
    yield put(setLoading(true));
    yield put(clearError());

    const items: RSSFeedItem[] = yield call(window.electronAPI.rss.refreshFeed);

    yield put(setItems(items));
    yield put(setLoading(false));

    // Also fetch last update time
    const lastUpdate: string | null = yield call(window.electronAPI.rss.getLastUpdate);
    if (lastUpdate) {
      yield put(setLastUpdate(lastUpdate));
    }
  } catch (error) {
    console.error('Refresh feed saga error:', error);
    yield put(setError(error instanceof Error ? error.message : 'Failed to refresh feed'));
    yield put(setLoading(false));
  }
}

// Saga: Fetch last update time
function* fetchLastUpdateSaga() {
  try {
    const lastUpdate: string | null = yield call(window.electronAPI.rss.getLastUpdate);

    if (lastUpdate) {
      yield put(setLastUpdate(lastUpdate));
    }
  } catch (error) {
    console.error('Fetch last update saga error:', error);
    // Don't set error for last update fetch failure
  }
}

// Root saga for RSS feed
export function* rssFeedSaga() {
  // Watch for actions
  yield takeLatest(FETCH_FEED_ITEMS, fetchFeedItemsSaga);
  yield takeLatest(REFRESH_FEED, refreshFeedSaga);
  yield takeEvery(FETCH_LAST_UPDATE, fetchLastUpdateSaga);
}

// Initial data fetching saga
export function* initializeRSSFeedSaga() {
  yield put(setLoading(true));

  // Try to fetch initial data
  try {
    const items: RSSFeedItem[] = yield call(window.electronAPI.rss.getFeedItems);
    yield put(setItems(items));

    const lastUpdate: string | null = yield call(window.electronAPI.rss.getLastUpdate);
    if (lastUpdate) {
      yield put(setLastUpdate(lastUpdate));
    }
  } catch (e) {
    console.log('RSS feed not available yet');
  } finally {
    yield put(setLoading(false));
  }
}
