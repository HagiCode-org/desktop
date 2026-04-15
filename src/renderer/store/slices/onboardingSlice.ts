import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  OnboardingMode,
  OnboardingStep,
  type DownloadProgress,
  type OnboardingRecoveryResult,
  type OnboardingStartServiceResult,
  type OnboardingState,
  type ResolvedLegalDocumentsPayload,
  type StartupFailurePayload,
  type DependencyCheckResult,
  type ScriptOutput,
} from '../../../types/onboarding';
import {
  acceptLegalDocuments,
  checkOnboardingTrigger,
  declineLegalDocuments,
  downloadPackage,
  GO_TO_NEXT_STEP,
  GO_TO_PREVIOUS_STEP,
  loadLegalDocuments,
  completeOnboarding,
  openLegalDocument,
  recoverFromStartupFailure,
  resetOnboarding,
  skipOnboarding,
  startService,
} from '../thunks/onboardingThunks';

const fullSequence = [
  OnboardingStep.Welcome,
  OnboardingStep.LegalConsent,
  OnboardingStep.SharingAcceleration,
  OnboardingStep.Download,
  OnboardingStep.Launch,
] as const;

const legalOnlySequence = [OnboardingStep.LegalConsent] as const;

export function getOnboardingSequence(mode: OnboardingMode) {
  return mode === 'legal-only' ? [...legalOnlySequence] : [...fullSequence];
}

function getStepIndex(mode: OnboardingMode, step: OnboardingStep) {
  return getOnboardingSequence(mode).indexOf(step);
}

function getNextStep(mode: OnboardingMode, step: OnboardingStep) {
  const sequence = getOnboardingSequence(mode);
  const index = sequence.indexOf(step);
  return index >= 0 && index < sequence.length - 1 ? sequence[index + 1] : step;
}

function getPreviousStep(mode: OnboardingMode, step: OnboardingStep) {
  const sequence = getOnboardingSequence(mode);
  const index = sequence.indexOf(step);
  return index > 0 ? sequence[index - 1] : step;
}

