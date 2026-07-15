import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, FileWarning, RefreshCw, ShieldCheck } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, AlertDescription } from '../../ui/alert';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Label } from '../../ui/label';
import {
  getOnboardingSequence,
  selectIsAcceptingLegalDocuments,
  selectIsDecliningLegalDocuments,
  selectIsLoadingLegalMetadata,
  selectLegalDocuments,
  selectLegalMetadataSource,
  selectOnboardingDependencyModeSettings,
  selectOnboardingDistributionState,
  selectOnboardingError,
  selectOnboardingMode,
  selectOnboardingRuntimeProvisioned,
} from '../../../store/slices/onboardingSlice';
import {
  acceptLegalDocuments,
  buildAcceptLegalDocumentsPayload,
  completeOnboarding,
  declineLegalDocuments,
  loadLegalDocuments,
  openLegalDocument,
} from '../../../store/thunks/onboardingThunks';
import { fetchActiveVersion } from '../../../store/thunks/webServiceThunks';
import { OnboardingStep } from '../../../../types/onboarding';
import type { AppDispatch, RootState } from '../../../store';

export interface LegalConsentStepHandle {
  canAccept: boolean;
  accept: () => Promise<void>;
}

interface LegalConsentStepProps {
  onCanAcceptChange?: (value: boolean) => void;
}

const LegalConsentStep = forwardRef<LegalConsentStepHandle, LegalConsentStepProps>(function LegalConsentStep(
  { onCanAcceptChange },
  ref,
) {
  const { t } = useTranslation('onboarding');
  const dispatch = useDispatch<AppDispatch>();
  const locale = useSelector((state: RootState) => state.i18n.currentLanguage);
  const mode = useSelector((state: RootState) => selectOnboardingMode(state));
  const distributionState = useSelector((state: RootState) => selectOnboardingDistributionState(state));
  const runtimeProvisioned = useSelector((state: RootState) => selectOnboardingRuntimeProvisioned(state));
  const dependencyModeSettings = useSelector((state: RootState) => selectOnboardingDependencyModeSettings(state));
  const documents = useSelector((state: RootState) => selectLegalDocuments(state));
  const source = useSelector((state: RootState) => selectLegalMetadataSource(state));
  const isLoading = useSelector((state: RootState) => selectIsLoadingLegalMetadata(state));
  const isAccepting = useSelector((state: RootState) => selectIsAcceptingLegalDocuments(state));
  const isDeclining = useSelector((state: RootState) => selectIsDecliningLegalDocuments(state));
  const error = useSelector((state: RootState) => selectOnboardingError(state));
  const [isChecked, setIsChecked] = useState(false);

  const shouldCompleteAfterAccept = useMemo(() => {
    if (mode === 'none' || mode === 'legal-only') {
      return true;
    }

    if (runtimeProvisioned) {
      return true;
    }

    const sequence = getOnboardingSequence(mode, dependencyModeSettings, distributionState);
    return sequence[sequence.length - 1] === OnboardingStep.LegalConsent;
  }, [dependencyModeSettings, distributionState, mode, runtimeProvisioned]);

  const canAccept = isChecked && documents.length >= 2 && !isLoading && !isAccepting && !isDeclining;

  const handleRefresh = () => {
    dispatch(loadLegalDocuments({ locale, refresh: true }));
  };

  const handleOpenDocument = (documentType: 'eula' | 'privacy-policy') => {
    dispatch(openLegalDocument({ documentType, locale }));
  };

  const handleAccept = useCallback(async () => {
    if (mode === 'none' || documents.length === 0) {
      return;
    }

    try {
      await dispatch(
        acceptLegalDocuments(
          buildAcceptLegalDocumentsPayload(mode, locale, documents),
        ),
      ).unwrap();

      if (!shouldCompleteAfterAccept) {
        return;
      }

      const activeVersion = await dispatch(fetchActiveVersion()).unwrap();
      if (activeVersion?.id) {
        await dispatch(completeOnboarding(activeVersion.id)).unwrap();
        void dispatch(fetchActiveVersion());
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
    } catch {
      // Error state already handled in slice.
    }
  }, [dispatch, documents, locale, mode, shouldCompleteAfterAccept]);

  const handleDecline = () => {
    dispatch(declineLegalDocuments());
  };

  useImperativeHandle(ref, () => ({
    canAccept,
    accept: handleAccept,
  }), [canAccept, handleAccept]);

  useEffect(() => {
    onCanAcceptChange?.(canAccept);
  }, [canAccept, onCanAcceptChange]);

  const sourceLabelKey =
    source === 'fresh'
      ? 'legal.source.fresh'
      : source === 'cache'
        ? 'legal.source.cache'
        : 'legal.source.unavailable';

  return (
    <div className="space-y-8">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold">{t('legal.title')}</h2>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground md:text-base">
            {t(mode === 'legal-only' ? 'legal.descriptionLegalOnly' : 'legal.descriptionFull')}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge variant={source === 'unavailable' ? 'destructive' : source === 'cache' ? 'secondary' : 'default'}>
            {t(sourceLabelKey)}
          </Badge>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading || isAccepting || isDeclining}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('legal.refresh')}
          </Button>
        </div>
      </div>

      <Alert>
        <FileWarning className="h-4 w-4" />
        <AlertDescription>{t('legal.browserInstruction')}</AlertDescription>
      </Alert>

      {source === 'cache' && (
        <Alert>
          <AlertDescription>{t('legal.cacheHint')}</AlertDescription>
        </Alert>
      )}

      {source === 'unavailable' && (
        <Alert variant="destructive">
          <AlertDescription>{t('legal.unavailableHint')}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {documents.map((document) => (
          <div key={document.documentType} className="rounded-xl border bg-muted/20 p-5 shadow-sm">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">{document.title}</h3>
                  {document.version && <Badge variant="outline">{document.version}</Badge>}
                </div>
                {document.lastUpdated && (
                  <p className="text-xs text-muted-foreground">
                    {t('legal.lastUpdated', { date: document.lastUpdated })}
                  </p>
                )}
              </div>

              <Button variant="outline" className="w-full gap-2" onClick={() => handleOpenDocument(document.documentType)}>
                <ExternalLink className="h-4 w-4" />
                {document.documentType === 'eula' ? t('legal.openEula') : t('legal.openPrivacy')}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Checkbox
            id="legal-consent-checkbox"
            checked={isChecked}
            onCheckedChange={(checked) => setIsChecked(checked === true)}
            disabled={documents.length === 0 || source === 'unavailable' || isAccepting || isDeclining}
          />
          <div className="space-y-2">
            <Label htmlFor="legal-consent-checkbox" className="cursor-pointer text-sm leading-6">
              {t('legal.checkbox')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t(mode === 'legal-only' ? 'legal.modeHintLegalOnly' : 'legal.modeHintFull')}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-start">
        <Button variant="outline" onClick={handleDecline} disabled={isAccepting || isDeclining}>
          {isDeclining ? t('legal.declining') : t('legal.decline')}
        </Button>
      </div>
    </div>
  );
});

export default LegalConsentStep;
