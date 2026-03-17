import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OnboardingStep } from '../../../types/onboarding';
import {
  checkOnboardingTrigger,
  skipOnboarding,
  installOpenSpec,
  verifyOpenSpec,
  downloadPackage,
  startService,
  recoverFromStartupFailure,
  completeOnboarding,
  resetOnboarding,
  GO_TO_NEXT_STEP,
  GO_TO_PREVIOUS_STEP,
} from '../thunks/onboardingThunks';
import type {
  OnboardingState,
  DownloadProgress,
  OpenSpecInstallState,
  ServiceLaunchProgress,
  DependencyCheckResult,
  ScriptOutput,
  StartupFailurePayload,
  OnboardingStartServiceResult,
  OnboardingRecoveryResult,
} from '../../../types/onboarding';

const initialState: OnboardingState = {
  isActive: false,
  currentStep: OnboardingStep.Welcome,
  isSkipped: false,
  isCompleted: false,
  downloadProgress: null,
  serviceProgress: null,
  showSkipConfirm: false,
  error: null,
  isOpenSpecConfirmed: false,
  openSpecInstall: {
    status: 'idle',
    error: null,
    installedVersion: null,
  } satisfies OpenSpecInstallState,
  startupFailure: null,
  showStartupFailureDialog: false,
  // Idempotency flags
  isDownloading: false,
  isStartingService: false,
  isRecoveringFromStartupFailure: false,
  // Dependency check results
  dependencyCheckResults: [],
  // Real-time script output logs
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
    setOpenSpecConfirmed: (state, action: PayloadAction<boolean>) => {
      state.isOpenSpecConfirmed = action.payload;
    },
    resetOpenSpecInstallState: (state) => {
      state.isOpenSpecConfirmed = false;
      state.openSpecInstall = {
        status: 'idle',
        error: null,
        installedVersion: null,
      };
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
    setServiceProgress: (state, action: PayloadAction<ServiceLaunchProgress | null>) => {
      state.serviceProgress = action.payload;
    },
    setDependencyCheckResults: (state, action: PayloadAction<DependencyCheckResult[]>) => {
      state.dependencyCheckResults = action.payload;
    },
    addScriptOutput: (state, action: PayloadAction<ScriptOutput>) => {
      // Limit log entries to prevent memory issues (keep last 500 entries)
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
    }),
  },
  extraReducers: (builder) => {
    // checkOnboardingTrigger
    builder
      .addCase(checkOnboardingTrigger.pending, (state) => {
        console.log('[onboardingSlice] checkOnboardingTrigger pending');
      })
      .addCase(checkOnboardingTrigger.fulfilled, (state, action) => {
        console.log('[onboardingSlice] checkOnboardingTrigger fulfilled:', action.payload);
        if (action.payload.shouldShow) {
          state.isActive = true;
          state.currentStep = OnboardingStep.Welcome;
          state.error = null;
        } else {
          state.isActive = false;
        }
      })
      .addCase(checkOnboardingTrigger.rejected, (state, action) => {
        console.error('[onboardingSlice] checkOnboardingTrigger rejected:', action.error);
        state.isActive = false;
        state.error = action.payload as string || 'Failed to check onboarding trigger';
      });

    // skipOnboarding
    builder
      .addCase(skipOnboarding.fulfilled, (state) => {
        state.isSkipped = true;
        state.isActive = false;
      })
      .addCase(skipOnboarding.rejected, (state, action) => {
        state.error = action.payload as string || 'Failed to skip onboarding';
      });

    builder
      .addCase(installOpenSpec.pending, (state) => {
        state.error = null;
        state.isOpenSpecConfirmed = false;
        state.openSpecInstall.status = 'installing';
        state.openSpecInstall.error = null;
        state.openSpecInstall.installedVersion = null;
      })
      .addCase(installOpenSpec.fulfilled, (state, action) => {
        state.isOpenSpecConfirmed = true;
        state.openSpecInstall.status = 'installed';
        state.openSpecInstall.error = null;
        state.openSpecInstall.installedVersion = action.payload.version || null;
      })
      .addCase(installOpenSpec.rejected, (state, action) => {
        const error = action.payload as string || 'Failed to install OpenSpec';
        state.error = error;
        state.isOpenSpecConfirmed = false;
        state.openSpecInstall.status = 'failed';
        state.openSpecInstall.error = error;
        state.openSpecInstall.installedVersion = null;
      })
      .addCase(verifyOpenSpec.pending, (state) => {
        state.error = null;
        state.isOpenSpecConfirmed = false;
        state.openSpecInstall.status = 'checking';
        state.openSpecInstall.error = null;
      })
      .addCase(verifyOpenSpec.fulfilled, (state, action) => {
        state.isOpenSpecConfirmed = true;
        state.openSpecInstall.status = 'installed';
        state.openSpecInstall.error = null;
        state.openSpecInstall.installedVersion = action.payload.version || null;
      })
      .addCase(verifyOpenSpec.rejected, (state, action) => {
        const error = action.payload as string || 'Failed to verify OpenSpec';
        state.error = error;
        state.isOpenSpecConfirmed = false;
        state.openSpecInstall.status = 'failed';
        state.openSpecInstall.error = error;
      });

    // downloadPackage
    builder
      .addCase(downloadPackage.pending, (state) => {
        console.log('[onboardingSlice] downloadPackage pending');
        state.error = null;
        state.downloadProgress = null;
        state.currentStep = OnboardingStep.Download;
        // Only set isDownloading if not already downloading (allow React Strict Mode double-calls)
        if (!state.isDownloading) {
          state.isDownloading = true;
        }
      })
      .addCase(downloadPackage.fulfilled, (state, action) => {
        console.log('[onboardingSlice] downloadPackage fulfilled:', action.payload);
        state.isDownloading = false;
        // Preserve the progress data that was set via IPC events during download
        // Only set progress to 100% if not already set, and keep the byte values
        if (action.payload.version) {
          if (state.downloadProgress) {
            // Update progress to 100% but preserve the byte values from IPC events
            state.downloadProgress.progress = 100;
            state.downloadProgress.version = action.payload.version;
            state.downloadProgress.speed = 0;
            state.downloadProgress.remainingSeconds = 0;
          } else {
            // Fallback if no progress was received via IPC (shouldn't happen with proper implementation)
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
        console.error('[onboardingSlice] downloadPackage rejected:', action.error);
        state.isDownloading = false;
        state.error = action.payload as string || 'Failed to download package';
      });

    // startService
    builder
      .addCase(startService.pending, (state) => {
        console.log('[onboardingSlice] startService pending');
        state.error = null;
        state.currentStep = OnboardingStep.Launch;
        state.startupFailure = null;
        state.showStartupFailureDialog = false;
        // Only update state if not already starting/running (allow React Strict Mode double-calls)
        if (!state.isStartingService && state.serviceProgress?.phase !== 'running') {
          state.isStartingService = true;
          state.serviceProgress = {
            phase: 'starting',
            progress: 0,
            message: 'Starting service...',
          };
        }
      })
      .addCase(startService.fulfilled, (state, action) => {
        console.log('[onboardingSlice] startService fulfilled');
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
        console.error('[onboardingSlice] startService rejected:', action.error);
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

    // completeOnboarding
    builder
      .addCase(completeOnboarding.fulfilled, (state) => {
        state.isCompleted = true;
        state.isActive = false;
      })
      .addCase(completeOnboarding.rejected, (state, action) => {
        state.error = action.payload as string || 'Failed to complete onboarding';
      });

    // resetOnboarding
    builder
      .addCase(resetOnboarding.fulfilled, () => {
        return { ...initialState };
      });

    // Handle synchronous actions for navigation
    builder
      .addCase(GO_TO_NEXT_STEP, (state) => {
        console.log('[onboardingSlice] goToNextStep, current step:', state.currentStep);

        switch (state.currentStep) {
          case OnboardingStep.Welcome:
            console.log('[onboardingSlice] Moving from Welcome to AgentCliSelection');
            state.currentStep = OnboardingStep.AgentCliSelection;
            break;

          case OnboardingStep.AgentCliSelection:
            console.log('[onboardingSlice] Moving from AgentCliSelection to OpenSpecInstallation');
            state.currentStep = OnboardingStep.OpenSpecInstallation;
            break;

          case OnboardingStep.OpenSpecInstallation:
            if (state.isOpenSpecConfirmed) {
              console.log('[onboardingSlice] Moving from OpenSpecInstallation to Download');
              state.currentStep = OnboardingStep.Download;
            }
            break;

          case OnboardingStep.Download:
            if (state.downloadProgress?.version) {
              console.log('[onboardingSlice] Moving from Download to Launch');
              state.currentStep = OnboardingStep.Launch;
            }
            break;

          case OnboardingStep.Launch:
            if (state.downloadProgress?.version && state.serviceProgress?.phase === 'running') {
              console.log('[onboardingSlice] Onboarding complete, ready to finish');
            }
            break;
        }
      })
      .addCase(GO_TO_PREVIOUS_STEP, (state) => {
        switch (state.currentStep) {
          case OnboardingStep.Launch:
            state.currentStep = OnboardingStep.Download;
            break;
          case OnboardingStep.Download:
            state.currentStep = OnboardingStep.OpenSpecInstallation;
            break;
          case OnboardingStep.OpenSpecInstallation:
            state.currentStep = OnboardingStep.AgentCliSelection;
            break;
          case OnboardingStep.AgentCliSelection:
            state.currentStep = OnboardingStep.Welcome;
            break;
          default:
            break;
        }
      });
  },
});

// Export actions
export const {
  setActive,
  setCurrentStep,
  setShowSkipConfirm,
  setError,
  setOpenSpecConfirmed,
  resetOpenSpecInstallState,
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

// Selectors
export const selectOnboardingState = (state: { onboarding: OnboardingState }) => state.onboarding;
export const selectIsActive = (state: { onboarding: OnboardingState }) => state.onboarding.isActive;
export const selectCurrentStep = (state: { onboarding: OnboardingState }) => state.onboarding.currentStep;
export const selectIsSkipped = (state: { onboarding: OnboardingState }) => state.onboarding.isSkipped;
export const selectIsCompleted = (state: { onboarding: OnboardingState }) => state.onboarding.isCompleted;
export const selectDownloadProgress = (state: { onboarding: OnboardingState }) => state.onboarding.downloadProgress;
export const selectServiceProgress = (state: { onboarding: OnboardingState }) => state.onboarding.serviceProgress;
export const selectShowSkipConfirm = (state: { onboarding: OnboardingState }) => state.onboarding.showSkipConfirm;
export const selectOnboardingError = (state: { onboarding: OnboardingState }) => state.onboarding.error;
export const selectIsOpenSpecConfirmed = (state: { onboarding: OnboardingState }) => state.onboarding.isOpenSpecConfirmed;
export const selectOpenSpecInstall = (state: { onboarding: OnboardingState }) => state.onboarding.openSpecInstall;
export const selectStartupFailure = (state: { onboarding: OnboardingState }) => state.onboarding.startupFailure;
export const selectShowStartupFailureDialog = (state: { onboarding: OnboardingState }) => state.onboarding.showStartupFailureDialog;
export const selectIsRecoveringFromStartupFailure = (state: { onboarding: OnboardingState }) =>
  state.onboarding.isRecoveringFromStartupFailure;
export const selectDependencyCheckResults = (state: { onboarding: OnboardingState }) => state.onboarding.dependencyCheckResults;
export const selectScriptOutputLogs = (state: { onboarding: OnboardingState }) => state.onboarding.scriptOutputLogs;

// Computed selectors
export const selectCanGoNext = (state: { onboarding: OnboardingState }) => {
  const { currentStep, downloadProgress, serviceProgress, isOpenSpecConfirmed } = state.onboarding;

  switch (currentStep) {
    case OnboardingStep.Welcome:
      return true; // Can always proceed from welcome
    case OnboardingStep.AgentCliSelection:
      return true;
    case OnboardingStep.OpenSpecInstallation:
      return isOpenSpecConfirmed;
    case OnboardingStep.Download:
      return downloadProgress?.progress === 100;
    case OnboardingStep.Launch:
      return serviceProgress?.phase === 'running';
    default:
      return false;
  }
};

export const selectCanGoPrevious = (state: { onboarding: OnboardingState }) => {
  return state.onboarding.currentStep > OnboardingStep.Welcome;
};

export default onboardingSlice.reducer;
