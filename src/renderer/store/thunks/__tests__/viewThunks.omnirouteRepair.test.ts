import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { configureStore } from '@reduxjs/toolkit';
import viewReducer, { setDependencyManagementIntent, switchView } from '../../slices/viewSlice.js';
import { openOmniRouteDependencyRepair } from '../viewThunks.js';

function createStore() {
  return configureStore({
    reducer: {
      view: viewReducer,
      webService: (state = { status: 'stopped', url: null }) => state,
    },
  });
}

describe('OmniRoute repair navigation thunk', () => {
  it('stores the repair intent and switches to dependency management', async () => {
    const store = createStore();
    store.dispatch(switchView('omniroute'));

    await store.dispatch(openOmniRouteDependencyRepair({
      kind: 'dependency',
      failureKind: 'runtime-and-package',
      targetRuntimeIds: ['omniroute'],
      targetPackageIds: ['pm2'],
      recommendedAction: 'open-dependency-management',
      message: 'Restore the OmniRoute runtime and PM2 from Dependency Management and retry.',
    }));

    const state = store.getState().view;
    assert.equal(state.currentView, 'dependency-management');
    assert.equal(state.previousView, 'omniroute');
    assert.deepEqual(state.dependencyManagementIntent, {
      sourceView: 'omniroute',
      returnView: 'omniroute',
      failureKind: 'runtime-and-package',
      targetRuntimeIds: ['omniroute'],
      targetPackageIds: ['pm2'],
    });
  });

  it('clears transient repair intent when the user leaves dependency management', () => {
    const store = createStore();

    store.dispatch(setDependencyManagementIntent({
      sourceView: 'omniroute',
      returnView: 'omniroute',
      failureKind: 'dependency-unknown',
      targetRuntimeIds: [],
      targetPackageIds: ['pm2'],
    }));
    store.dispatch(switchView('dependency-management'));
    store.dispatch(switchView('system'));

    assert.equal(store.getState().view.dependencyManagementIntent, null);
  });
});
