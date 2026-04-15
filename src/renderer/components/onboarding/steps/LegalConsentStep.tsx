import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, FileWarning, RefreshCw, ShieldCheck } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { Alert, AlertDescription } from '../../ui/alert';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Label } from '../../ui/label';
import {
  selectIsAcceptingLegalDocuments,
  selectIsDecliningLegalDocuments,
  selectIsLoadingLegalMetadata,
  selectLegalDocuments,
  selectLegalMetadataSource,
  selectOnboardingError,
  selectOnboardingMode,
} from '../../../store/slices/onboardingSlice';
import {
  acceptLegalDocuments,
  buildAcceptLegalDocumentsPayload,
  declineLegalDocuments,
  loadLegalDocuments,
  openLegalDocument,
} from '../../../store/thunks/onboardingThunks';
import type { AppDispatch, RootState } from '../../../store';

function LegalConsentStep() {
  const { t } = useTranslation('onboarding');
  const dispatch = useDispatch<AppDispatch>();
  const locale = useSelector((state: RootState) => state.i18n.currentLanguage);
  const mode = useSelector((state: RootState) => selectOnboardingMode(state));
  const documents = useSelector((state: RootState) => selectLegalDocuments(state));
  const source = useSelector((state: RootState) => selectLegalMetadataSource(state));
  const error = useSelector((state: RootState) => selectOnboardingError(state));
  const isLoading = useSelector((state: RootState) => selectIsLoadingLegalMetadata(state));
  const isAccepting = useSelector((state: RootState) => selectIsAcceptingLegalDocuments(state));
  const isDeclining = useSelector((state: RootState) => selectIsDecliningLegalDocuments(state));
  const [isChecked, setIsChecked] = useState(false);

  const sourceLabelKey = useMemo(() => {
    if (source === 'remote') return 'legal.metadata.remote';
    if (source === 'cache') return 'legal.metadata.cache';
    return 'legal.metadata.unavailable';
  }, [source]);

  const canAccept = isChecked && documents.length >= 2 && !isLoading && !isAccepting && !isDeclining;

  const handleRefresh = () => {
    dispatch(loadLegalDocuments({ locale, refresh: true }));
  };

  const handleOpenDocument = (documentType: 'eula' | 'privacy-policy') => {
    dispatch(openLegalDocument({ documentType, locale }));
  };

  const handleAccept = () => {
    if (mode === 'none' || documents.length === 0) {
      return;
    }

    dispatch(
      acceptLegalDocuments(
        buildAcceptLegalDocumentsPayload(mode, locale, documents),
      ),
    );
  };

  const handleDecline = () => {
    dispatch(declineLegalDocuments());
  };

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
                  <Badge variant="outline">{t(`legal.types.${document.documentType}`)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('legal.reviewPrompt')}
                </p>
              </div>

              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{t('legal.effectiveDate')}</dt>
                  <dd className="font-medium">{document.effectiveDate}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{t('legal.revision')}</dt>
                  <dd className="font-medium">{document.revision}</dd>
                </div>
              </dl>

              <Button variant="outline" className="w-full gap-2" onClick={() => handleOpenDocument(document.documentType)}>
                <ExternalLink className="h-4 w-4" />
                {t('legal.openInBrowser', { title: document.title })}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-5">
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

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={handleDecline} disabled={isAccepting || isDeclining}>
          {isDeclining ? t('legal.declining') : t('legal.decline')}
        </Button>
        <Button onClick={handleAccept} disabled={!canAccept}>
          {isAccepting ? t('legal.accepting') : t('legal.accept')}
        </Button>
      </div>
    </div>
  );
}

export default LegalConsentStep;
