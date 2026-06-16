import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Loader2,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  createDefaultTurboEngineLicenseSnapshot,
  HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL,
  turboEngineEntitlementNames,
  type TurboEngineLicenseSnapshot,
} from '../../../types/turboengine-license.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  CommercePreviewDebugDialog,
  getCommercePreviewScenarioLabel,
  useCommercePreviewDebug,
} from '@/components/commerce/CommercePreviewDebug';
import type { AppDispatch, RootState } from '@/store';
import {
  clearTurboEngineLicensePurchaseResult,
  loadTurboEngineLicenseSnapshot,
  purchaseTurboEngineLicense,
  refreshTurboEngineLicenseSnapshot,
  selectTurboEngineLicenseState,
  verifyTurboEngineLicenseStartup,
} from '@/store/slices/turboEngineLicenseSlice';

function getStatusKey(snapshot: TurboEngineLicenseSnapshot | null): string {
  if (!snapshot) {
    return 'loading';
  }

  if (snapshot.availability !== 'supported') {
    return 'unsupported';
  }

  if (snapshot.isStale) {
    return 'stale';
  }

  return snapshot.status;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

const articleFeatureKeys = [
  'proposalConcurrency',
  'documentThemes',
  'composeCommitCoAuthor',
  'branding',
  'avatarUpload',
  'avatarPacks',
] as const;

const purchaseNoticeKeys = ['channel', 'restart', 'online'] as const;

export default function TurboEnginePage() {
  const { t } = useTranslation(['pages', 'common']);
  const dispatch = useDispatch<AppDispatch>();
  const previewDebug = useCommercePreviewDebug();
  const turboEngineBridgeAvailable = typeof window.electronAPI.turboEngineLicense?.getSnapshot === 'function';
  const {
    snapshot,
    lastPurchase,
    isLoading,
    isStartupVerifying,
    isRefreshing,
    isPurchasing,
    error,
  } = useSelector((state: RootState) => selectTurboEngineLicenseState(state));

  useEffect(() => {
    if (turboEngineBridgeAvailable && !snapshot && !isLoading) {
      void dispatch(loadTurboEngineLicenseSnapshot());
      void dispatch(verifyTurboEngineLicenseStartup());
    }
  }, [dispatch, isLoading, snapshot, turboEngineBridgeAvailable]);

  useEffect(() => () => {
    dispatch(clearTurboEngineLicensePurchaseResult());
  }, [dispatch]);

  const openStorePage = async (url: string) => {
    const result = await window.electronAPI.openExternal(url);
    if (!result.success) {
      toast.error(t('turboEngine.messages.openStoreFailed', {
        error: result.error || t('turboEngine.messages.openStoreFailedFallback'),
      }));
    }
  };

  const handleRefresh = async () => {
    if (!turboEngineBridgeAvailable) {
      return;
    }

    const resultAction = await dispatch(refreshTurboEngineLicenseSnapshot());
    if (refreshTurboEngineLicenseSnapshot.fulfilled.match(resultAction)) {
      const nextSnapshot = resultAction.payload;
      if (nextSnapshot.isStale || nextSnapshot.availability !== 'supported') {
        toast.error(t('turboEngine.messages.refreshStale'));
        return;
      }

      toast.success(t('turboEngine.messages.refreshSuccess'));
      return;
    }

    const message = typeof resultAction.payload === 'string'
      ? resultAction.payload
      : resultAction.error.message ?? t('turboEngine.messages.refreshFailedFallback');
    toast.error(t('turboEngine.messages.refreshFailed', { error: message }));
  };

  const handlePurchase = async () => {
    if (!turboEngineBridgeAvailable) {
      return;
    }

    const resultAction = await dispatch(purchaseTurboEngineLicense());
    if (!purchaseTurboEngineLicense.fulfilled.match(resultAction)) {
      const message = typeof resultAction.payload === 'string'
        ? resultAction.payload
        : resultAction.error.message ?? t('turboEngine.messages.purchaseFailedFallback');
      toast.error(t('turboEngine.messages.purchaseFailed', { error: message }));
      return;
    }

    const toastMessage = t(`turboEngine.purchaseOutcome.${resultAction.payload.outcome}`);
    if (resultAction.payload.outcome === 'succeeded' || resultAction.payload.outcome === 'already-purchased') {
      toast.success(toastMessage);
      return;
    }

    if (resultAction.payload.outcome === 'canceled' || resultAction.payload.outcome === 'not-purchased') {
      toast(toastMessage);
      return;
    }

    toast.error(toastMessage);
  };

  const isPreviewing = previewDebug.isPreviewing;
  const effectiveBridgeAvailable = previewDebug.scenario === 'live'
    ? turboEngineBridgeAvailable
    : previewDebug.scenario !== 'non-store';
  const effectiveSnapshot = previewDebug.scenario === 'live'
    ? snapshot
    : (previewDebug.scenario === 'non-store'
      ? null
      : createDefaultTurboEngineLicenseSnapshot({
        entitlements: previewDebug.scenario === 'active' ? [...turboEngineEntitlementNames] : [],
        source: 'store',
        status: previewDebug.scenario === 'active' ? 'active' : 'inactive',
      }));
  const effectiveLastPurchase = previewDebug.scenario === 'live' ? lastPurchase : null;
  const effectiveError = previewDebug.scenario === 'live' ? error : null;
  const effectiveIsLoading = previewDebug.scenario === 'live' ? isLoading : false;
  const effectiveIsRefreshing = previewDebug.scenario === 'live' ? isRefreshing : false;
  const effectiveIsPurchasing = previewDebug.scenario === 'live' ? isPurchasing : false;
  const effectiveIsStartupVerifying = previewDebug.scenario === 'live' ? isStartupVerifying : false;

  const statusKey = effectiveBridgeAvailable ? getStatusKey(effectiveSnapshot) : 'unsupported';
  const bridgeAndStoreAvailable = effectiveBridgeAvailable && effectiveSnapshot?.availability === 'supported';
  const isActive = effectiveSnapshot?.status === 'active';
  const canRefresh = effectiveBridgeAvailable && !effectiveIsRefreshing && !effectiveIsStartupVerifying && !effectiveIsLoading;
  const shouldShowPurchaseAction = bridgeAndStoreAvailable && !isActive;
  const statusSummary = effectiveIsLoading && !effectiveSnapshot
    ? t('turboEngine.status.loading')
    : (bridgeAndStoreAvailable
      ? t(`turboEngine.status.${statusKey}`)
      : t('turboEngine.unsupported.title'));

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <header className="mx-auto max-w-3xl text-center">
        <button
          type="button"
          className="max-w-3xl cursor-default bg-transparent p-0 text-3xl font-semibold tracking-[-0.02em] text-foreground [text-wrap:balance] sm:text-4xl lg:text-5xl"
          onClick={previewDebug.handleDebugTitleClick}
        >
          {t('turboEngine.summary.productName')}
        </button>
        {isPreviewing ? (
          <p className="mt-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {t('common:system.commercePanel.debug.previewBadge', {
              mode: getCommercePreviewScenarioLabel(t, previewDebug.scenario),
            })}
          </p>
        ) : null}
      </header>

      <section className="commerce-premium-shell rounded-3xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="relative z-10">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
            <article className="commerce-premium-panel rounded-3xl p-6 sm:p-8">
              <div className="max-w-3xl">
                <h2 className="commerce-premium-heading text-3xl font-semibold tracking-[-0.02em] [text-wrap:balance] sm:text-4xl">
                  {t('turboEngine.article.unlockTitle')}
                </h2>
                <p className="commerce-premium-copy mt-4 text-sm leading-7 sm:text-base">
                  {t('turboEngine.article.unlockLead')}
                </p>
              </div>

              <div className="mt-8">
                <h3 className="commerce-premium-heading text-xl font-semibold">
                  {t('turboEngine.article.featuresTitle')}
                </h3>
                <ol className="mt-5 space-y-5">
                  {articleFeatureKeys.map((featureKey, index) => (
                    <li
                      key={featureKey}
                      className="border-t border-border/50 pt-5 first:border-t-0 first:pt-0"
                    >
                      <p className="commerce-premium-heading flex items-center gap-3 text-base font-semibold sm:text-lg">
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm text-primary">
                          {index + 1}
                        </span>
                        <span>{t(`turboEngine.article.features.${featureKey}.title`)}</span>
                      </p>
                      <p className="commerce-premium-copy mt-3 pl-10 text-sm leading-7 sm:text-base">
                        {t(`turboEngine.article.features.${featureKey}.description`)}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-10 border-t border-border/50 pt-8">
                <h3 className="commerce-premium-heading text-xl font-semibold">
                  {t('turboEngine.article.purchaseNoticeTitle')}
                </h3>
                <ol className="mt-5 space-y-4">
                  {purchaseNoticeKeys.map((noticeKey, index) => (
                    <li key={noticeKey} className="flex gap-3 text-sm leading-7 sm:text-base">
                      <span className="commerce-premium-heading inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-sm font-semibold">
                        {index + 1}
                      </span>
                      <span className="commerce-premium-copy">
                        {t(`turboEngine.article.purchaseNoticeItems.${noticeKey}`)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </article>

            <aside className="space-y-4">
              <div className="commerce-premium-panel rounded-3xl p-5 sm:p-6">
                <h2 className="commerce-premium-heading text-xl font-semibold">
                  {t('turboEngine.actions.sectionTitle')}
                </h2>

                {effectiveIsLoading && !effectiveSnapshot ? (
                  <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border/50 bg-background/55 px-4 py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <p className="commerce-premium-copy text-sm leading-6">{t('turboEngine.loading')}</p>
                  </div>
                ) : null}

                <dl className="mt-6 space-y-3 text-sm leading-6">
                  <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-3">
                    <dt className="text-muted-foreground">{t('turboEngine.summary.statusLabel')}</dt>
                    <dd className="commerce-premium-heading text-right font-medium">{statusSummary}</dd>
                  </div>
                </dl>

                <div className="mt-6 flex flex-col gap-3">
                  {shouldShowPurchaseAction ? (
                    <Button className="commerce-premium-button justify-between" onClick={() => void handlePurchase()} disabled={effectiveIsPurchasing || isPreviewing}>
                      <span className="inline-flex items-center gap-2">
                        {effectiveIsPurchasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        {effectiveIsPurchasing
                          ? t('turboEngine.actions.processing')
                          : t('turboEngine.actions.buy')}
                      </span>
                      {!effectiveIsPurchasing ? <ArrowRight className="h-4 w-4" /> : null}
                    </Button>
                  ) : null}

                  {!bridgeAndStoreAvailable ? (
                    <Button className="commerce-premium-button justify-between" onClick={() => void openStorePage(HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL)} disabled={isPreviewing}>
                      <span className="inline-flex items-center gap-2">
                        <BadgeCheck className="h-4 w-4" />
                        {t('turboEngine.actions.installStoreApp')}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  ) : null}

                  {effectiveBridgeAvailable ? (
                    <Button variant="outline" className="commerce-premium-button-secondary justify-between" onClick={() => void handleRefresh()} disabled={!canRefresh || isPreviewing}>
                      <span className="inline-flex items-center gap-2">
                        {canRefresh ? <RefreshCcw className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                        {canRefresh ? t('turboEngine.actions.refresh') : t('turboEngine.actions.refreshing')}
                      </span>
                      {canRefresh ? <ArrowRight className="h-4 w-4" /> : null}
                    </Button>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {effectiveSnapshot?.diagnostics.length ? (
        <section className="commerce-premium-shell rounded-3xl px-5 py-7 sm:px-8">
          <div className="relative z-10">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="commerce-premium-heading text-2xl font-semibold">{t('turboEngine.diagnostics.sectionTitle')}</h2>
            </div>

            <div className="mt-6 space-y-3">
              {effectiveSnapshot.diagnostics.map((diagnostic) => (
                <div key={`${diagnostic.code}-${diagnostic.recordedAt}`} className="commerce-premium-panel rounded-3xl p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <p className="commerce-premium-heading text-sm font-medium">{diagnostic.code}</p>
                    <p className="commerce-premium-copy text-xs">{formatTimestamp(diagnostic.recordedAt)}</p>
                  </div>
                  <p className="commerce-premium-copy mt-3 text-sm leading-6">{diagnostic.message}</p>
                  {diagnostic.detail ? (
                    <p className="commerce-premium-copy mt-2 text-xs leading-5">{diagnostic.detail}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="mx-auto max-w-3xl space-y-3">
        {effectiveIsStartupVerifying ? (
          <Alert className="commerce-premium-alert">
            <CalendarClock className="h-4 w-4" />
            <AlertTitle>{t('turboEngine.verifyingTitle')}</AlertTitle>
            <AlertDescription>{t('turboEngine.verifyingDescription')}</AlertDescription>
          </Alert>
        ) : null}

        {!effectiveSnapshot && effectiveError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('turboEngine.errorTitle')}</AlertTitle>
            <AlertDescription>{t('turboEngine.errorDescription', { error: effectiveError })}</AlertDescription>
          </Alert>
        ) : null}

        {effectiveSnapshot?.isStale ? (
          <Alert className="commerce-premium-alert">
            <CalendarClock className="h-4 w-4" />
            <AlertTitle>{t('turboEngine.stale.title')}</AlertTitle>
            <AlertDescription>{t('turboEngine.stale.description')}</AlertDescription>
          </Alert>
        ) : null}

        {effectiveLastPurchase ? (
          <Alert className="commerce-premium-alert">
            <BadgeCheck className="h-4 w-4" />
            <AlertTitle>{t('turboEngine.purchaseOutcome.title')}</AlertTitle>
            <AlertDescription>{t(`turboEngine.purchaseOutcome.${effectiveLastPurchase.outcome}`)}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <CommercePreviewDebugDialog
        open={previewDebug.dialogOpen}
        onOpenChange={previewDebug.setDialogOpen}
        scenario={previewDebug.scenario}
        onScenarioChange={previewDebug.setScenario}
      />
    </div>
  );
}
