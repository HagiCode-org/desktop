import { createAsyncThunk } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type { DownloadProgress, ServiceLaunchProgress } from '../../../types/onboarding';

// Action types
export const CHECK_ONBOARDING_TRIGGER = 'onboarding/checkTrigger';
export const RESET_ONBOARDING = 'onboarding/reset';
export const GO_TO_NEXT_STEP = 'onboarding/nextStep';
export const GO_TO_PREVIOUS_STEP = 'onboarding/previousStep';
export const SKIP_ONBOARDING = 'onboarding/skip';

// Async thunks
export const checkOnboardingTrigger = createAsyncThunk(
  CHECK_ONBOARDING_TRIGGER,
  async (_, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.checkTriggerCondition();
      return result;
    } catch (error: unknown) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const skipOnboarding = createAsyncThunk(
  SKIP_ONBOARDING,
  async (_, { rejectWithValue }) => {
    try {
      await window.electronAPI.skipOnboarding();
      return { success: true };
    } catch (error: unknown) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const downloadPackage = createAsyncThunk(
  'onboarding/downloadPackage',
  async (_, { rejectWithValue, dispatch }) => {
    try {
      console.log('[OnboardingThunks] Starting download...');

      // Set step to Download before starting
      dispatch({ type: 'onboarding/setCurrentStep', payload: 1 }); // Download = 1

      const result = await window.electronAPI.downloadPackage();

      if (!result.success) {
        return rejectWithValue(result.error || 'Download failed');
      }

      return result;
    } catch (error: unknown) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const startService = createAsyncThunk(
  'onboarding/startService',
  async (versionId: string, { rejectWithValue }) => {
    try {
      console.log('[OnboardingThunks] Starting service for version:', versionId);

      const result = await window.electronAPI.startService(versionId);

      if (!result.success) {
        return rejectWithValue(result.error || 'Start service failed');
      }

      return result;
    } catch (error: unknown) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const completeOnboarding = createAsyncThunk(
  'onboarding/complete',
  async (versionId: string, { rejectWithValue }) => {
    try {
      await window.electronAPI.completeOnboarding(versionId);
      return { success: true };
    } catch (error: unknown) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const resetOnboarding = createAsyncThunk(
  RESET_ONBOARDING,
  async (_, { rejectWithValue }) => {
    try {
      await window.electronAPI.resetOnboarding();
      return { success: true };
    } catch (error: unknown) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

// Sync action creators
export const goToNextStep = () => ({ type: GO_TO_NEXT_STEP });
export const goToPreviousStep = () => ({ type: GO_TO_PREVIOUS_STEP });
