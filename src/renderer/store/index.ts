import { configureStore } from '@reduxjs/toolkit';
import webServiceReducer from './slices/webServiceSlice';
import i18nReducer from './slices/i18nSlice';
import dependencyReducer from './slices/dependencySlice';
import viewReducer from './slices/viewSlice';
import packageSourceReducer from './slices/packageSourceSlice';
import onboardingReducer from './slices/onboardingSlice';
import rssFeedReducer from './slices/rssFeedSlice';
import claudeConfigReducer from './slices/claudeConfigSlice';
import agentCliReducer from './slices/agentCliSlice';
import llmInstallationReducer from './slices/llmInstallationSlice';
import dataDirectoryReducer from './slices/dataDirectorySlice';
import remoteModeReducer from './slices/remoteModeSlice';
import versionUpdateReducer, {
  fetchVersionAutoUpdateSettings,
  fetchVersionUpdateSnapshot,
  setVersionUpdateSnapshotFromEvent,
} from './slices/versionUpdateSlice';
import listenerMiddleware from './listenerMiddleware';
import { setProcessInfo } from './slices/webServiceSlice';
import { updateWebServiceUrl } from './slices/viewSlice';
import type { Dispatch } from '@reduxjs/toolkit';

// App dispatch type combining all slice dispatches
export type AppDispatch = Dispatch<
  | typeof import('./slices/webServiceSlice').actions
  | typeof import('./slices/i18nSlice').actions
  | typeof import('./slices/dependencySlice').actions
  | typeof import('./slices/viewSlice').actions
  | typeof import('./slices/packageSourceSlice').actions
  | typeof import('./slices/onboardingSlice').actions
  | typeof import('./slices/rssFeedSlice').actions
  | typeof import('./slices/claudeConfigSlice').actions
  | typeof import('./slices/agentCliSlice').actions
  | typeof import('./slices/llmInstallationSlice').actions
  | typeof import('./slices/dataDirectorySlice').actions
  | typeof import('./slices/remoteModeSlice').actions
  | typeof import('./slices/versionUpdateSlice').actions
>;

// Import thunks for initialization
import { initializeI18n } from './thunks/i18nThunks';
import { initializeView } from './thunks/viewThunks';
import { initializePackageSource } from './thunks/packageSourceThunks';
import { initializeWebService } from './thunks/webServiceThunks';
import { initializeDependency } from './thunks/dependencyThunks';
import { initializeRSSFeed } from './thunks/rssFeedThunks';
import { checkOnboardingTrigger } from './thunks/onboardingThunks';
import { initializeRemoteMode } from './thunks/remoteModeThunks';

// Redux logger to track all actions
const reduxLogger = (store) => (next) => (action) => {
  if (action.type.startsWith('onboarding/')) {
    console.log('[Redux] Action:', action.type, 'payload:', action.payload);
  }
  return next(action);
};

// Configure store
export const store = configureStore({
  reducer: {
    webService: webServiceReducer,
    i18n: i18nReducer,
    dependency: dependencyReducer,
    view: viewReducer,
    packageSource: packageSourceReducer,
    onboarding: onboardingReducer,
    rssFeed: rssFeedReducer,
    claudeConfig: claudeConfigReducer,
    agentCli: agentCliReducer,
    llmInstallation: llmInstallationReducer,
    dataDirectory: dataDirectoryReducer,
    remoteMode: remoteModeReducer,
    versionUpdate: versionUpdateReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types (for listener middleware callbacks)
        ignoredActions: [],
      },
    }).concat(reduxLogger).concat(listenerMiddleware.middleware),
  devTools: process.env.NODE_ENV !== 'production',
});

let criticalInitializationPromise: Promise<void> | null = null;
let backgroundInitializationStarted = false;
let realtimeListenersRegistered = false;
let webServicePollingHandle: ReturnType<typeof setInterval> | null = null;

// Set up listener middleware for state change monitoring
// This replaces the saga event watching capabilities

// Listen for web service status changes and update URL automatically
listenerMiddleware.startListening({
  predicate: (action) => action.type === 'webService/setProcessInfo',
  effect: (action, listenerApi) => {
    const state = listenerApi.getState();
    const currentView = state.view.currentView;
    const payload = action.payload as any;

    // If currently on web view, update the URL when service status changes
    if (currentView === 'web' && payload.url) {
      listenerApi.dispatch(updateWebServiceUrl(payload.url));
    }
  },
});

// Listen for dependency check after install trigger
listenerMiddleware.startListening({
  predicate: (action) => action.type === 'webService/checkDependenciesAfterInstall',
  effect: async (action, listenerApi) => {
    const payload = action.payload as { versionId: string };
    // Check for missing dependencies
    const missingDeps = await window.electronAPI.getMissingDependencies(payload.versionId);
    if (missingDeps.length > 0) {
      listenerApi.dispatch({
        type: 'dependency/fetchDependenciesSuccess',
        payload: missingDeps,
      });
    }
  },
});

function registerRealtimeListeners(): void {
  if (realtimeListenersRegistered || typeof window === 'undefined') {
    return;
  }

  realtimeListenersRegistered = true;

  window.electronAPI.onActiveVersionChanged?.((version: any) => {
    store.dispatch({ type: 'webService/setActiveVersion', payload: version });
    console.log('Active version changed:', version);
  });

  window.electronAPI.onWebServiceStatusChange?.((status: any) => {
    store.dispatch(setProcessInfo(status));
    console.log('Web service status changed:', status);
  });

  window.electronAPI.onVersionUpdateChanged?.((snapshot: any) => {
    store.dispatch(setVersionUpdateSnapshotFromEvent(snapshot));
  });

  window.electronAPI.onPackageInstallProgress?.((progress: any) => {
    console.log('Package install progress:', progress);
    store.dispatch({
      type: 'webService/setInstallProgress',
      payload: {
        ...progress,
        progress: typeof progress?.progress === 'number' ? progress.progress : progress?.percentage ?? 0,
        message: progress?.message || progress?.stage || 'installing',
      },
    });
  });

  if (!webServicePollingHandle) {
    webServicePollingHandle = setInterval(async () => {
      try {
        const status = await window.electronAPI.getWebServiceStatus();
        store.dispatch(setProcessInfo(status));
      } catch (error) {
        console.error('Watch web service status error:', error);
      }
    }, 5000);
  }
}

export async function runCriticalStartupInitialization(): Promise<void> {
  if (criticalInitializationPromise) {
    return criticalInitializationPromise;
  }

  criticalInitializationPromise = (async () => {
    await store.dispatch(initializeI18n()).unwrap();
    await Promise.allSettled([
      store.dispatch(initializeView()),
      store.dispatch(checkOnboardingTrigger()),
      store.dispatch(initializeRemoteMode()),
    ]);
  })().catch((error) => {
    criticalInitializationPromise = null;
    throw error;
  });

  return criticalInitializationPromise;
}

export function startBackgroundStartupInitialization(): void {
  if (backgroundInitializationStarted) {
    return;
  }

  backgroundInitializationStarted = true;
  registerRealtimeListeners();

  void Promise.allSettled([
    store.dispatch(initializePackageSource()),
    store.dispatch(initializeDependency()),
    store.dispatch(initializeRSSFeed()),
    store.dispatch(fetchVersionUpdateSnapshot()),
    store.dispatch(fetchVersionAutoUpdateSettings()),
    store.dispatch(initializeWebService()),
  ]);
}

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
