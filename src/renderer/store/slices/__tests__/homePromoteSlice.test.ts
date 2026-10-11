import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { configureStore } from '@reduxjs/toolkit';
import type { PromoteBridge, PromoteItem } from '../../../../types/promote.js';
import reducer, {
  selectHomePromoteImagesByKey,
  selectHomePromoteItems,
  selectHomePromoteLoading,
} from '../homePromoteSlice.js';
import { loadHomePromoteItems } from '../../thunks/homePromoteThunks.js';

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    delete (globalThis as { window?: unknown }).window;
  }
});

function createStore() {
  return configureStore({
    reducer: {
      homePromote: reducer,
    },
  });
}

function item(id: string, imageKey?: string): PromoteItem {
  return {
    id,
    title: `Title ${id}`,
    description: `Body ${id}`,
    link: `https://example.com/${id}`,
    ...(imageKey
      ? { image: { key: imageKey, width: 640, height: 360, alt: `Alt ${id}` } }
      : {}),
  };
}

function installBridge(overrides: Partial<PromoteBridge> = {}) {
  const languageRequests: string[] = [];
  const imageRequests: string[] = [];
  const bridge: PromoteBridge = {
    getItems: async ({ language }) => {
      languageRequests.push(language);
      return { items: [] };
    },
    getImage: async ({ key }) => {
      imageRequests.push(key);
      return { dataUrl: `data:image/png;base64,${key}` };
    },
    ...overrides,
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { electronAPI: { promote: bridge } },
  });

  return { bridge, languageRequests, imageRequests };
}

function removeBridge() {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { electronAPI: {} },
  });
}

describe('homePromote slice reducer', () => {
  it('starts empty and idle', () => {
    const store = createStore();
    const state = store.getState().homePromote;

    assert.deepEqual(state, {
      items: [],
      language: null,
      loadedAt: null,
      loading: false,
      imagesByKey: {},
    });
  });

  it('marks loading while a load is pending', () => {
    const store = createStore();

    store.dispatch({ type: loadHomePromoteItems.pending.type, meta: { arg: 'en-US' } });

    assert.equal(selectHomePromoteLoading(store.getState()), true);
  });

  it('stores items, images, language and load time when a load is fulfilled', () => {
    const store = createStore();
    const items = [item('a', 'k1')];

    store.dispatch({
      type: loadHomePromoteItems.fulfilled.type,
      payload: { items, imagesByKey: { k1: 'data:image/png;base64,k1' }, language: 'zh-CN', loadedAt: 1234 },
      meta: { arg: 'zh-CN' },
    });

    const state = store.getState().homePromote;
    assert.deepEqual(state.items, items);
    assert.deepEqual(state.imagesByKey, { k1: 'data:image/png;base64,k1' });
    assert.equal(state.language, 'zh-CN');
    assert.equal(state.loadedAt, 1234);
    assert.equal(state.loading, false);
  });

  it('clears loading without touching data when the bridge is missing', () => {
    const store = createStore();
    store.dispatch({
      type: loadHomePromoteItems.fulfilled.type,
      payload: { items: [item('a')], imagesByKey: {}, language: 'en-US', loadedAt: 1 },
      meta: { arg: 'en-US' },
    });

    store.dispatch({ type: loadHomePromoteItems.pending.type, meta: { arg: 'en-US' } });
    store.dispatch({ type: loadHomePromoteItems.fulfilled.type, payload: null, meta: { arg: 'en-US' } });

    const state = store.getState().homePromote;
    assert.equal(state.loading, false);
    assert.deepEqual(state.items, [item('a')]);
    assert.equal(state.language, 'en-US');
    assert.equal(state.loadedAt, 1);
  });

  it('clears loading and keeps the previous data when a load is rejected', () => {
    const store = createStore();
    store.dispatch({
      type: loadHomePromoteItems.fulfilled.type,
      payload: { items: [item('a')], imagesByKey: {}, language: 'en-US', loadedAt: 1 },
      meta: { arg: 'en-US' },
    });

    store.dispatch({ type: loadHomePromoteItems.pending.type, meta: { arg: 'en-US' } });
    store.dispatch({ type: loadHomePromoteItems.rejected.type, error: { message: 'ipc down' }, meta: { arg: 'en-US' } });

    const state = store.getState().homePromote;
    assert.equal(state.loading, false);
    assert.deepEqual(state.items, [item('a')]);
  });

  it('exposes items, images and loading through selectors', () => {
    const store = createStore();
    store.dispatch({
      type: loadHomePromoteItems.fulfilled.type,
      payload: { items: [item('a', 'k1')], imagesByKey: { k1: 'data:x' }, language: 'en-US', loadedAt: 2 },
      meta: { arg: 'en-US' },
    });

    assert.deepEqual(selectHomePromoteItems(store.getState()), [item('a', 'k1')]);
    assert.deepEqual(selectHomePromoteImagesByKey(store.getState()), { k1: 'data:x' });
    assert.equal(selectHomePromoteLoading(store.getState()), false);
  });
});

