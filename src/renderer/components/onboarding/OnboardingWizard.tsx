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
import { changeLanguage } from '../../store/thunks/i18nThunks';
import WelcomeIntro from './steps/WelcomeIntro';
import LegalConsentStep from './steps/LegalConsentStep';
import SharingAccelerationStep from './steps/SharingAccelerationStep';
import DependencyPreparationStep from './steps/DependencyPreparationStep';
import PackageDownload from './steps/PackageDownload';
import LanguageSelectionStep from './steps/LanguageSelectionStep';
import OnboardingProgress from './OnboardingProgress';
import OnboardingActions from './OnboardingActions';
import type { AppDispatch, RootState } from '../../store';
import type { DownloadProgress } from '../../../types/onboarding';
import { getDesktopLanguage, resolveDesktopLanguageCode } from '../../../shared/desktop-languages';

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
  const isDependencyOperationActive = useSelector((state: RootState) => state.onboarding.isDependencyOperationActive);
  const locale = useSelector((state: RootState) => state.i18n.currentLanguage);

  const [sharingStepReady, setSharingStepReady] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(() => resolveDesktopLanguageCode(locale));
  const [languageStepPending, setLanguageStepPending] = useState(false);
  const [languageStepError, setLanguageStepError] = useState<string | null>(null);
  const downloadCompleted = downloadProgress?.progress === 100;

  useEffect(() => {
    if (currentStep !== OnboardingStep.LanguageSelection || languageStepPending) {
      return;
    }

    setSelectedLanguage(resolveDesktopLanguageCode(locale));
  }, [currentStep, locale, languageStepPending]);

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

  const handleNext = async () => {
    if (currentStep === OnboardingStep.LanguageSelection) {
      if (languageStepPending) {
        return;
      }

      setLanguageStepPending(true);
      setLanguageStepError(null);

      try {
        await dispatch(changeLanguage(selectedLanguage)).unwrap();
        dispatch(goToNextStep());
      } catch (error) {
        setLanguageStepError(error instanceof Error ? error.message : 'Failed to save language');
      } finally {
        setLanguageStepPending(false);
      }
      return;
    }

    if (currentStep === OnboardingStep.Download && downloadCompleted && downloadProgress?.version) {
      dispatch(completeOnboarding(downloadProgress.version));
      dispatch(fetchActiveVersion());
      onComplete?.();
      return;
    }

    if (currentStep === OnboardingStep.DependencyPreparation) {
      if (isDependencyOperationActive) {
        return;
      }

      dispatch(goToNextStep());

      if (!isDownloading && !downloadCompleted) {
        dispatch(downloadPackage());
      }
      return;
    }

    dispatch(goToNextStep());
  };

  const handlePrevious = () => {
    dispatch(goToPreviousStep());
  };

  const renderStep = () => {
    switch (currentStep) {
      case OnboardingStep.LanguageSelection:
        return (
          <LanguageSelectionStep
            selectedLanguage={selectedLanguage}
            onSelect={(nextLanguage) => {
              setSelectedLanguage(nextLanguage);
              setLanguageStepError(null);
            }}
            isPending={languageStepPending}
            error={languageStepError}
          />
        );
      case OnboardingStep.Welcome:
        return <WelcomeIntro onNext={handleNext} />;
      case OnboardingStep.LegalConsent:
        return <LegalConsentStep />;
      case OnboardingStep.SharingAcceleration:
        return <SharingAccelerationStep onReadyChange={setSharingStepReady} />;
      case OnboardingStep.DependencyPreparation:
        return <DependencyPreparationStep />;
      case OnboardingStep.Download:
        return <PackageDownload />;
      default:
        return null;
    }
  };

  const currentStepLabel = useMemo(() => {
    switch (currentStep) {
      case OnboardingStep.LanguageSelection:
        return t('languageSelection.title');
      case OnboardingStep.Welcome:
        return t('welcome.title');
      case OnboardingStep.LegalConsent:
        return t('legal.title');
      case OnboardingStep.SharingAcceleration:
        return t('sharingAcceleration.title');
      case OnboardingStep.DependencyPreparation:
        return t('dependencyPreparation.title');
      case OnboardingStep.Download:
        return t('download.title');
      default:
        return '';
    }
  }, [currentStep, t]);

  const nextLabel = useMemo(() => {
    if (currentStep === OnboardingStep.LanguageSelection) {
      const nativeLanguageName = getDesktopLanguage(selectedLanguage).nativeName;
      return languageStepPending
        ? t('actions.applyingLanguage', { language: nativeLanguageName })
        : t('actions.continueWithLanguage', { language: nativeLanguageName });
    }

    if (currentStep === OnboardingStep.Download && downloadCompleted) {
      return t('actions.finish');
    }

    return undefined;
  }, [currentStep, downloadCompleted, languageStepPending, selectedLanguage, t]);

  const effectiveCanGoNext = currentStep === OnboardingStep.LanguageSelection
    ? !languageStepPending
    : currentStep === OnboardingStep.SharingAcceleration
      ? sharingStepReady
      : currentStep === OnboardingStep.DependencyPreparation
        ? !isDependencyOperationActive
        : canGoNext;

  if (!isActive) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-background/95 px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4">
        <div className="flex flex-shrink-0 flex-col gap-4 rounded-2xl border bg-card px-6 py-5 shadow-sm md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-sm font-semibold tracking-[0.08em] text-muted-foreground">
              {t('title')}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {t(mode === 'legal-only' ? 'legal.progressLegalOnly' : 'legal.progressFull')}
            </p>
          </div>
          <OnboardingProgress
            currentStepNumber={currentStepNumber}
            totalSteps={totalSteps}
            currentStepLabel={currentStepLabel}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-lg">
          <div className="flex-1 overflow-y-auto p-6 sm:p-8">{renderStep()}</div>

          {currentStep !== OnboardingStep.Welcome &&
            currentStep !== OnboardingStep.LegalConsent && (
              <div className="flex-shrink-0">
                <OnboardingActions
                  canGoNext={effectiveCanGoNext}
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
