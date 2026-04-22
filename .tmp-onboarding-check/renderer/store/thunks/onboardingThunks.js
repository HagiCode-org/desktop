import { createAsyncThunk } from '@reduxjs/toolkit';
import { OnboardingStep } from '../../../types/onboarding';
// Action types
export const CHECK_ONBOARDING_TRIGGER = 'onboarding/checkTrigger';
export const RESET_ONBOARDING = 'onboarding/reset';
export const GO_TO_NEXT_STEP = 'onboarding/nextStep';
export const GO_TO_PREVIOUS_STEP = 'onboarding/previousStep';
export const SKIP_ONBOARDING = 'onboarding/skip';
export const TRIGGER_ONBOARDING_NEXT = 'dependency/triggerOnboardingNext';
// Async thunks
export const checkOnboardingTrigger = createAsyncThunk(CHECK_ONBOARDING_TRIGGER, async (_, { rejectWithValue }) => {
    try {
        return await window.electronAPI.checkTriggerCondition();
    }
    catch (error) {
        return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
});
export const loadLegalDocuments = createAsyncThunk('onboarding/loadLegalDocuments', async ({ locale, refresh = false }, { rejectWithValue }) => {
    try {
        return await window.electronAPI.getLegalDocuments(locale, refresh);
    }
    catch (error) {
        return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
});
export const openLegalDocument = createAsyncThunk('onboarding/openLegalDocument', async ({ documentType, locale }, { rejectWithValue }) => {
    try {
        const result = await window.electronAPI.openLegalDocument(documentType, locale);
        if (!result.success) {
            return rejectWithValue(result.error || 'Failed to open legal document');
        }
        return { documentType };
    }
    catch (error) {
        return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
});
export const acceptLegalDocuments = createAsyncThunk('onboarding/acceptLegalDocuments', async (payload, { rejectWithValue }) => {
    try {
        const result = await window.electronAPI.acceptLegalDocuments(payload);
        if (!result.success) {
            return rejectWithValue(result.error || 'Failed to accept legal documents');
        }
        return payload;
    }
    catch (error) {
        return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
});
export const declineLegalDocuments = createAsyncThunk('onboarding/declineLegalDocuments', async (_, { rejectWithValue }) => {
    try {
        const result = await window.electronAPI.declineLegalDocuments();
        if (!result.success) {
            return rejectWithValue(result.error || 'Failed to decline legal documents');
        }
        return { success: true };
    }
    catch (error) {
        return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
});
export const skipOnboarding = createAsyncThunk(SKIP_ONBOARDING, async (_, { rejectWithValue }) => {
    try {
        await window.electronAPI.skipOnboarding();
        return { success: true };
    }
    catch (error) {
        return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
});
export const downloadPackage = createAsyncThunk('onboarding/downloadPackage', async (_, { rejectWithValue, dispatch }) => {
    try {
        console.log('[OnboardingThunks] Starting download...');
        dispatch({ type: 'onboarding/setCurrentStep', payload: OnboardingStep.Download });
        const result = await window.electronAPI.downloadPackage();
        if (!result.success) {
            return rejectWithValue(result.error || 'Download failed');
        }
        return result;
    }
    catch (error) {
        return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
});
export const startService = createAsyncThunk('onboarding/startService', async (versionId, { rejectWithValue }) => {
    try {
        console.log('[OnboardingThunks] Starting service for version:', versionId);
        const result = await window.electronAPI.startService(versionId);
        if (!result.success) {
            return rejectWithValue(result);
        }
        return result;
    }
    catch (error) {
        return rejectWithValue({
            success: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});
export const recoverFromStartupFailure = createAsyncThunk('onboarding/recoverFromStartupFailure', async (versionId, { rejectWithValue }) => {
    try {
        console.log('[OnboardingThunks] Recovering from startup failure for version:', versionId);
        const result = await window.electronAPI.recoverServiceStartup(versionId);
        if (!result.success) {
            return rejectWithValue(result);
        }
        return result;
    }
    catch (error) {
        return rejectWithValue({
            success: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});
export const completeOnboarding = createAsyncThunk('onboarding/complete', async (versionId, { rejectWithValue }) => {
    try {
        await window.electronAPI.completeOnboarding(versionId);
        return { success: true };
    }
    catch (error) {
        return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
});
export const resetOnboarding = createAsyncThunk(RESET_ONBOARDING, async (_, { rejectWithValue }) => {
    try {
        await window.electronAPI.resetOnboarding();
        return { success: true };
    }
    catch (error) {
        return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
});
// Sync action creators
export const goToNextStep = () => ({ type: GO_TO_NEXT_STEP });
export const goToPreviousStep = () => ({ type: GO_TO_PREVIOUS_STEP });
export function buildAcceptLegalDocumentsPayload(mode, locale, documents) {
    return {
        mode,
        locale,
        documents: documents.map((document) => ({
            documentType: document.documentType,
            revision: document.revision,
        })),
    };
}
