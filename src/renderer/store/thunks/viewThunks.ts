import { createAsyncThunk } from '@reduxjs/toolkit';
import type { RootState } from '../index';
import { switchView, setViewSwitching, updateWebServiceUrl } from '../slices/viewSlice';

/**
 * Initialize view on app startup
 * Replaces viewSaga/initializeViewSaga
 */
export const initializeView = createAsyncThunk(
  'view/initialize',
  async (_, { dispatch, getState }) => {
    try {
      // Can be used to restore last view from persistent storage
      // For now, default view is 'system' which is set in initialState
      console.log('[View] View initialized');
      return null;
    } catch (error) {
      console.error('[View] Error initializing view:', error);
      throw error;
    }
  }
);

/**
 * Switch view with optional web service URL update
 * This replaces the viewSaga handleSwitchView logic
 * The view switch is handled by the reducer, this just adds optional side effects
 */
export const switchViewWithSideEffects = createAsyncThunk(
  'view/switchWithSideEffects',
  async (targetView: 'system' | 'web' | 'version' | 'license' | 'settings', { dispatch, getState }) => {
    try {
      const state = getState() as RootState;

      // If switching to web view, check if web service is running
      if (targetView === 'web') {
        const webServiceStatus = state.webService.status;
        const webServiceUrl = state.webService.url;

        // Update URL if service is running
        if (webServiceStatus === 'running' && webServiceUrl) {
          dispatch(updateWebServiceUrl(webServiceUrl));
        } else {
          // Web service is not running, log warning
          // The UI component will handle this case and show a dialog
          console.warn('[View] Web service is not running');
        }
      }

      // Dispatch the actual view switch
      dispatch(switchView(targetView));

      return targetView;
    } catch (error) {
      console.error('[View] Error switching view:', error);
      throw error;
    }
  }
);