const initialState: OnboardingState = {
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
    setActive: (state, action: PayloadAction<boolean>) => {
      state.isActive = action.payload;
    },
    setCurrentStep: (state, action: PayloadAction<OnboardingStep>) => {
      state.currentStep = action.payload;
    },
    setShowSkipConfirm: (state, action: PayloadAction<boolean>) => {
      state.showSkipConfirm = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setStartupFailure: (state, action: PayloadAction<StartupFailurePayload | null>) => {
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
    setDownloadProgress: (state, action: PayloadAction<DownloadProgress | null>) => {
      state.downloadProgress = action.payload;
    },
    setServiceProgress: (state, action: PayloadAction<OnboardingState['serviceProgress']>) => {
      state.serviceProgress = action.payload;
    },
    setDependencyCheckResults: (state, action: PayloadAction<DependencyCheckResult[]>) => {
      state.dependencyCheckResults = action.payload;
    },
    addScriptOutput: (state, action: PayloadAction<ScriptOutput>) => {
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
      mode: 'full' as OnboardingMode,
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
        } else {
          state.isActive = false;
          state.mode = 'none';
        }
      })
      .addCase(checkOnboardingTrigger.rejected, (state, action) => {
        state.isActive = false;
        state.mode = 'none';
        state.error = action.payload as string || 'Failed to check onboarding trigger';
      });

    builder
      .addCase(loadLegalDocuments.pending, (state) => {
        state.isLoadingLegalMetadata = true;
        state.error = null;
      })
      .addCase(loadLegalDocuments.fulfilled, (state, action: PayloadAction<ResolvedLegalDocumentsPayload>) => {
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
        state.error = action.payload as string || 'Failed to load legal documents';
      });

    builder
      .addCase(openLegalDocument.rejected, (state, action) => {
        state.error = action.payload as string || 'Failed to open legal document';
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
        } else {
          state.currentStep = OnboardingStep.SharingAcceleration;
        }
      })
      .addCase(acceptLegalDocuments.rejected, (state, action) => {
        state.isAcceptingLegalDocuments = false;
        state.error = action.payload as string || 'Failed to accept legal documents';
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
        state.error = action.payload as string || 'Failed to decline legal documents';
      });

    builder
      .addCase(skipOnboarding.fulfilled, (state) => {
        state.isSkipped = true;
        state.isActive = false;
      })
      .addCase(skipOnboarding.rejected, (state, action) => {
        state.error = action.payload as string || 'Failed to skip onboarding';
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
          } else {
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
        state.error = action.payload as string || 'Failed to download package';
      });

    builder
      .addCase(startService.pending, (state) => {
        state.error = null;
        state.currentStep = OnboardingStep.Launch;
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
        const failure = action.payload as OnboardingStartServiceResult | undefined;
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
        const failure = action.payload as OnboardingRecoveryResult | undefined;
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
        state.error = action.payload as string || 'Failed to complete onboarding';
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
            if (state.downloadProgress?.version) {
              state.currentStep = OnboardingStep.Launch;
            }
            break;
          case OnboardingStep.Launch:
            break;
        }
      })
      .addCase(GO_TO_PREVIOUS_STEP, (state) => {
        switch (state.currentStep) {
          case OnboardingStep.Launch:
            state.currentStep = OnboardingStep.Download;
            break;
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

export const {
  setActive,
  setCurrentStep,
  setShowSkipConfirm,
  setError,
  clearError,
  setStartupFailure,
  showStartupFailureDialog,
  hideStartupFailureDialog,
  setDownloadProgress,
  setServiceProgress,
  setDependencyCheckResults,
  addScriptOutput,
  clearScriptOutput,
  restartOnboardingFlow,
} = onboardingSlice.actions;

export const selectOnboardingState = (state: { onboarding: OnboardingState }) => state.onboarding;
export const selectIsActive = (state: { onboarding: OnboardingState }) => state.onboarding.isActive;
export const selectOnboardingMode = (state: { onboarding: OnboardingState }) => state.onboarding.mode;
export const selectCurrentStep = (state: { onboarding: OnboardingState }) => state.onboarding.currentStep;
export const selectIsSkipped = (state: { onboarding: OnboardingState }) => state.onboarding.isSkipped;
export const selectIsCompleted = (state: { onboarding: OnboardingState }) => state.onboarding.isCompleted;
export const selectDownloadProgress = (state: { onboarding: OnboardingState }) => state.onboarding.downloadProgress;
export const selectServiceProgress = (state: { onboarding: OnboardingState }) => state.onboarding.serviceProgress;
export const selectShowSkipConfirm = (state: { onboarding: OnboardingState }) => state.onboarding.showSkipConfirm;
export const selectOnboardingError = (state: { onboarding: OnboardingState }) => state.onboarding.error;
export const selectStartupFailure = (state: { onboarding: OnboardingState }) => state.onboarding.startupFailure;
export const selectShowStartupFailureDialog = (state: { onboarding: OnboardingState }) => state.onboarding.showStartupFailureDialog;
export const selectIsRecoveringFromStartupFailure = (state: { onboarding: OnboardingState }) =>
  state.onboarding.isRecoveringFromStartupFailure;
export const selectDependencyCheckResults = (state: { onboarding: OnboardingState }) => state.onboarding.dependencyCheckResults;
export const selectScriptOutputLogs = (state: { onboarding: OnboardingState }) => state.onboarding.scriptOutputLogs;
export const selectLegalDocuments = (state: { onboarding: OnboardingState }) => state.onboarding.legalDocuments;
export const selectLegalMetadataSource = (state: { onboarding: OnboardingState }) => state.onboarding.legalMetadataSource;
export const selectIsLoadingLegalMetadata = (state: { onboarding: OnboardingState }) => state.onboarding.isLoadingLegalMetadata;
export const selectIsAcceptingLegalDocuments = (state: { onboarding: OnboardingState }) => state.onboarding.isAcceptingLegalDocuments;
export const selectIsDecliningLegalDocuments = (state: { onboarding: OnboardingState }) => state.onboarding.isDecliningLegalDocuments;

export const selectCanGoNext = (state: { onboarding: OnboardingState }) => {
  const { currentStep, downloadProgress, serviceProgress } = state.onboarding;

  switch (currentStep) {
    case OnboardingStep.Welcome:
      return true;
    case OnboardingStep.LegalConsent:
      return false;
    case OnboardingStep.SharingAcceleration:
      return true;
    case OnboardingStep.Download:
      return downloadProgress?.progress === 100;
    case OnboardingStep.Launch:
      return serviceProgress?.phase === 'running';
    default:
      return false;
  }
};

export const selectCanGoPrevious = (state: { onboarding: OnboardingState }) => {
  return getStepIndex(state.onboarding.mode, state.onboarding.currentStep) > 0;
};

export default onboardingSlice.reducer;
