import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import {
  getOnboardingSequence,
  selectCanGoNext,
  selectCanGoPrevious,
  selectCurrentStep,
  selectDownloadProgress,
  selectOnboardingDistributionState,
  selectOnboardingDependencyModeSettings,
  selectIsActive,
  selectOnboardingMode,
  selectOnboardingRuntimeProvisioned,
  setDownloadProgress,
} from '../../store/slices/onboardingSlice';
import { OnboardingStep } from '../../../types/onboarding';
import {
  completeOnboarding,
  downloadPackage,
  goToNextStep,
  goToPreviousStep,
  loadLegalDocuments,
  loadOnboardingDependencyModeSettings,
} from '../../store/thunks/onboardingThunks';
import { fetchActiveVersion } from '../../store/thunks/webServiceThunks';
import { changeLanguage } from '../../store/thunks/i18nThunks';
import WelcomeIntro from './steps/WelcomeIntro';
import LegalConsentStep, { type LegalConsentStepHandle } from './steps/LegalConsentStep';
import SharingAccelerationStep from './steps/SharingAccelerationStep';
import DependencyPreparationStep from './steps/DependencyPreparationStep';
import PackageDownload from './steps/PackageDownload';
import LanguageSelectionStep from './steps/LanguageSelectionStep';
import OnboardingProgress from './OnboardingProgress';
import OnboardingActions from './OnboardingActions';
import { Sheet, SheetContent } from '../ui/sheet';
import type { AppDispatch, RootState } from '../../store';
import type { DownloadProgress } from '../../../types/onboarding';
import { getDesktopLanguage, resolveDesktopLanguageCode } from '../../../shared/desktop-languages';

interface OnboardingWizardProps {
  onComplete?: () => void;
}

