import { configureStore } from '@reduxjs/toolkit';
import webServiceReducer from './slices/webServiceSlice';
import i18nReducer from './slices/i18nSlice';
import dependencyReducer from './slices/dependencySlice';
import viewReducer from './slices/viewSlice';
import packageSourceReducer from './slices/packageSourceSlice';
import licenseReducer from './slices/licenseSlice';
import onboardingReducer from './slices/onboardingSlice';
import rssFeedReducer from './slices/rssFeedSlice';
import claudeConfigReducer from './slices/claudeConfigSlice';
import llmInstallationReducer from './slices/llmInstallationSlice';
import listenerMiddleware from './listenerMiddleware';
import { setProcessInfo } from './slices/webServiceSlice';
import { updateWebServiceUrl } from './slices/viewSlice';

// Import thunks for initialization
import { initializeI18n } from './thunks/i18nThunks';
import { initializeView } from './thunks/viewThunks';
import { initializeLicense } from './thunks/licenseThunks';
import { initializePackageSource } from './thunks/packageSourceThunks';
import { initializeWebService } from './thunks/webServiceThunks';
import { initializeDependency } from './thunks/dependencyThunks';
import { initializeRSSFeed } from './thunks/rssFeedThunks';
import { checkOnboardingTrigger } from './thunks/onboardingThunks';

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
    license: licenseReducer,
    onboarding: onboardingReducer,
    rssFeed: rssFeedReducer,
    claudeConfig: claudeConfigReducer,
    llmInstallation: llmInstallationReducer,
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

// Initialize data on startup using thunks instead of sagas

// Initialize i18n
store.dispatch(initializeI18n());

// Initialize dependencies
store.dispatch(initializeDependency());

// Initialize view
store.dispatch(initializeView());

// Initialize package source
store.dispatch(initializePackageSource());

// Initialize license
store.dispatch(initializeLicense());

// Initialize onboarding (using thunk instead of saga)
store.dispatch(checkOnboardingTrigger());

// Initialize RSS feed
store.dispatch(initializeRSSFeed());

// Initialize web service (must be last as it may depend on other modules)
store.dispatch(initializeWebService());

// Set up main process event listeners for real-time updates
// These replace the saga fork watchers

// Listen for web service status changes from main process
if (typeof window !== 'undefined') {
  window.electronAPI.onActiveVersionChanged?.((version: any) => {
    store.dispatch({ type: 'webService/setActiveVersion', payload: version });
    console.log('Active version changed:', version);
  });

  window.electronAPI.onWebServiceStatusChange?.((status: any) => {
    store.dispatch(setProcessInfo(status));
    console.log('Web service status changed:', status);
  });

  // Set up polling as backup for web service status
  setInterval(async () => {
    try {
      const status = await window.electronAPI.getWebServiceStatus();
      store.dispatch(setProcessInfo(status));
    } catch (error) {
      console.error('Watch web service status error:', error);
    }
  }, 5000); // Poll every 5 seconds

  // Listen for package install progress
  window.electronAPI.onPackageInstallProgress?.((progress: any) => {
    console.log('Package install progress:', progress);
    store.dispatch({ type: 'webService/setInstallProgress', payload: progress });
  });

  // Listen for version dependency warnings
  window.electronAPI.onVersionDependencyWarning?.((warning: { missing: any[] }) => {
    console.log('Version dependency warning:', warning);
    store.dispatch({ type: 'webService/showStartConfirmDialog', payload: warning.missing });
  });
}

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
