import { createSlice } from '@reduxjs/toolkit';
import { OnboardingStep, } from '../../../types/onboarding';
import { acceptLegalDocuments, checkOnboardingTrigger, declineLegalDocuments, downloadPackage, GO_TO_NEXT_STEP, GO_TO_PREVIOUS_STEP, loadLegalDocuments, completeOnboarding, openLegalDocument, recoverFromStartupFailure, resetOnboarding, skipOnboarding, startService, } from '../thunks/onboardingThunks';
const fullSequence = [
    OnboardingStep.Welcome,
    OnboardingStep.LegalConsent,
    OnboardingStep.SharingAcceleration,
    OnboardingStep.Download,
];
const legalOnlySequence = [OnboardingStep.LegalConsent];
export function getOnboardingSequence(mode) {
    return mode === 'legal-only' ? [...legalOnlySequence] : [...fullSequence];
}
function getStepIndex(mode, step) {
    return getOnboardingSequence(mode).indexOf(step);
}
function getNextStep(mode, step) {
    const sequence = getOnboardingSequence(mode);
    const index = sequence.indexOf(step);
    return index >= 0 && index < sequence.length - 1 ? sequence[index + 1] : step;
}
function getPreviousStep(mode, step) {
    const sequence = getOnboardingSequence(mode);
    const index = sequence.indexOf(step);
    return index > 0 ? sequence[index - 1] : step;
}
const initialState = {
    isActive: false,
    mode: 'none',
    currentStep: OnboardingStep.Welcome,
    isSkipped: false,
    isCompleted: false,
    downloadProgress: null,
    serviceProgress: null,
    showSkipConfirm: false,
    error: null,
    startupFailure: null,
    showStartupFailureDialog: false,
    legalDocuments: [],
    legalMetadataSource: 'unavailable',
    legalMetadataSchemaVersion: null,
    legalMetadataPublishedAt: null,
    legalMetadataResolvedLocale: null,
    legalMetadataCachedAt: null,
    legalMetadataLastSuccessfulFetchAt: null,
    isLoadingLegalMetadata: false,
    isAcceptingLegalDocuments: false,
    isDecliningLegalDocuments: false,
    isDownloading: false,
    isStartingService: false,
    isRecoveringFromStartupFailure: false,
    dependencyCheckResults: [],
    scriptOutputLogs: [],
};
export const onboardingSlice = createSlice({
    name: 'onboarding',
    initialState,
    reducers: {
        setActive: (state, action) => {
            state.isActive = action.payload;
        },
        setCurrentStep: (state, action) => {
            state.currentStep = action.payload;
        },
        setShowSkipConfirm: (state, action) => {
            state.showSkipConfirm = action.payload;
        },
        setError: (state, action) => {
            state.error = action.payload;
        },
        clearError: (state) => {
            state.error = null;
        },
        setStartupFailure: (state, action) => {
            state.startupFailure = action.payload;
            state.showStartupFailureDialog = !!action.payload;
        },
        showStartupFailureDialog: (state) => {
            if (state.startupFailure) {
                state.showStartupFailureDialog = true;
            }
        },
        hideStartupFailureDialog: (state) => {
            state.showStartupFailureDialog = false;
        },
        setDownloadProgress: (state, action) => {
            state.downloadProgress = action.payload;
        },
        setServiceProgress: (state, action) => {
            state.serviceProgress = action.payload;
        },
        setDependencyCheckResults: (state, action) => {
            state.dependencyCheckResults = action.payload;
        },
        addScriptOutput: (state, action) => {
            if (state.scriptOutputLogs.length >= 500) {
                state.scriptOutputLogs = state.scriptOutputLogs.slice(-400);
            }
            state.scriptOutputLogs.push(action.payload);
        },
        clearScriptOutput: (state) => {
            state.scriptOutputLogs = [];
        },
        restartOnboardingFlow: () => ({
            ...initialState,
            isActive: true,
            mode: 'full',
            currentStep: OnboardingStep.Welcome,
        }),
    },
    extraReducers: (builder) => {
        builder
            .addCase(checkOnboardingTrigger.fulfilled, (state, action) => {
            if (action.payload.shouldShow) {
                state.isActive = true;
                state.mode = action.payload.mode;
                state.currentStep = action.payload.mode === 'legal-only'
                    ? OnboardingStep.LegalConsent
                    : OnboardingStep.Welcome;
                state.legalMetadataSource = action.payload.metadataSource;
                state.error = null;
            }
            else {
                state.isActive = false;
                state.mode = 'none';
            }
        })
            .addCase(checkOnboardingTrigger.rejected, (state, action) => {
            state.isActive = false;
            state.mode = 'none';
            state.error = action.payload || 'Failed to check onboarding trigger';
        });
        builder
            .addCase(loadLegalDocuments.pending, (state) => {
            state.isLoadingLegalMetadata = true;
            state.error = null;
        })
            .addCase(loadLegalDocuments.fulfilled, (state, action) => {
            state.isLoadingLegalMetadata = false;
            state.legalDocuments = action.payload.documents;
            state.legalMetadataSource = action.payload.source;
            state.legalMetadataSchemaVersion = action.payload.schemaVersion;
            state.legalMetadataPublishedAt = action.payload.publishedAt;
            state.legalMetadataResolvedLocale = action.payload.resolvedLocale;
            state.legalMetadataCachedAt = action.payload.cachedAt;
            state.legalMetadataLastSuccessfulFetchAt = action.payload.lastSuccessfulFetchAt;
        })
            .addCase(loadLegalDocuments.rejected, (state, action) => {
            state.isLoadingLegalMetadata = false;
            state.error = action.payload || 'Failed to load legal documents';
        });
        builder
            .addCase(openLegalDocument.rejected, (state, action) => {
            state.error = action.payload || 'Failed to open legal document';
        });
        builder
            .addCase(acceptLegalDocuments.pending, (state) => {
            state.isAcceptingLegalDocuments = true;
            state.error = null;
        })
            .addCase(acceptLegalDocuments.fulfilled, (state, action) => {
            state.isAcceptingLegalDocuments = false;
            if (action.payload.mode === 'legal-only') {
                state.isActive = false;
                state.mode = 'none';
            }
            else {
                state.currentStep = OnboardingStep.SharingAcceleration;
            }
        })
            .addCase(acceptLegalDocuments.rejected, (state, action) => {
            state.isAcceptingLegalDocuments = false;
            state.error = action.payload || 'Failed to accept legal documents';
        });
        builder
            .addCase(declineLegalDocuments.pending, (state) => {
            state.isDecliningLegalDocuments = true;
            state.error = null;
        })
            .addCase(declineLegalDocuments.fulfilled, (state) => {
            state.isDecliningLegalDocuments = false;
            state.isActive = false;
        })
            .addCase(declineLegalDocuments.rejected, (state, action) => {
            state.isDecliningLegalDocuments = false;
            state.error = action.payload || 'Failed to decline legal documents';
        });
        builder
            .addCase(skipOnboarding.fulfilled, (state) => {
            state.isSkipped = true;
            state.isActive = false;
        })
            .addCase(skipOnboarding.rejected, (state, action) => {
            state.error = action.payload || 'Failed to skip onboarding';
        });
        builder
            .addCase(downloadPackage.pending, (state) => {
            state.error = null;
            state.downloadProgress = null;
            state.currentStep = OnboardingStep.Download;
            if (!state.isDownloading) {
                state.isDownloading = true;
            }
        })
            .addCase(downloadPackage.fulfilled, (state, action) => {
            state.isDownloading = false;
            if (action.payload.version) {
                if (state.downloadProgress) {
                    state.downloadProgress.progress = 100;
                    state.downloadProgress.version = action.payload.version;
                    state.downloadProgress.speed = 0;
                    state.downloadProgress.remainingSeconds = 0;
                }
                else {
                    state.downloadProgress = {
                        progress: 100,
                        downloadedBytes: 0,
                        totalBytes: 0,
                        speed: 0,
                        remainingSeconds: 0,
                        version: action.payload.version,
                    };
                }
            }
        })
            .addCase(downloadPackage.rejected, (state, action) => {
            state.isDownloading = false;
            state.error = action.payload || 'Failed to download package';
        });
        builder
            .addCase(startService.pending, (state) => {
            state.error = null;
            state.startupFailure = null;
            state.showStartupFailureDialog = false;
            if (!state.isStartingService && state.serviceProgress?.phase !== 'running') {
                state.isStartingService = true;
                state.serviceProgress = {
                    phase: 'starting',
                    progress: 0,
                    message: 'Starting service...',
                };
            }
        })
            .addCase(startService.fulfilled, (state) => {
            state.isStartingService = false;
            state.startupFailure = null;
            state.showStartupFailureDialog = false;
            state.serviceProgress = {
                ...(state.serviceProgress ?? {}),
                phase: 'running',
                progress: 100,
                message: state.serviceProgress?.message || 'Service started successfully',
            };
        })
            .addCase(startService.rejected, (state, action) => {
            const failure = action.payload;
            state.isStartingService = false;
            state.error = failure?.error || 'Failed to start service';
            state.startupFailure = failure?.startupFailure || null;
            state.showStartupFailureDialog = !!failure?.startupFailure;
            state.serviceProgress = {
                phase: 'error',
                progress: 0,
                message: failure?.error || 'Failed to start service',
            };
        })
            .addCase(recoverFromStartupFailure.pending, (state) => {
            state.error = null;
            state.isRecoveringFromStartupFailure = true;
        })
            .addCase(recoverFromStartupFailure.fulfilled, (state) => {
            state.isRecoveringFromStartupFailure = false;
        })
            .addCase(recoverFromStartupFailure.rejected, (state, action) => {
            const failure = action.payload;
            state.isRecoveringFromStartupFailure = false;
            state.error = failure?.error || 'Failed to recover from startup failure';
            state.showStartupFailureDialog = true;
        });
        builder
            .addCase(completeOnboarding.fulfilled, (state) => {
            state.isCompleted = true;
            state.isActive = false;
            state.mode = 'none';
        })
            .addCase(completeOnboarding.rejected, (state, action) => {
            state.error = action.payload || 'Failed to complete onboarding';
        });
        builder
            .addCase(resetOnboarding.fulfilled, () => ({ ...initialState }));
        builder
            .addCase(GO_TO_NEXT_STEP, (state) => {
            switch (state.currentStep) {
                case OnboardingStep.Welcome:
                    state.currentStep = getNextStep(state.mode, OnboardingStep.Welcome);
                    break;
                case OnboardingStep.LegalConsent:
                    break;
                case OnboardingStep.SharingAcceleration:
                    state.currentStep = OnboardingStep.Download;
                    break;
                case OnboardingStep.Download:
                    break;
            }
        })
            .addCase(GO_TO_PREVIOUS_STEP, (state) => {
            switch (state.currentStep) {
                case OnboardingStep.Download:
                    state.currentStep = OnboardingStep.SharingAcceleration;
                    break;
                case OnboardingStep.SharingAcceleration:
                    state.currentStep = getPreviousStep(state.mode, OnboardingStep.SharingAcceleration);
                    break;
                case OnboardingStep.LegalConsent:
                    state.currentStep = getPreviousStep(state.mode, OnboardingStep.LegalConsent);
                    break;
                default:
                    break;
            }
        });
    },
});
export const { setActive, setCurrentStep, setShowSkipConfirm, setError, clearError, setStartupFailure, showStartupFailureDialog, hideStartupFailureDialog, setDownloadProgress, setServiceProgress, setDependencyCheckResults, addScriptOutput, clearScriptOutput, restartOnboardingFlow, } = onboardingSlice.actions;
export const selectOnboardingState = (state) => state.onboarding;
export const selectIsActive = (state) => state.onboarding.isActive;
export const selectOnboardingMode = (state) => state.onboarding.mode;
export const selectCurrentStep = (state) => state.onboarding.currentStep;
export const selectIsSkipped = (state) => state.onboarding.isSkipped;
export const selectIsCompleted = (state) => state.onboarding.isCompleted;
export const selectDownloadProgress = (state) => state.onboarding.downloadProgress;
export const selectServiceProgress = (state) => state.onboarding.serviceProgress;
export const selectShowSkipConfirm = (state) => state.onboarding.showSkipConfirm;
export const selectOnboardingError = (state) => state.onboarding.error;
export const selectStartupFailure = (state) => state.onboarding.startupFailure;
export const selectShowStartupFailureDialog = (state) => state.onboarding.showStartupFailureDialog;
export const selectIsRecoveringFromStartupFailure = (state) => state.onboarding.isRecoveringFromStartupFailure;
export const selectDependencyCheckResults = (state) => state.onboarding.dependencyCheckResults;
export const selectScriptOutputLogs = (state) => state.onboarding.scriptOutputLogs;
export const selectLegalDocuments = (state) => state.onboarding.legalDocuments;
export const selectLegalMetadataSource = (state) => state.onboarding.legalMetadataSource;
export const selectIsLoadingLegalMetadata = (state) => state.onboarding.isLoadingLegalMetadata;
export const selectIsAcceptingLegalDocuments = (state) => state.onboarding.isAcceptingLegalDocuments;
export const selectIsDecliningLegalDocuments = (state) => state.onboarding.isDecliningLegalDocuments;
export const selectCanGoNext = (state) => {
    const { currentStep, downloadProgress } = state.onboarding;
    switch (currentStep) {
        case OnboardingStep.Welcome:
            return true;
        case OnboardingStep.LegalConsent:
            return false;
        case OnboardingStep.SharingAcceleration:
            return true;
        case OnboardingStep.Download:
            return downloadProgress?.progress === 100 && Boolean(downloadProgress.version);
        default:
            return false;
    }
};
export const selectCanGoPrevious = (state) => {
    return getStepIndex(state.onboarding.mode, state.onboarding.currentStep) > 0;
};
export default onboardingSlice.reducer;
