import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import webServiceReducer from './slices/webServiceSlice';
import i18nReducer from './slices/i18nSlice';
import dependencyReducer from './slices/dependencySlice';
import { webServiceSaga, initializeWebServiceSaga } from './sagas/webServiceSaga';
import { i18nSaga, initializeI18nSaga } from './sagas/i18nSaga';
import { dependencySaga, initializeDependencySaga } from './sagas/dependencySaga';

// Create saga middleware
const sagaMiddleware = createSagaMiddleware();

// Configure store
export const store = configureStore({
  reducer: {
    webService: webServiceReducer,
    i18n: i18nReducer,
    dependency: dependencyReducer,
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

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
