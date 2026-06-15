import { configureStore } from '@reduxjs/toolkit';
import webServiceReducer from './slices/webServiceSlice';
import i18nReducer from './slices/i18nSlice';
import dependencyReducer from './slices/dependencySlice';
import viewReducer from './slices/viewSlice';
import packageSourceReducer from './slices/packageSourceSlice';
import onboardingReducer from './slices/onboardingSlice';
import rssFeedReducer from './slices/rssFeedSlice';
import claudeConfigReducer from './slices/claudeConfigSlice';
import settingsReducer, {
  setNotificationClicked,
  setNotificationShown,
} from './slices/settingsSlice';
import subscriptionReducer, {
  loadSubscriptionSnapshot,
  verifySubscriptionStartup,
  setSubscriptionSnapshotFromEvent,
} from './slices/subscriptionSlice';
import turboEngineLicenseReducer, {
  loadTurboEngineLicenseSnapshot,
  verifyTurboEngineLicenseStartup,
  setTurboEngineLicenseSnapshotFromEvent,
} from './slices/turboEngineLicenseSlice';
import versionUpdateReducer, {
  fetchVersionAutoUpdateSettings,
  fetchVersionUpdateSnapshot,
  setVersionUpdateSnapshotFromEvent,
} from './slices/versionUpdateSlice';
import listenerMiddleware from './listenerMiddleware';
import { setProcessInfo, setStartupPhase } from './slices/webServiceSlice';
import { updateWebServiceUrl } from './slices/viewSlice';

// Import thunks for initialization
import { initializeI18n } from './thunks/i18nThunks';
import { initializeView } from './thunks/viewThunks';
import { initializePackageSource } from './thunks/packageSourceThunks';
import { initializeWebService, startWebService, stopWebService } from './thunks/webServiceThunks';
import { initializeDependency } from './thunks/dependencyThunks';
import { initializeRSSFeed } from './thunks/rssFeedThunks';
import { checkOnboardingTrigger } from './thunks/onboardingThunks';
import type { HagihubApi } from '../../shared/api.js';
import { setStartupStoreLicenseVerificationPromise } from './startupStoreLicenseVerification';

const subscriptionFeatureEnabled = typeof window !== 'undefined'
  && typeof window.electronAPI?.subscription?.getSnapshot === 'function';
const turboEngineLicenseFeatureEnabled = typeof window !== 'undefined'
  && typeof window.electronAPI?.turboEngineLicense?.getSnapshot === 'function';

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
    settings: settingsReducer,
    subscription: subscriptionReducer,
    turboEngineLicense: turboEngineLicenseReducer,
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

// Set up listener middleware for state change monitoring
// This replaces the saga event watching capabilities

// Listen for web service status changes and update URL automatically
listenerMiddleware.startListening({
  predicate: (action) => action.type === 'webService/setProcessInfo',
  effect: (action, listenerApi) => {
    const state = listenerApi.getState();
    const currentView = state.view.currentView;
    const currentWebServiceUrl = state.view.webServiceUrl;
    const payload = action.payload as any;

    // If currently on web view, update the URL when service status changes
    if (currentView === 'web' && payload.url && payload.url !== currentWebServiceUrl) {
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
  const electronAPI = window.electronAPI as typeof window.electronAPI & {
    onTrayStartService?: (callback: () => void) => (() => void) | void;
    onTrayStopService?: (callback: () => void) => (() => void) | void;
    onWebServiceStartupPhaseChange?: (
      callback: (payload: {
        phase: 'idle' | 'checking_version' | 'checking_dependencies' | 'spawning' | 'waiting_listening' | 'health_check' | 'running' | 'error';
        message?: string;
        timestamp: number;
      }) => void,
    ) => (() => void) | void;
    subscription?: {
      onDidChange: (callback: (snapshot: any) => void) => (() => void) | void;
    };
    turboEngineLicense?: {
      onDidChange: (callback: (snapshot: any) => void) => (() => void) | void;
    };
  };
  const hagihub = (window as Window & { hagihub?: HagihubApi }).hagihub;

  electronAPI.onActiveVersionChanged?.((version: any) => {
    store.dispatch({ type: 'webService/setActiveVersion', payload: version });
    console.log('Active version changed:', version);
  });

  electronAPI.onWebServiceStatusChange?.((status: any) => {
    store.dispatch(setProcessInfo(status));
    console.log('Web service status changed:', status);
  });

  electronAPI.onWebServiceStartupPhaseChange?.((payload) => {
    store.dispatch(setStartupPhase({
      phase: payload.phase,
      message: payload.message,
    }));
  });

  electronAPI.onTrayStartService?.(() => {
    void store.dispatch(startWebService());
  });

  electronAPI.onTrayStopService?.(() => {
    void store.dispatch(stopWebService());
  });

  electronAPI.onVersionUpdateChanged?.((snapshot: any) => {
    store.dispatch(setVersionUpdateSnapshotFromEvent(snapshot));
  });

  hagihub?.onNotificationShown?.((payload) => {
    store.dispatch(setNotificationShown(payload));
  });

  hagihub?.onNotificationClicked?.((payload) => {
    store.dispatch(setNotificationClicked(payload));
  });

  electronAPI.onPackageInstallProgress?.((progress: any) => {
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

  if (subscriptionFeatureEnabled) {
    electronAPI.subscription?.onDidChange?.((snapshot: any) => {
      store.dispatch(setSubscriptionSnapshotFromEvent(snapshot));
    });
  }

  if (turboEngineLicenseFeatureEnabled) {
    electronAPI.turboEngineLicense?.onDidChange?.((snapshot: any) => {
      store.dispatch(setTurboEngineLicenseSnapshotFromEvent(snapshot));
    });
  }
}

export async function runCriticalStartupInitialization(): Promise<void> {
  if (criticalInitializationPromise) {
    return criticalInitializationPromise;
  }

  criticalInitializationPromise = (async () => {
    await store.dispatch(initializeI18n()).unwrap();
    await Promise.allSettled([store.dispatch(initializeView())]);
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

  const startupStoreLicenseChecks = [
    ...(subscriptionFeatureEnabled ? [store.dispatch(verifySubscriptionStartup())] : []),
    ...(turboEngineLicenseFeatureEnabled ? [store.dispatch(verifyTurboEngineLicenseStartup())] : []),
  ];
  setStartupStoreLicenseVerificationPromise(
    startupStoreLicenseChecks.length > 0
      ? Promise.allSettled(startupStoreLicenseChecks)
      : null,
  );

  void Promise.allSettled([
    store.dispatch(checkOnboardingTrigger()),
    store.dispatch(initializePackageSource()),
    store.dispatch(initializeDependency()),
    store.dispatch(initializeRSSFeed()),
    store.dispatch(fetchVersionUpdateSnapshot()),
    store.dispatch(fetchVersionAutoUpdateSettings()),
    store.dispatch(initializeWebService()),
    ...(subscriptionFeatureEnabled ? [store.dispatch(loadSubscriptionSnapshot())] : []),
    ...(turboEngineLicenseFeatureEnabled
      ? [store.dispatch(loadTurboEngineLicenseSnapshot())]
      : []),
    ...startupStoreLicenseChecks,
  ]);
}

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
