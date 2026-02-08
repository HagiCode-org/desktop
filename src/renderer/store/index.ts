import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import webServiceReducer from './slices/webServiceSlice';
import i18nReducer from './slices/i18nSlice';
import dependencyReducer from './slices/dependencySlice';
import viewReducer from './slices/viewSlice';
import packageSourceReducer from './slices/packageSourceSlice';
import licenseReducer from './slices/licenseSlice';
import { webServiceSaga, initializeWebServiceSaga } from './sagas/webServiceSaga';
import { i18nSaga, initializeI18nSaga } from './sagas/i18nSaga';
import { dependencySaga, initializeDependencySaga } from './sagas/dependencySaga';
import { viewSaga, initializeViewSaga } from './sagas/viewSaga';
import { packageSourceSaga, initializePackageSourceSaga } from './sagas/packageSourceSaga';
import { licenseSaga, initializeLicenseSaga } from './sagas/licenseSaga';

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
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      thunk: false,
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['redux-saga/SAGA_TASK', 'webService/startSaga', 'webService/stopSaga'],
      },
    }).concat(sagaMiddleware),
  devTools: process.env.NODE_ENV !== 'production',
});

// Run the root saga
sagaMiddleware.run(webServiceSaga);

// Initialize data on startup
sagaMiddleware.run(initializeWebServiceSaga);

// Initialize i18n
sagaMiddleware.run(i18nSaga);
store.dispatch(initializeI18nSaga());

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

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
