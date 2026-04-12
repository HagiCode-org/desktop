import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { configureStore } from '@reduxjs/toolkit';
import type { StoredPackageSourceConfig } from '../../../../main/package-source-config-manager.js';
import { OFFICIAL_SERVER_HTTP_INDEX_URL } from '../../../../shared/package-source-defaults.js';
import {
  hasPackageSourceDraftChanges,
  resolveSourceTypeChange,
} from '../../../components/packageSourceSelectorState.js';
import reducer, {
  setAllConfigs,
  setCurrentConfig,
  setFolderPath,
  setSelectedSourceType,
} from '../packageSourceSlice.js';
import { setSourceConfig } from '../../thunks/packageSourceThunks.js';

const originalWindow = globalThis.window;

function createStore() {
  return configureStore({
    reducer: {
      packageSource: reducer,
    },
  });
}

function mockWindow(overrides: Partial<Window['electronAPI']['packageSource']>) {
  const packageSource = {
    getConfig: async () => null,
    getAllConfigs: async () => [],
    setConfig: async () => ({ success: true }),
    switchSource: async () => ({ success: true }),
    validateConfig: async () => ({ valid: true }),
    scanFolder: async () => ({ success: true, versions: [], count: 0 }),
    fetchHttpIndex: async () => ({ success: true, versions: [], count: 0 }),
    ...overrides,
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electronAPI: {
        packageSource,
        version: {
          setChannel: async () => ({ success: true }),
        },
      },
    },
  });

  return packageSource;
}

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: Window }).window;
    return;
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
});

describe('package source draft flow', () => {
  it('switches from http-index to a new local-folder source as an unsaved draft', () => {
    const store = createStore();
    const httpIndexConfig: StoredPackageSourceConfig = {
      id: 'http-index-default',
      type: 'http-index',
      name: 'Official',
      indexUrl: OFFICIAL_SERVER_HTTP_INDEX_URL,
      createdAt: '2026-04-11T00:00:00.000Z',
    };

    store.dispatch(setCurrentConfig(httpIndexConfig));
    store.dispatch(setAllConfigs([httpIndexConfig]));

    const nextAction = resolveSourceTypeChange([httpIndexConfig], 'local-folder');

    assert.deepEqual(nextAction, {
      kind: 'edit-draft',
      sourceType: 'local-folder',
    });

    store.dispatch(setSelectedSourceType('local-folder'));

    const state = store.getState().packageSource;
    assert.equal(state.currentConfig?.type, 'http-index');
    assert.equal(state.selectedSourceType, 'local-folder');
    assert.equal(
      hasPackageSourceDraftChanges({
        currentConfig: state.currentConfig,
        sourceType: state.selectedSourceType,
        folderPath: state.folderPath,
        httpIndexUrl: state.httpIndexUrl,
      }),
      true,
    );
  });

  it('persists a valid local-folder draft only when save is triggered explicitly', async () => {
    const store = createStore();
    const httpIndexConfig: StoredPackageSourceConfig = {
      id: 'http-index-default',
      type: 'http-index',
      name: 'Official',
      indexUrl: OFFICIAL_SERVER_HTTP_INDEX_URL,
      createdAt: '2026-04-11T00:00:00.000Z',
    };
    const localFolderConfig: StoredPackageSourceConfig = {
      id: 'source-2',
      type: 'local-folder',
      name: 'Local folder source',
      path: '/tmp/release-packages',
      createdAt: '2026-04-11T00:01:00.000Z',
    };

    const setConfigCalls: Array<{ type: string; name?: string; path?: string }> = [];
    let getConfigCalls = 0;
    let getAllConfigsCalls = 0;

    mockWindow({
      setConfig: async (config) => {
        setConfigCalls.push(config);
        return { success: true };
      },
      getConfig: async () => {
        getConfigCalls += 1;
        return localFolderConfig;
      },
      getAllConfigs: async () => {
        getAllConfigsCalls += 1;
        return [httpIndexConfig, localFolderConfig];
      },
    });

    store.dispatch(setCurrentConfig(httpIndexConfig));
    store.dispatch(setAllConfigs([httpIndexConfig]));
    store.dispatch(setSelectedSourceType('local-folder'));
    store.dispatch(setFolderPath(localFolderConfig.path || ''));

    await store.dispatch(setSourceConfig({
      type: 'local-folder',
      name: 'Local folder source',
      path: localFolderConfig.path || '',
    }));

    const state = store.getState().packageSource;
    assert.deepEqual(setConfigCalls, [{
      type: 'local-folder',
      name: 'Local folder source',
      path: '/tmp/release-packages',
    }]);
    assert.equal(getConfigCalls, 1);
    assert.equal(getAllConfigsCalls, 1);
    assert.equal(state.currentConfig?.type, 'local-folder');
    assert.equal(state.currentConfig?.path, '/tmp/release-packages');
    assert.equal(state.selectedSourceType, 'local-folder');
    assert.equal(state.folderPath, '/tmp/release-packages');
    assert.equal(state.allConfigs.some(config => config.type === 'local-folder'), true);
  });

  it('keeps the previous saved source active when local-folder save fails validation', async () => {
    const store = createStore();
    const httpIndexConfig: StoredPackageSourceConfig = {
      id: 'http-index-default',
      type: 'http-index',
      name: 'Official',
      indexUrl: OFFICIAL_SERVER_HTTP_INDEX_URL,
      createdAt: '2026-04-11T00:00:00.000Z',
    };

    const setConfigCalls: Array<{ type: string; name?: string; path?: string }> = [];
    let getConfigCalls = 0;
    let getAllConfigsCalls = 0;

    mockWindow({
      setConfig: async (config) => {
        setConfigCalls.push(config);
        return {
          success: false,
          error: 'Local folder source requires a path',
        };
      },
      getConfig: async () => {
        getConfigCalls += 1;
        return httpIndexConfig;
      },
      getAllConfigs: async () => {
        getAllConfigsCalls += 1;
        return [httpIndexConfig];
      },
    });

    store.dispatch(setCurrentConfig(httpIndexConfig));
    store.dispatch(setAllConfigs([httpIndexConfig]));
    store.dispatch(setSelectedSourceType('local-folder'));
    store.dispatch(setFolderPath(''));

    await store.dispatch(setSourceConfig({
      type: 'local-folder',
      name: 'Local folder source',
      path: '',
    }));

    const state = store.getState().packageSource;
    assert.deepEqual(setConfigCalls, [{
      type: 'local-folder',
      name: 'Local folder source',
      path: '',
    }]);
    assert.equal(getConfigCalls, 0);
    assert.equal(getAllConfigsCalls, 0);
    assert.equal(state.currentConfig?.type, 'http-index');
    assert.equal(state.selectedSourceType, 'local-folder');
    assert.equal(state.error, 'Local folder source requires a path');
    assert.equal(state.validationError, 'Local folder source requires a path');
  });
});
