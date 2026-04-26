import { createAsyncThunk } from '@reduxjs/toolkit';
import type {
  AcceptLegalDocumentsPayload,
  LegalDocumentType,
  OnboardingMode,
  OnboardingTriggerResult,
  OnboardingRecoveryResult,
  OnboardingDependencyInstallResult,
  OnboardingStartServiceResult,
  ResolvedLegalDocumentsPayload,
} from '../../../types/onboarding';
import { OnboardingStep } from '../../../types/onboarding';
import type { ManagedNpmPackageId, NpmManagementBridge } from '../../../types/npm-management.js';

declare global {
  interface Window {
    electronAPI: {
      checkTriggerCondition: () => Promise<OnboardingTriggerResult>;
      getOnboardingState: () => Promise<unknown>;
      getLegalDocuments: (locale: string, refresh?: boolean) => Promise<ResolvedLegalDocumentsPayload>;
      openLegalDocument: (documentType: LegalDocumentType, locale: string) => Promise<{ success: boolean; error?: string }>;
      acceptLegalDocuments: (payload: AcceptLegalDocumentsPayload) => Promise<{ success: boolean; error?: string }>;
      declineLegalDocuments: () => Promise<{ success: boolean; error?: string }>;
      skipOnboarding: () => Promise<{ success: boolean; error?: string }>;
      downloadPackage: () => Promise<{ success: boolean; error?: string; version?: string }>;
      checkOnboardingDependencies: (versionId: string) => Promise<unknown>;
      installDependencies: (versionId: string) => Promise<OnboardingDependencyInstallResult>;
      startService: (versionId: string) => Promise<OnboardingStartServiceResult>;
      recoverServiceStartup: (versionId: string) => Promise<OnboardingRecoveryResult>;
      completeOnboarding: (versionId: string) => Promise<{ success: boolean; error?: string }>;
      resetOnboarding: () => Promise<{ success: boolean; error?: string }>;
      npmManagement: NpmManagementBridge;
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
      return await window.electronAPI.checkTriggerCondition();
    } catch (error: unknown) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const loadLegalDocuments = createAsyncThunk(
  'onboarding/loadLegalDocuments',
  async ({ locale, refresh = false }: { locale: string; refresh?: boolean }, { rejectWithValue }) => {
    try {
      return await window.electronAPI.getLegalDocuments(locale, refresh);
    } catch (error: unknown) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const openLegalDocument = createAsyncThunk(
  'onboarding/openLegalDocument',
  async ({ documentType, locale }: { documentType: LegalDocumentType; locale: string }, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.openLegalDocument(documentType, locale);
      if (!result.success) {
        return rejectWithValue(result.error || 'Failed to open legal document');
      }
      return { documentType };
    } catch (error: unknown) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const acceptLegalDocuments = createAsyncThunk(
  'onboarding/acceptLegalDocuments',
  async (payload: AcceptLegalDocumentsPayload, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.acceptLegalDocuments(payload);
      if (!result.success) {
        return rejectWithValue(result.error || 'Failed to accept legal documents');
      }
      return payload;
    } catch (error: unknown) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const declineLegalDocuments = createAsyncThunk(
  'onboarding/declineLegalDocuments',
  async (_, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.declineLegalDocuments();
      if (!result.success) {
        return rejectWithValue(result.error || 'Failed to decline legal documents');
      }
      return { success: true };
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

export const loadOnboardingNpmSnapshot = createAsyncThunk(
  'onboarding/loadNpmSnapshot',
  async (_, { rejectWithValue }) => {
    try {
      return await window.electronAPI.npmManagement.getSnapshot();
    } catch (error: unknown) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const refreshOnboardingNpmSnapshot = createAsyncThunk(
  'onboarding/refreshNpmSnapshot',
  async (_, { rejectWithValue }) => {
    try {
      return await window.electronAPI.npmManagement.refresh();
    } catch (error: unknown) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  }
);

export const installOnboardingNpmPackages = createAsyncThunk(
  'onboarding/installNpmPackages',
  async (packageIds: ManagedNpmPackageId[], { rejectWithValue }) => {
    try {
      if (packageIds.includes('hagiscript')) {
        const result = await window.electronAPI.npmManagement.install('hagiscript');
        if (!result.success) {
          return rejectWithValue(result.error || 'Failed to install hagiscript');
        }
      }

      const syncPackageIds = packageIds.filter((id) => id !== 'hagiscript');
      if (syncPackageIds.length > 0) {
        const result = await window.electronAPI.npmManagement.syncPackages({ packageIds: syncPackageIds });
        if (!result.success) {
          return rejectWithValue(result.error || 'Failed to install npm packages');
        }
        return result.snapshot;
      }

      return await window.electronAPI.npmManagement.refresh();
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

export function buildAcceptLegalDocumentsPayload(
  mode: Exclude<OnboardingMode, 'none'>,
  locale: string,
  documents: ResolvedLegalDocumentsPayload['documents'],
): AcceptLegalDocumentsPayload {
  return {
    mode,
    locale,
    documents: documents.map((document) => ({
      documentType: document.documentType,
      revision: document.revision,
    })),
  };
}