describe('loadHomePromoteItems thunk', () => {
  it('requests items for the given language and resolves each image once', async () => {
    const { imageRequests } = installBridge({
      getItems: async () => ({ items: [item('a', 'k1'), item('b', 'k1'), item('c', 'k2'), item('d')] }),
    });
    const store = createStore();

    await store.dispatch(loadHomePromoteItems('ja-JP'));

    assert.deepEqual([...imageRequests].sort(), ['k1', 'k2']);
    const state = store.getState().homePromote;
    assert.equal(state.language, 'ja-JP');
    assert.equal(state.items.length, 4);
    assert.deepEqual(state.imagesByKey, {
      k1: 'data:image/png;base64,k1',
      k2: 'data:image/png;base64,k2',
    });
    assert.equal(state.loading, false);
  });

  it('passes the requested language to the bridge', async () => {
    const { languageRequests } = installBridge();
    const store = createStore();

    await store.dispatch(loadHomePromoteItems('de-DE'));

    assert.deepEqual(languageRequests, ['de-DE']);
  });

  it('reuses images already cached in state instead of requesting them again', async () => {
    const { imageRequests } = installBridge({
      getItems: async () => ({ items: [item('a', 'k1'), item('b', 'k2')] }),
    });
    const store = createStore();
    store.dispatch({
      type: loadHomePromoteItems.fulfilled.type,
      payload: { items: [], imagesByKey: { k1: 'data:cached-k1' }, language: 'en-US', loadedAt: 1 },
      meta: { arg: 'en-US' },
    });

    await store.dispatch(loadHomePromoteItems('en-US'));

    assert.deepEqual(imageRequests, ['k2']);
    assert.deepEqual(store.getState().homePromote.imagesByKey, {
      k1: 'data:cached-k1',
      k2: 'data:image/png;base64,k2',
    });
  });

  it('drops cached images whose keys are no longer referenced by any item', async () => {
    installBridge({
      getItems: async () => ({ items: [item('a', 'keep')] }),
    });
    const store = createStore();
    store.dispatch({
      type: loadHomePromoteItems.fulfilled.type,
      payload: {
        items: [],
        imagesByKey: { keep: 'data:old-keep', stale: 'data:stale' },
        language: 'en-US',
        loadedAt: 1,
      },
      meta: { arg: 'en-US' },
    });

    await store.dispatch(loadHomePromoteItems('en-US'));

    assert.deepEqual(store.getState().homePromote.imagesByKey, { keep: 'data:old-keep' });
  });

  it('keeps an item without an image when the bridge returns no data URL', async () => {
    installBridge({
      getItems: async () => ({ items: [item('a', 'k1')] }),
      getImage: async () => ({ dataUrl: null }),
    });
    const store = createStore();

    await store.dispatch(loadHomePromoteItems('en-US'));

    const state = store.getState().homePromote;
    assert.deepEqual(state.items, [item('a', 'k1')]);
    assert.deepEqual(state.imagesByKey, {});
    assert.equal(state.loading, false);
  });

  it('treats a rejected image request as a missing image', async () => {
    installBridge({
      getItems: async () => ({ items: [item('a', 'k1'), item('b', 'k2')] }),
      getImage: async ({ key }) => {
        if (key === 'k1') throw new Error('image read failed');
        return { dataUrl: `data:image/png;base64,${key}` };
      },
    });
    const store = createStore();

    await store.dispatch(loadHomePromoteItems('en-US'));

    const state = store.getState().homePromote;
    assert.equal(state.items.length, 2);
    assert.deepEqual(state.imagesByKey, { k2: 'data:image/png;base64,k2' });
    assert.equal(state.loading, false);
  });

  it('records the load time when the load succeeds', async () => {
    installBridge();
    const store = createStore();
    const before = Date.now();

    await store.dispatch(loadHomePromoteItems('en-US'));

    const { loadedAt } = store.getState().homePromote;
    assert.equal(typeof loadedAt, 'number');
    assert.ok(loadedAt !== null && loadedAt >= before && loadedAt <= Date.now());
  });

  it('resolves to no change when the promote bridge is missing', async () => {
    removeBridge();
    const store = createStore();

    const result = await store.dispatch(loadHomePromoteItems('en-US'));

    assert.equal(result.payload, null);
    const state = store.getState().homePromote;
    assert.deepEqual(state.items, []);
    assert.equal(state.language, null);
    assert.equal(state.loadedAt, null);
    assert.equal(state.loading, false);
  });

  it('rejects and keeps previous data when the item request fails', async () => {
    installBridge({
      getItems: async () => {
        throw new Error('ipc unavailable');
      },
    });
    const store = createStore();
    store.dispatch({
      type: loadHomePromoteItems.fulfilled.type,
      payload: { items: [item('a')], imagesByKey: {}, language: 'en-US', loadedAt: 1 },
      meta: { arg: 'en-US' },
    });

    const result = await store.dispatch(loadHomePromoteItems('en-US'));

    assert.equal(result.meta.requestStatus, 'rejected');
    const state = store.getState().homePromote;
    assert.deepEqual(state.items, [item('a')]);
    assert.equal(state.loading, false);
  });
});
