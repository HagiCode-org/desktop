import { createAsyncThunk } from '@reduxjs/toolkit';
import { OnboardingStep } from '../../../types/onboarding';
import type {
  OnboardingRecoveryResult,
  OnboardingStartServiceResult,
} from '../../../types/onboarding';

declare global {
  interface Window {
    electronAPI: {
      checkTriggerCondition: () => Promise<{ shouldShow: boolean; reason?: string }>;
      getOnboardingState: () => Promise<unknown>;
      skipOnboarding: () => Promise<{ success: boolean; error?: string }>;
      downloadPackage: () => Promise<{ success: boolean; error?: string; version?: string }>;
      checkOnboardingDependencies: (versionId: string) => Promise<unknown>;
      installDependencies: (versionId: string) => Promise<unknown>;
      startService: (versionId: string) => Promise<OnboardingStartServiceResult>;
      recoverServiceStartup: (versionId: string) => Promise<OnboardingRecoveryResult>;
      completeOnboarding: (versionId: string) => Promise<{ success: boolean; error?: string }>;
      resetOnboarding: () => Promise<{ success: boolean; error?: string }>;
      onDownloadProgress: (callback: (progress: unknown) => void) => (() => void) | void;
      onDependencyProgress: (callback: (status: unknown) => void) => (() => void) | void;
      onServiceProgress: (callback: (progress: unknown) => void) => (() => void) | void;
      onScriptOutput: (callback: (output: unknown) => void) => (() => void) | void;
      onOnboardingShow: (callback: () => void) => (() => void) | void;
    };
  }
}

// Action types
export const CHECK_ONBOARDING_TRIGGER = 'onboarding/checkTrigger';
export const RESET_ONBOARDING = 'onboarding/reset';
export const GO_TO_NEXT_STEP = 'onboarding/nextStep';
export const GO_TO_PREVIOUS_STEP = 'onboarding/previousStep';
export const SKIP_ONBOARDING = 'onboarding/skip';
export const TRIGGER_ONBOARDING_NEXT = 'dependency/triggerOnboardingNext';

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
      dispatch({ type: 'onboarding/setCurrentStep', payload: OnboardingStep.Download });

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
        return rejectWithValue(result);
      }

      return result;
    } catch (error: unknown) {
      return rejectWithValue({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies OnboardingStartServiceResult);
    }
  }
);

export const recoverFromStartupFailure = createAsyncThunk(
  'onboarding/recoverFromStartupFailure',
  async (versionId: string, { rejectWithValue }) => {
    try {
      console.log('[OnboardingThunks] Recovering from startup failure for version:', versionId);

      const result = await window.electronAPI.recoverServiceStartup(versionId);

      if (!result.success) {
        return rejectWithValue(result);
      }

      return result;
    } catch (error: unknown) {
      return rejectWithValue({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies OnboardingRecoveryResult);
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
