import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import {
  getOnboardingSequence,
  selectCanGoNext,
  selectCanGoPrevious,
  selectCurrentStep,
  selectDownloadProgress,
  selectIsActive,
  selectOnboardingMode,
  setDownloadProgress,
} from '../../store/slices/onboardingSlice';
import { OnboardingStep } from '../../../types/onboarding';
import {
  completeOnboarding,
  downloadPackage,
  goToNextStep,
  goToPreviousStep,
  loadLegalDocuments,
} from '../../store/thunks/onboardingThunks';
import { fetchActiveVersion } from '../../store/thunks/webServiceThunks';
import WelcomeIntro from './steps/WelcomeIntro';
import LegalConsentStep from './steps/LegalConsentStep';
import SharingAccelerationStep from './steps/SharingAccelerationStep';
import PackageDownload from './steps/PackageDownload';
import OnboardingProgress from './OnboardingProgress';
import OnboardingActions from './OnboardingActions';
import type { AppDispatch, RootState } from '../../store';
import type { DownloadProgress } from '../../../types/onboarding';

interface OnboardingWizardProps {
  onComplete?: () => void;
}

function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t } = useTranslation('onboarding');
  const dispatch = useDispatch<AppDispatch>();
  const isActive = useSelector((state: RootState) => selectIsActive(state));
  const mode = useSelector((state: RootState) => selectOnboardingMode(state));
  const currentStep = useSelector((state: RootState) => selectCurrentStep(state));
  const canGoNext = useSelector((state: RootState) => selectCanGoNext(state));
  const canGoPrevious = useSelector((state: RootState) => selectCanGoPrevious(state));
  const downloadProgress = useSelector((state: RootState) => selectDownloadProgress(state));
  const isDownloading = useSelector((state: RootState) => state.onboarding.isDownloading);
  const locale = useSelector((state: RootState) => state.i18n.currentLanguage);

  const [sharingStepReady, setSharingStepReady] = useState(false);
  const downloadCompleted = downloadProgress?.progress === 100;

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const unsubscribeDownloadProgress = window.electronAPI.onDownloadProgress((progress: DownloadProgress) => {
      dispatch(setDownloadProgress(progress));
    });

    return () => {
      if (typeof unsubscribeDownloadProgress === 'function') {
        unsubscribeDownloadProgress();
      }
    };
  }, [isActive, dispatch]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    dispatch(loadLegalDocuments({ locale }));
  }, [isActive, locale, dispatch]);

  const stepSequence = getOnboardingSequence(mode);
  const totalSteps = stepSequence.length;
  const currentStepNumber = Math.max(1, stepSequence.indexOf(currentStep) + 1);

  const handleNext = () => {
    if (currentStep === OnboardingStep.Download && downloadCompleted && downloadProgress?.version) {
      dispatch(completeOnboarding(downloadProgress.version));
      dispatch(fetchActiveVersion());
      onComplete?.();
      return;
    }

    dispatch(goToNextStep());

    if (currentStep === OnboardingStep.SharingAcceleration && !isDownloading && !downloadCompleted) {
      dispatch(downloadPackage());
    }
  };

  const handlePrevious = () => {
    dispatch(goToPreviousStep());
  };

  const renderStep = () => {
    switch (currentStep) {
      case OnboardingStep.Welcome:
        return <WelcomeIntro onNext={handleNext} />;
      case OnboardingStep.LegalConsent:
        return <LegalConsentStep />;
      case OnboardingStep.SharingAcceleration:
        return <SharingAccelerationStep onReadyChange={setSharingStepReady} />;
      case OnboardingStep.Download:
        return <PackageDownload />;
      default:
        return null;
    }
  };

  const title = useMemo(() => {
    switch (currentStep) {
      case OnboardingStep.Welcome:
        return t('welcome.title');
      case OnboardingStep.LegalConsent:
        return t('legal.title');
      case OnboardingStep.SharingAcceleration:
        return t('sharingAcceleration.title');
      case OnboardingStep.Download:
        return t('download.title');
      default:
        return '';
    }
  }, [currentStep, t]);

  const nextLabel = currentStep === OnboardingStep.Download && downloadCompleted
    ? t('actions.finish')
    : undefined;

  if (!isActive) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col">
        <div className="mb-6 flex flex-shrink-0 items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">
              {t(mode === 'legal-only' ? 'legal.progressLegalOnly' : 'legal.progressFull')}
            </p>
          </div>
          <OnboardingProgress currentStepNumber={currentStepNumber} totalSteps={totalSteps} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-lg">
          <div className="flex-1 overflow-y-auto p-8">{renderStep()}</div>

          {currentStep !== OnboardingStep.Welcome &&
            currentStep !== OnboardingStep.LegalConsent && (
              <div className="flex-shrink-0">
                <OnboardingActions
                  canGoNext={currentStep === OnboardingStep.SharingAcceleration ? sharingStepReady : canGoNext}
                  canGoPrevious={canGoPrevious}
                  onNext={handleNext}
                  onPrevious={handlePrevious}
                  nextLabel={nextLabel}
                />
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

export default OnboardingWizard;
