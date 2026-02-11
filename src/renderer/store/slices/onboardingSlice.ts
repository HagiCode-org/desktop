import { createSlice, createAction, PayloadAction } from '@reduxjs/toolkit';
import { OnboardingStep } from '../../../types/onboarding';
import {
  checkOnboardingTrigger,
  skipOnboarding,
  downloadPackage,
  startService,
  completeOnboarding,
  resetOnboarding,
  GO_TO_NEXT_STEP,
  GO_TO_PREVIOUS_STEP,
  TRIGGER_ONBOARDING_NEXT,
} from '../thunks/onboardingThunks';
import type {
  OnboardingState,
  DownloadProgress,
  ServiceLaunchProgress,
  DependencyCheckResult,
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
  // Idempotency flags
  isDownloading: false,
  isStartingService: false,
  // Dependency check results
  dependencyCheckResults: [],
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
    setDownloadProgress: (state, action: PayloadAction<DownloadProgress | null>) => {
      state.downloadProgress = action.payload;
    },
    setServiceProgress: (state, action: PayloadAction<ServiceLaunchProgress | null>) => {
      state.serviceProgress = action.payload;
    },
    setDependencyCheckResults: (state, action: PayloadAction<DependencyCheckResult[]>) => {
      state.dependencyCheckResults = action.payload;
    },
    nextStep: (state) => {
      if (state.currentStep < OnboardingStep.Launch) {
        state.currentStep = (state.currentStep + 1) as OnboardingStep;
      }
    },
    previousStep: (state) => {
      if (state.currentStep > OnboardingStep.Welcome) {
        state.currentStep = (state.currentStep - 1) as OnboardingStep;
      }
    },
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
      .addCase(startService.fulfilled, (state) => {
        console.log('[onboardingSlice] startService fulfilled');
        state.isStartingService = false;
        state.serviceProgress = {
          phase: 'running',
          progress: 100,
          message: 'Service started successfully',
        };
      })
      .addCase(startService.rejected, (state, action) => {
        console.error('[onboardingSlice] startService rejected:', action.error);
        state.isStartingService = false;
        state.error = action.payload as string || 'Failed to start service';
        state.serviceProgress = {
          phase: 'error',
          progress: 0,
          message: 'Failed to start service',
        };
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
        return {
          ...initialState,
          // Reset idempotency flags
          isDownloading: false,
          isStartingService: false,
        };
      });

    // Handle synchronous actions for navigation
    builder
      .addCase(GO_TO_NEXT_STEP, (state) => {
        console.log('[onboardingSlice] goToNextStep, current step:', state.currentStep);

        switch (state.currentStep) {
          case OnboardingStep.Welcome:
            console.log('[onboardingSlice] Moving from Welcome to Download');
            state.currentStep = OnboardingStep.Download;
            break;

          case OnboardingStep.Download:
            if (state.downloadProgress?.version) {
              console.log('[onboardingSlice] Moving from Download to Dependencies');
              state.currentStep = OnboardingStep.Dependencies;
            }
            break;

          case OnboardingStep.Dependencies:
            if (state.downloadProgress?.version) {
              console.log('[onboardingSlice] Moving from Dependencies to Launch');
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
        if (state.currentStep > OnboardingStep.Welcome) {
          state.currentStep = (state.currentStep - 1) as OnboardingStep;
        }
      })
      // Handle dependency installation completion in onboarding context
      .addCase(TRIGGER_ONBOARDING_NEXT, (state) => {
        console.log('[onboardingSlice] Triggering next step after dependency installation');
        // Only proceed if we're in the Dependencies step
        if (state.currentStep === OnboardingStep.Dependencies) {
          state.currentStep = OnboardingStep.Launch;
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
  clearError,
  setDownloadProgress,
  setServiceProgress,
  setDependencyCheckResults,
  nextStep,
  previousStep,
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
export const selectDependencyCheckResults = (state: { onboarding: OnboardingState }) => state.onboarding.dependencyCheckResults;

// Computed selectors
export const selectCanGoNext = (state: { onboarding: OnboardingState }) => {
  const { currentStep, downloadProgress, serviceProgress } = state.onboarding;

  switch (currentStep) {
    case OnboardingStep.Welcome:
      return true; // Can always proceed from welcome
    case OnboardingStep.Download:
      return downloadProgress?.progress === 100;
    case OnboardingStep.Dependencies:
      // Allow proceeding - dependencies are managed through dependencySlice
      return downloadProgress?.version !== undefined;
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
