import { createAsyncThunk } from '@reduxjs/toolkit';
import type { ServiceRegion, ServiceRegionState, SetServiceRegionResult } from '../../../types/service-region.js';
import {
  setServiceRegionError,
  setServiceRegionLoading,
  setServiceRegionSaving,
  setServiceRegionState,
} from '../slices/serviceRegionSlice.js';
import { loadAllSourceConfigs, loadSourceConfig } from './packageSourceThunks.js';
import { setAvailableVersions } from '../slices/packageSourceSlice.js';
import { fetchVersionUpdateSnapshot } from '../slices/versionUpdateSlice.js';

declare global {
  interface Window {
    electronAPI: {
      serviceRegion: {
        get: () => Promise<ServiceRegionState>;
        set: (region: ServiceRegion) => Promise<SetServiceRegionResult>;
        resetPreference: () => Promise<SetServiceRegionResult>;
      };
    };
  }
}

export const loadServiceRegion = createAsyncThunk(
  'serviceRegion/load',
  async (_, { dispatch }) => {
    dispatch(setServiceRegionLoading(true));
    dispatch(setServiceRegionError(null));
    try {
      const state = await window.electronAPI.serviceRegion.get();
      dispatch(setServiceRegionState(state));
      return state;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load service region';
      dispatch(setServiceRegionError(message));
      throw error;
    } finally {
      dispatch(setServiceRegionLoading(false));
    }
  },
);

export const setServiceRegion = createAsyncThunk(
  'serviceRegion/set',
  async (region: ServiceRegion, { dispatch }) => {
    dispatch(setServiceRegionSaving(true));
    dispatch(setServiceRegionError(null));
    try {
      const result = await window.electronAPI.serviceRegion.set(region);
      if (!result.success || !result.state) {
        if (result.state) {
          dispatch(setServiceRegionState(result.state));
        }
        dispatch(setServiceRegionError(result.error ?? 'Failed to change service region'));
        dispatch(setServiceRegionSaving(false));
        return result;
      }

      dispatch(setServiceRegionState(result.state));
      await Promise.all([
        dispatch(loadSourceConfig()),
        dispatch(loadAllSourceConfigs()),
        dispatch(fetchVersionUpdateSnapshot()),
      ]);
      dispatch(setAvailableVersions([]));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change service region';
      dispatch(setServiceRegionError(message));
      throw error;
    } finally {
      dispatch(setServiceRegionSaving(false));
    }
  },
);

export const resetServiceRegionPreference = createAsyncThunk(
  'serviceRegion/resetPreference',
  async (_, { dispatch }) => {
    dispatch(setServiceRegionSaving(true));
    dispatch(setServiceRegionError(null));
    try {
      const result = await window.electronAPI.serviceRegion.resetPreference();
      if (result.state) {
        dispatch(setServiceRegionState(result.state));
      }
      if (!result.success) {
        dispatch(setServiceRegionError(result.error ?? 'Failed to reset service region'));
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reset service region';
      dispatch(setServiceRegionError(message));
      throw error;
    } finally {
      dispatch(setServiceRegionSaving(false));
    }
  },
);
