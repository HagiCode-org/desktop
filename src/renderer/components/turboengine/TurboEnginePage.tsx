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
  Store,
} from 'lucide-react';
import {
  createDefaultTurboEngineLicenseSnapshot,
  HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL,
  HAGICODE_TURBOENGINE_STORE_ID,
  turboEngineEntitlementNames,
  type TurboEngineLicenseSnapshot,
} from '../../../types/turboengine-license.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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

function getStatusBadgeVariant(snapshot: TurboEngineLicenseSnapshot | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!snapshot) {
    return 'outline';
  }

  if (snapshot.availability !== 'supported') {
    return 'destructive';
  }

  if (snapshot.isStale) {
    return 'secondary';
  }

  return snapshot.status === 'active' ? 'default' : 'outline';
}

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
  const sourceKey = effectiveSnapshot?.source ?? 'initial';
  const bridgeAndStoreAvailable = effectiveBridgeAvailable && effectiveSnapshot?.availability === 'supported';
  const isActive = effectiveSnapshot?.status === 'active';
  const canRefresh = effectiveBridgeAvailable && !effectiveIsRefreshing && !effectiveIsStartupVerifying && !effectiveIsLoading;
  const shouldShowPurchaseAction = bridgeAndStoreAvailable && !isActive;
  const heroDescription = isActive
    ? t('turboEngine.hero.activeDescription')
    : t('turboEngine.hero.inactiveDescription');
  const actionHint = bridgeAndStoreAvailable
    ? (isActive ? t('turboEngine.actions.activeHint') : t('turboEngine.actions.buyHint'))
    : t('turboEngine.actions.handoffHint');

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <header className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <div className="flex flex-wrap justify-center gap-2">
          <Badge variant="outline" className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]">
            {t('turboEngine.summary.productName')}
          </Badge>
          <Badge variant={getStatusBadgeVariant(effectiveSnapshot)} className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.14em]">
            {t(`turboEngine.status.${statusKey}`)}
          </Badge>
          {effectiveSnapshot?.isStale ? (
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
              {t('turboEngine.staleBadge')}
            </Badge>
          ) : null}
          {effectiveIsStartupVerifying ? (
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
              {t('turboEngine.verifyingBadge')}
            </Badge>
          ) : null}
          {isPreviewing ? (
            <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
              {t('common:system.commercePanel.debug.previewBadge', {
                mode: getCommercePreviewScenarioLabel(t, previewDebug.scenario),
              })}
            </Badge>
          ) : null}
        </div>
        <button
          type="button"
          className="mt-5 max-w-3xl cursor-default bg-transparent p-0 text-3xl font-semibold tracking-[-0.02em] text-foreground [text-wrap:balance] sm:text-4xl lg:text-5xl"
          onClick={previewDebug.handleDebugTitleClick}
        >
          {t('turboEngine.hero.title')}
        </button>
        <p className="mt-4 max-w-[70ch] text-sm leading-7 text-muted-foreground sm:text-base">
          {heroDescription}
        </p>
      </header>

      <section className="commerce-premium-shell rounded-3xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="commerce-premium-kicker text-[11px] font-semibold uppercase tracking-[0.2em]">
              {t('turboEngine.runtime.sectionTitle')}
            </p>
            <h2 className="commerce-premium-heading mt-4 text-3xl font-semibold tracking-[-0.02em] [text-wrap:balance] sm:text-4xl">
              {t('turboEngine.summary.productName')}
            </h2>
            <p className="commerce-premium-copy mx-auto mt-4 max-w-[64ch] text-sm leading-7 sm:text-base">
              {actionHint}
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
            {effectiveIsLoading && !effectiveSnapshot ? (
              <div className="commerce-premium-panel flex flex-col items-center gap-3 rounded-3xl px-6 py-10 lg:col-span-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="commerce-premium-copy text-sm leading-6">{t('turboEngine.loading')}</p>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="commerce-premium-panel rounded-3xl p-5">
                    <p className="commerce-premium-kicker text-[11px] font-semibold uppercase tracking-[0.14em]">
                      {t('turboEngine.summary.statusLabel')}
                    </p>
                    <p className="commerce-premium-heading mt-3 text-lg font-medium">{t(`turboEngine.status.${statusKey}`)}</p>
                    <p className="commerce-premium-copy mt-3 text-sm leading-6">{heroDescription}</p>
                  </div>

                  <div className="commerce-premium-panel rounded-3xl p-5">
                    <p className="commerce-premium-kicker text-[11px] font-semibold uppercase tracking-[0.14em]">
                      {t('turboEngine.runtime.sectionTitle')}
                    </p>
                    <p className="commerce-premium-copy mt-3 text-sm leading-6">
                      {bridgeAndStoreAvailable
                        ? t('turboEngine.runtime.supported')
                        : t('turboEngine.runtime.unsupported')}
                    </p>
                    <div className="commerce-premium-copy mt-4 space-y-1 text-sm leading-6">
                      <p>
                        <span>{t('turboEngine.runtime.runtimeLabel')}</span>
                        {' '}
                        <span className="commerce-premium-heading font-medium">
                          {bridgeAndStoreAvailable ? t('turboEngine.runtime.storeEdition') : t('turboEngine.runtime.nonStoreEdition')}
                        </span>
                      </p>
                      <p>
                        <span>{t('turboEngine.runtime.sourceLabel')}</span>
                        {' '}
                        <span className="commerce-premium-heading font-medium">
                          {t(`turboEngine.sourceValue.${sourceKey}`, { defaultValue: sourceKey })}
                        </span>
                      </p>
                      <p>
                        <span className="commerce-premium-heading font-medium">
                          {t('turboEngine.summary.storeId', { storeId: HAGICODE_TURBOENGINE_STORE_ID })}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                <aside className="commerce-premium-panel rounded-3xl p-5 sm:p-6">
                  <p className="commerce-premium-kicker text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {t('turboEngine.actions.sectionTitle')}
                  </p>
                  <p className="commerce-premium-copy mt-3 text-sm leading-7">{actionHint}</p>

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
                </aside>
              </>
            )}
          </div>
        </div>
      </section>

      {effectiveSnapshot?.diagnostics.length ? (
        <section className="commerce-premium-shell rounded-3xl px-5 py-7 sm:px-8">
          <div className="relative z-10">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="commerce-premium-heading text-2xl font-semibold">{t('turboEngine.diagnostics.sectionTitle')}</h2>
              <p className="commerce-premium-copy mt-3 text-sm leading-6">
                {t('turboEngine.runtime.sourceLabel')} {t(`turboEngine.sourceValue.${sourceKey}`, { defaultValue: sourceKey })}
              </p>
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

        {!bridgeAndStoreAvailable ? (
          <Alert className="commerce-premium-alert">
            <Store className="h-4 w-4" />
            <AlertTitle>{t('turboEngine.unsupported.title')}</AlertTitle>
            <AlertDescription>
              {effectiveBridgeAvailable
                ? t('turboEngine.unsupported.description')
                : t('turboEngine.unsupported.nonStoreDescription')}
            </AlertDescription>
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
