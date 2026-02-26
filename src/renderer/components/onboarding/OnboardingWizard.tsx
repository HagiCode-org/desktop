import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { X } from 'lucide-react';
import {
  selectIsActive,
  selectCurrentStep,
  selectCanGoNext,
  selectCanGoPrevious,
  selectDownloadProgress,
  setDownloadProgress,
  setServiceProgress,
} from '../../store/slices/onboardingSlice';
import { OnboardingStep } from '../../../types/onboarding';
import { goToNextStep, goToPreviousStep, skipOnboarding, downloadPackage } from '../../store/thunks/onboardingThunks';
import WelcomeIntro from './steps/WelcomeIntro';
import AgentCliSelectionStep from './steps/AgentCliSelection';
import PackageDownload from './steps/PackageDownload';
import ServiceLauncher from './steps/ServiceLauncher';
import LlmInstallationStep from './steps/LlmInstallation';
import OnboardingProgress from './OnboardingProgress';
import OnboardingActions from './OnboardingActions';
import SkipConfirmDialog from './SkipConfirmDialog';
import type { RootState } from '../../store';
import type { AppDispatch } from '../../store';
import type { DownloadProgress, ServiceLaunchProgress } from '../../../types/onboarding';

interface OnboardingWizardProps {
  onComplete?: () => void;
}

function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t } = useTranslation('onboarding');
  const dispatch = useDispatch<AppDispatch>();
  const isActive = useSelector((state: RootState) => selectIsActive(state));
  const currentStep = useSelector((state: RootState) => selectCurrentStep(state));
  const canGoNext = useSelector((state: RootState) => selectCanGoNext(state));
  const canGoPrevious = useSelector((state: RootState) => selectCanGoPrevious(state));
  const downloadProgress = useSelector((state: RootState) => selectDownloadProgress(state));
  const isDownloading = useSelector((state: RootState) => state.onboarding.isDownloading);

  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [downloadedVersion, setDownloadedVersion] = useState<string | null>(null);
  const [downloadCompleted, setDownloadCompleted] = useState(false);

  // Set up IPC listeners for progress updates
  useEffect(() => {
    if (!isActive) return;

    console.log('[OnboardingWizard] Setting up IPC listeners');

    // Download progress listener
    const unsubscribeDownloadProgress = window.electronAPI.onDownloadProgress((progress: DownloadProgress) => {
      console.log('[OnboardingWizard] Download progress:', progress);
      dispatch(setDownloadProgress(progress));

      // Store the downloaded version when download completes
      if (progress.progress === 100 && progress.version && !downloadedVersion) {
        setDownloadedVersion(progress.version);
        setDownloadCompleted(true);
        console.log('[OnboardingWizard] Download complete, version stored:', progress.version);
      }
    });

    // Service progress listener
    const unsubscribeServiceProgress = window.electronAPI.onServiceProgress((progress: ServiceLaunchProgress) => {
      console.log('[OnboardingWizard] Service progress:', progress);
      dispatch(setServiceProgress(progress));
    });

    return () => {
      console.log('[OnboardingWizard] Cleaning up IPC listeners');
      unsubscribeDownloadProgress();
      unsubscribeServiceProgress();
    };
  }, [isActive, dispatch]);

  // Debug logging for step changes
  useEffect(() => {
    console.log('[OnboardingWizard] currentStep changed to:', currentStep, 'OnboardingStep.Welcome:', OnboardingStep.Welcome);
  }, [currentStep]);

  // If not active, don't render
  if (!isActive) {
    return null;
  }

  const handleNext = () => {
    console.log('[OnboardingWizard] handleNext called, current step:', currentStep);
    dispatch(goToNextStep());

    // Trigger download when moving from Welcome to Download
    // Only trigger if not already downloading or completed
    if (currentStep === OnboardingStep.Welcome && !isDownloading && !downloadCompleted) {
      console.log('[OnboardingWizard] Triggering download package');
      dispatch(downloadPackage());
    }
  };

  const handlePrevious = () => {
    dispatch(goToPreviousStep());
  };

  const handleSkip = () => {
    setShowSkipDialog(true);
  };

  const handleConfirmSkip = () => {
    dispatch(skipOnboarding());
    setShowSkipDialog(false);
  };

  const handleCancelSkip = () => {
    setShowSkipDialog(false);
  };

  const renderStep = () => {
    switch (currentStep) {
      case OnboardingStep.Welcome:
        return <WelcomeIntro onNext={handleNext} onSkip={handleSkip} />;
      case OnboardingStep.AgentCliSelection:
        return <AgentCliSelectionStep onNext={handleNext} onSkip={handleSkip} />;
      case OnboardingStep.Download:
        return <PackageDownload />;
      case OnboardingStep.LlmInstallation:
        return <LlmInstallationStep
          onNext={handleNext}
          onSkip={handleSkip}
          versionId={downloadedVersion}
        />;
      case OnboardingStep.Launch:
        return <ServiceLauncher onComplete={onComplete} />;
      default:
        return null;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case OnboardingStep.Welcome:
        return t('welcome.title');
      case OnboardingStep.AgentCliSelection:
        return t('agent-cli.title');
      case OnboardingStep.Download:
        return t('download.title');
      case OnboardingStep.LlmInstallation:
        return t('llmInstallation.title');
      case OnboardingStep.Launch:
        return t('launch.title');
      default:
        return '';
    }
  };

  const totalSteps = 5;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
        <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 flex-shrink-0">
            <h1 className="text-2xl font-semibold">{getStepTitle()}</h1>
            <div className="flex items-center gap-4">
              <OnboardingProgress currentStep={currentStep} totalSteps={totalSteps} />
              <button
                onClick={handleSkip}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="bg-card rounded-lg border shadow-lg flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="p-8 flex-1 overflow-y-auto">
              {renderStep()}
            </div>

            {/* Actions */}
            {/* Steps that provide their own action buttons or custom navigation are excluded from OnboardingActions */}
            {/* Welcome, AgentCliSelection, LlmInstallation, and Launch have custom navigation flows */}
            {currentStep !== OnboardingStep.Welcome &&
             currentStep !== OnboardingStep.AgentCliSelection &&
             currentStep !== OnboardingStep.LlmInstallation &&
             currentStep !== OnboardingStep.Launch && (
              <div className="flex-shrink-0">
                <OnboardingActions
                  canGoNext={canGoNext}
                  canGoPrevious={canGoPrevious}
                  onNext={handleNext}
                  onPrevious={handlePrevious}
                  onSkip={handleSkip}
                />
              </div>
            )}
          </div>

          {/* Skip checkbox */}
          {currentStep !== OnboardingStep.Launch && (
            <div className="flex items-center mt-4 flex-shrink-0">
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-input"
                  onChange={handleSkip}
                />
                {t('skip.checkbox')}
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Skip confirmation dialog */}
      <SkipConfirmDialog
        open={showSkipDialog}
        onConfirm={handleConfirmSkip}
        onCancel={handleCancelSkip}
      />
    </>
  );
}

export default OnboardingWizard;
