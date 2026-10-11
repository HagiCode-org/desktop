import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import type { PromoteManager } from '../promote-manager.js';

type Listener = (event: unknown, request: unknown) => Promise<unknown>;

const require = createRequire(import.meta.url);
const electronPath = require.resolve('electron');
const listeners = new Map<string, Listener>();

require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    ipcMain: {
      handle: (channel: string, listener: Listener) => {
        listeners.set(channel, listener);
      },
    },
  },
} as unknown as NodeJS.Module;

const { registerPromoteHandlers } = await import('../ipc/handlers/promoteHandlers.js');

const GET_ITEMS = 'promote:get-items';
const GET_IMAGE = 'promote:get-image';

function createManager(overrides: Partial<Pick<PromoteManager, 'getItems' | 'getImage'>> = {}) {
  const calls: Array<{ method: 'getItems' | 'getImage'; argument: string }> = [];
  const manager = {
    getItems: async (language: string) => {
      calls.push({ method: 'getItems', argument: language });
      return [{ id: 'item', title: 'Title', description: 'Body', link: 'https://example.com/item' }];
    },
    getImage: async (key: string) => {
      calls.push({ method: 'getImage', argument: key });
      return `data:image/png;base64,${key}`;
    },
    ...overrides,
  } as unknown as PromoteManager;
  return { manager, calls };
}

function invoke(channel: string, request: unknown): Promise<unknown> {
  const listener = listeners.get(channel);
  assert.ok(listener, `handler not registered for ${channel}`);
  return listener({}, request);
}

describe('promote IPC handlers', () => {
  it('registers exactly the get-items and get-image channels', () => {
    listeners.clear();
    registerPromoteHandlers(createManager().manager);

    assert.deepEqual([...listeners.keys()].sort(), [GET_IMAGE, GET_ITEMS]);
  });

  it('returns the manager items for a valid language request', async () => {
    listeners.clear();
    const { manager, calls } = createManager();
    registerPromoteHandlers(manager);

    const result = await invoke(GET_ITEMS, { language: 'zh-CN' });

    assert.deepEqual(result, {
      items: [{ id: 'item', title: 'Title', description: 'Body', link: 'https://example.com/item' }],
    });
    assert.deepEqual(calls, [{ method: 'getItems', argument: 'zh-CN' }]);
  });

  it('returns an empty item list without calling the manager for invalid requests', async () => {
    listeners.clear();
    const { manager, calls } = createManager();
    registerPromoteHandlers(manager);

    for (const request of [undefined, null, 'zh-CN', {}, { language: 3 }]) {
      assert.deepEqual(await invoke(GET_ITEMS, request), { items: [] });
    }
    assert.deepEqual(calls, []);
  });

  it('returns an empty item list when the manager throws', async () => {
    listeners.clear();
    const { manager } = createManager({
      getItems: async () => {
        throw new Error('index unavailable');
      },
    });
    registerPromoteHandlers(manager);

    assert.deepEqual(await invoke(GET_ITEMS, { language: 'en-US' }), { items: [] });
  });

  it('returns the data URL for a valid image key', async () => {
    listeners.clear();
    const { manager, calls } = createManager();
    registerPromoteHandlers(manager);
    const key = 'a'.repeat(32);

    assert.deepEqual(await invoke(GET_IMAGE, { key }), { dataUrl: `data:image/png;base64,${key}` });
    assert.deepEqual(calls, [{ method: 'getImage', argument: key }]);
  });

  it('returns a null data URL for invalid requests and manager failures', async () => {
    listeners.clear();
    const { manager, calls } = createManager({
      getImage: async () => {
        throw new Error('read failed');
      },
    });
    registerPromoteHandlers(manager);

    for (const request of [undefined, null, {}, { key: 7 }]) {
      assert.deepEqual(await invoke(GET_IMAGE, request), { dataUrl: null });
    }
    assert.deepEqual(await invoke(GET_IMAGE, { key: 'b'.repeat(32) }), { dataUrl: null });
    assert.deepEqual(calls, []);
  });
});