function getStepLabel(t: ReturnType<typeof useTranslation<'onboarding'>>['t'], step: OnboardingStep) {
  switch (step) {
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
}

function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t } = useTranslation('onboarding');
  const dispatch = useDispatch<AppDispatch>();
  const isActive = useSelector((state: RootState) => selectIsActive(state));
  const mode = useSelector((state: RootState) => selectOnboardingMode(state));
  const distributionState = useSelector((state: RootState) => selectOnboardingDistributionState(state));
  const runtimeProvisioned = useSelector((state: RootState) => selectOnboardingRuntimeProvisioned(state));
  const currentStep = useSelector((state: RootState) => selectCurrentStep(state));
  const canGoNext = useSelector((state: RootState) => selectCanGoNext(state));
  const canGoPrevious = useSelector((state: RootState) => selectCanGoPrevious(state));
  const downloadProgress = useSelector((state: RootState) => selectDownloadProgress(state));
  const dependencyModeSettings = useSelector((state: RootState) => selectOnboardingDependencyModeSettings(state));
  const dependencyModeSettingsStatus = useSelector((state: RootState) => state.onboarding.dependencyModeSettingsStatus);
  const isDownloading = useSelector((state: RootState) => state.onboarding.isDownloading);
  const isDependencyOperationActive = useSelector((state: RootState) => state.onboarding.isDependencyOperationActive);
  const onboardingError = useSelector((state: RootState) => state.onboarding.error);
  const locale = useSelector((state: RootState) => state.i18n.currentLanguage);

  const [sharingStepReady, setSharingStepReady] = useState(false);
  const legalConsentRef = useRef<LegalConsentStepHandle>(null);
  const [legalConsentCanAccept, setLegalConsentCanAccept] = useState(false);
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

  useEffect(() => {
    if (!isActive || mode !== 'full' || dependencyModeSettingsStatus !== 'idle') {
      return;
    }

    void dispatch(loadOnboardingDependencyModeSettings());
  }, [dependencyModeSettingsStatus, dispatch, isActive, mode]);

  useEffect(() => {
    if (currentStep !== OnboardingStep.Download || runtimeProvisioned || isDownloading || downloadCompleted) {
      return;
    }

    if (downloadProgress || onboardingError) {
      return;
    }

    void dispatch(downloadPackage());
  }, [currentStep, dispatch, downloadCompleted, downloadProgress, isDownloading, onboardingError, runtimeProvisioned]);

  const stepSequence = useMemo(
    () => getOnboardingSequence(mode, dependencyModeSettings, distributionState),
    [dependencyModeSettings, distributionState, mode],
  );
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
      await dispatch(completeOnboarding(downloadProgress.version)).unwrap();
      void dispatch(fetchActiveVersion());
      onComplete?.();
      return;
    }

    if (currentStep === OnboardingStep.DependencyPreparation && runtimeProvisioned) {
      if (isDependencyOperationActive) {
        return;
      }

      void dispatch(fetchActiveVersion()).unwrap().then(async (activeVersion) => {
        if (activeVersion?.id) {
          await dispatch(completeOnboarding(activeVersion.id)).unwrap();
          void dispatch(fetchActiveVersion());
          onComplete?.();
          return;
        }

        const fallbackVersion = [...await window.electronAPI.versionGetInstalled()]
          .sort((left, right) => {
            if (left.isActive !== right.isActive) {
              return Number(right.isActive) - Number(left.isActive);
            }

            const leftInstalledAt = Number.isFinite(Date.parse(left.installedAt)) ? Date.parse(left.installedAt) : 0;
            const rightInstalledAt = Number.isFinite(Date.parse(right.installedAt)) ? Date.parse(right.installedAt) : 0;
            return rightInstalledAt - leftInstalledAt;
          })[0];
        if (!fallbackVersion?.id) {
          return;
        }

        await dispatch(completeOnboarding(fallbackVersion.id)).unwrap();
        void dispatch(fetchActiveVersion());
        onComplete?.();
      });
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

    if (currentStep === OnboardingStep.LegalConsent) {
      await legalConsentRef.current?.accept();
      return;
    }

    if (currentStep === OnboardingStep.SharingAcceleration && mode === 'full' && dependencyModeSettingsStatus !== 'ready') {
      try {
        await dispatch(loadOnboardingDependencyModeSettings()).unwrap();
      } catch {
        // Fall back to the existing full flow if the mode settings cannot be loaded.
      }

      dispatch(goToNextStep());
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
        return <WelcomeIntro stepSequence={stepSequence} />;
      case OnboardingStep.LegalConsent:
        return <LegalConsentStep ref={legalConsentRef} onCanAcceptChange={setLegalConsentCanAccept} />;
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

  const currentStepLabel = useMemo(() => getStepLabel(t, currentStep), [currentStep, t]);
  const fullProgressLabel = useMemo(
    () => t('legal.progressFull', { steps: stepSequence.map((step) => getStepLabel(t, step)).join(' -> ') }),
    [stepSequence, t],
  );

  const nextLabel = useMemo(() => {
    if (currentStep === OnboardingStep.LanguageSelection) {
      const nativeLanguageName = getDesktopLanguage(selectedLanguage).nativeName;
      return languageStepPending
        ? t('actions.applyingLanguage', { language: nativeLanguageName })
        : t('actions.continueWithLanguage', { language: nativeLanguageName });
    }

    if (currentStep === OnboardingStep.Welcome) {
      return t('welcome.start');
    }

    if (currentStep === OnboardingStep.LegalConsent) {
      return t('legal.accept');
    }

    if (currentStep === OnboardingStep.Download && downloadCompleted) {
      return t('actions.finish');
    }

    if (currentStep === OnboardingStep.DependencyPreparation && runtimeProvisioned) {
      return t('actions.finish');
    }

    return undefined;
  }, [currentStep, downloadCompleted, languageStepPending, runtimeProvisioned, selectedLanguage, t]);

  const effectiveCanGoNext = currentStep === OnboardingStep.LanguageSelection
    ? !languageStepPending
    : currentStep === OnboardingStep.SharingAcceleration
      ? sharingStepReady
      : currentStep === OnboardingStep.LegalConsent
        ? legalConsentCanAccept
        : currentStep === OnboardingStep.DependencyPreparation
          ? !isDependencyOperationActive
          : canGoNext;

  const canGoPreviousInCommonActions = currentStep === OnboardingStep.Welcome
    ? false
    : canGoPrevious;
  const skipLabel = currentStep === OnboardingStep.Welcome ? t('welcome.skip') : undefined;

  if (!isActive) {
    return null;
  }

  return (
    <Sheet open={isActive} onOpenChange={() => undefined}>
      <SheetContent
        side="right"
        className="z-50 flex h-full w-[80vw] min-w-[320px] max-w-none flex-col overflow-hidden border-l bg-card p-0"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <div className="flex flex-shrink-0 flex-col gap-4 border-b bg-card px-6 py-5 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-sm font-semibold tracking-[0.08em] text-muted-foreground">
              {t('title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'legal-only' ? t('legal.progressLegalOnly') : fullProgressLabel}
            </p>
          </div>
          <OnboardingProgress
            currentStepNumber={currentStepNumber}
            totalSteps={totalSteps}
            currentStepLabel={currentStepLabel}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">{renderStep()}</div>

          <div className="sticky bottom-0 flex-shrink-0 bg-card">
            <OnboardingActions
              canGoNext={effectiveCanGoNext}
              canGoPrevious={canGoPreviousInCommonActions}
              onNext={handleNext}
              onPrevious={handlePrevious}
              skipLabel={skipLabel}
              nextLabel={nextLabel}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default OnboardingWizard;
