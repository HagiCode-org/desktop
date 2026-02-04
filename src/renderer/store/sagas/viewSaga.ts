import { call, put, takeEvery, select } from 'redux-saga/effects';
import { PayloadAction } from '@reduxjs/toolkit';
import { switchView, setViewSwitching, updateWebServiceUrl } from '../slices/viewSlice';
import { RootState } from '../store';
import { ViewType } from '../slices/viewSlice';

// Worker saga: handles view switching logic
function* handleSwitchView(action: PayloadAction<ViewType>) {
  const targetView: ViewType = action.payload;

  try {
    yield put(setViewSwitching(true));

    // If switching to web view, check if web service is running
    if (targetView === 'web') {
      const webServiceStatus: ReturnType<(state: RootState) => import('../../slices/webServiceSlice').WebServiceState> = yield select(
        (state: RootState) => state.webService
      );

      // Check if web service URL is available
      if (webServiceStatus.status === 'running' && webServiceStatus.url) {
        yield put(updateWebServiceUrl(webServiceStatus.url));
      } else {
        // Web service is not running, dispatch an action that can be handled by UI
        // to show a confirmation dialog
        console.warn('[ViewSaga] Web service is not running');
        // The UI component will handle this case and show a dialog
      }
    }

    // The actual view switch is handled by the reducer in switchView action
    yield put(switchView(targetView));

    yield put(setViewSwitching(false));
  } catch (error) {
    console.error('[ViewSaga] Error switching view:', error);
    yield put(setViewSwitching(false));
  }
}

// Watcher saga: watches for view switch actions
export function* viewSaga() {
  yield takeEvery('view/switchView', handleSwitchView);
}

// Initialization saga (can be used for initial view setup)
export function* initializeViewSaga() {
  try {
    // Can be used to restore last view from persistent storage
    // For now, default view is 'system' which is set in initialState
    console.log('[ViewSaga] View initialized');
  } catch (error) {
    console.error('[ViewSaga] Error initializing view:', error);
  }
}
