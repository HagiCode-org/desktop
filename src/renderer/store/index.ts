import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import webServiceReducer from './slices/webServiceSlice';
import i18nReducer from './slices/i18nSlice';
import dependencyReducer from './slices/dependencySlice';
import viewReducer from './slices/viewSlice';
import packageSourceReducer from './slices/packageSourceSlice';
import licenseReducer from './slices/licenseSlice';
import onboardingReducer from './slices/onboardingSlice';
import rssFeedReducer from './slices/rssFeedSlice';
import { webServiceSaga, initializeWebServiceSaga } from './sagas/webServiceSaga';
import { i18nSaga, initializeI18nSaga } from './sagas/i18nSaga';
import { dependencySaga, initializeDependencySaga } from './sagas/dependencySaga';
import { viewSaga, initializeViewSaga } from './sagas/viewSaga';
import { packageSourceSaga, initializePackageSourceSaga } from './sagas/packageSourceSaga';
import { licenseSaga, initializeLicenseSaga } from './sagas/licenseSaga';
import { rssFeedSaga, initializeRSSFeedSaga } from './sagas/rssFeedSaga';
import { checkOnboardingTrigger } from './thunks/onboardingThunks';

// Redux logger to track all actions
const reduxLogger = (store) => (next) => (action) => {
  if (action.type.startsWith('onboarding/')) {
    console.log('[Redux] Action:', action.type, 'payload:', action.payload);
  }
  return next(action);
};

// Create saga middleware
const sagaMiddleware = createSagaMiddleware();

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
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['redux-saga/SAGA_TASK', 'webService/startSaga', 'webService/stopSaga'],
      },
    }).concat(reduxLogger).concat(sagaMiddleware),
  devTools: process.env.NODE_ENV !== 'production',
});

// Run the root saga
sagaMiddleware.run(webServiceSaga);

// Initialize data on startup
sagaMiddleware.run(initializeWebServiceSaga);

// Initialize i18n
sagaMiddleware.run(i18nSaga);
store.dispatch({ type: 'i18n/initialize' });

// Initialize dependencies
sagaMiddleware.run(dependencySaga);
store.dispatch({ type: 'dependency/fetchDependencies' });

// Initialize view
sagaMiddleware.run(viewSaga);
store.dispatch({ type: 'view/initialize' });

// Initialize package source
sagaMiddleware.run(packageSourceSaga);
store.dispatch({ type: 'packageSource/loadConfig' });
store.dispatch({ type: 'packageSource/loadAllConfigs' });

// Initialize license
sagaMiddleware.run(licenseSaga);
store.dispatch({ type: 'license/fetch' });

// Initialize onboarding (using thunk instead of saga)
store.dispatch(checkOnboardingTrigger());

// Initialize RSS feed
sagaMiddleware.run(rssFeedSaga);
sagaMiddleware.run(initializeRSSFeedSaga);

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
