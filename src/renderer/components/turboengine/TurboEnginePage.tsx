import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Cpu,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Store,
} from 'lucide-react';
import {
  HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL,
  HAGICODE_TURBOENGINE_STORE_ID,
  HAGICODE_TURBOENGINE_STORE_WEB_URL,
  type TurboEngineLicenseSnapshot,
} from '../../../types/turboengine-license.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  const { t } = useTranslation('pages');
  const dispatch = useDispatch<AppDispatch>();
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

  const statusKey = turboEngineBridgeAvailable ? getStatusKey(snapshot) : 'unsupported';
  const bridgeAndStoreAvailable = turboEngineBridgeAvailable && snapshot?.availability === 'supported';
  const isActive = snapshot?.status === 'active';

  return (
    <div className="mx-auto max-w-5xl pb-10">
      <section className="relative overflow-hidden rounded-[36px] border border-border/80 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] p-6 shadow-[0_20px_56px_rgba(20,28,40,0.08)] dark:bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.18),transparent_34%),linear-gradient(180deg,rgba(15,21,37,0.98),rgba(22,30,49,0.96))] sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
          <div className="space-y-6">
            <div className="space-y-3">
              <Badge variant="outline" className="rounded-full border-border/80 bg-background/80 px-3 py-1 text-[10px] uppercase tracking-[0.24em]">
                {t('turboEngine.eyebrow')}
              </Badge>
              <h1 className="max-w-[12ch] text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {t('turboEngine.hero.title')}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                {isActive ? t('turboEngine.hero.activeDescription') : t('turboEngine.hero.inactiveDescription')}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={getStatusBadgeVariant(snapshot)} className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
                {t(`turboEngine.status.${statusKey}`)}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                {t('turboEngine.summary.productName')}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                {t('turboEngine.summary.storeId', { storeId: HAGICODE_TURBOENGINE_STORE_ID })}
              </Badge>
              {snapshot?.isStale ? (
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                  {t('turboEngine.staleBadge')}
                </Badge>
              ) : null}
              {isStartupVerifying ? (
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                  {t('turboEngine.verifyingBadge')}
                </Badge>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('turboEngine.summary.statusLabel')}
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {t(`turboEngine.status.${statusKey}`)}
                </p>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('turboEngine.summary.lastCheckedLabel')}
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {formatTimestamp(snapshot?.lastCheckedAt ?? null)}
                </p>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('turboEngine.summary.lastSuccessLabel')}
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {formatTimestamp(snapshot?.lastSuccessfulSyncAt ?? null)}
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-border/70 bg-background/70 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t('turboEngine.actions.sectionTitle')}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-foreground/85">
                    {bridgeAndStoreAvailable
                      ? (isActive ? t('turboEngine.actions.manageHint') : t('turboEngine.actions.buyHint'))
                      : t('turboEngine.actions.handoffHint')}
                  </p>
                </div>
                <Cpu className="h-5 w-5 text-amber-500" />
              </div>

              {bridgeAndStoreAvailable ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Button className="h-11 min-w-[220px] justify-between" onClick={() => void handlePurchase()} disabled={isPurchasing}>
                    <span className="inline-flex items-center gap-2">
                      {isPurchasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      {isPurchasing
                        ? t('turboEngine.actions.processing')
                        : (isActive ? t('turboEngine.actions.manage') : t('turboEngine.actions.buy'))}
                    </span>
                    {!isPurchasing ? <ArrowRight className="h-4 w-4" /> : null}
                  </Button>
                  <Button variant="outline" className="h-11 min-w-[220px] justify-between" onClick={() => void handleRefresh()} disabled={isRefreshing || isStartupVerifying || isLoading}>
                    <span className="inline-flex items-center gap-2">
                      {isRefreshing || isStartupVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                      {isRefreshing || isStartupVerifying ? t('turboEngine.actions.refreshing') : t('turboEngine.actions.refresh')}
                    </span>
                    {!(isRefreshing || isStartupVerifying) ? <ArrowRight className="h-4 w-4" /> : null}
                  </Button>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Button className="h-11 min-w-[220px] justify-between" onClick={() => void openStorePage(HAGICODE_TURBOENGINE_STORE_WEB_URL)}>
                    <span className="inline-flex items-center gap-2">
                      <Store className="h-4 w-4" />
                      {t('turboEngine.actions.openStoreProduct')}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="h-11 min-w-[220px] justify-between" onClick={() => void openStorePage(HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL)}>
                    <span className="inline-flex items-center gap-2">
                      <BadgeCheck className="h-4 w-4" />
                      {t('turboEngine.actions.installStoreApp')}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-border/70 bg-background/80 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('turboEngine.runtime.sectionTitle')}
              </p>
              <p className="mt-3 text-sm leading-6 text-foreground/85">
                {bridgeAndStoreAvailable
                  ? t('turboEngine.runtime.supported')
                  : t('turboEngine.runtime.unsupported')}
              </p>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-4">
                  <span>{t('turboEngine.runtime.runtimeLabel')}</span>
                  <span className="font-medium text-foreground">{bridgeAndStoreAvailable ? t('turboEngine.runtime.storeEdition') : t('turboEngine.runtime.nonStoreEdition')}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>{t('turboEngine.runtime.sourceLabel')}</span>
                  <span className="font-medium text-foreground">{snapshot?.source ?? 'cache'}</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border/70 bg-background/80 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('turboEngine.diagnostics.sectionTitle')}
              </p>
              {snapshot?.diagnostics.length ? (
                <div className="mt-3 space-y-3">
                  {snapshot.diagnostics.map((diagnostic) => (
                    <div key={`${diagnostic.code}-${diagnostic.recordedAt}`} className="rounded-2xl border border-border/70 bg-background/80 p-3">
                      <p className="text-sm font-medium text-foreground">{diagnostic.code}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{diagnostic.message}</p>
                      {diagnostic.detail ? (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{diagnostic.detail}</p>
                      ) : null}
                      <p className="mt-2 text-xs text-muted-foreground">{formatTimestamp(diagnostic.recordedAt)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('turboEngine.diagnostics.empty')}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 space-y-3">
        {!snapshot && isLoading ? (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertTitle>{t('turboEngine.loadingTitle')}</AlertTitle>
            <AlertDescription>{t('turboEngine.loading')}</AlertDescription>
          </Alert>
        ) : null}

        {isStartupVerifying ? (
          <Alert>
            <CalendarClock className="h-4 w-4" />
            <AlertTitle>{t('turboEngine.verifyingTitle')}</AlertTitle>
            <AlertDescription>{t('turboEngine.verifyingDescription')}</AlertDescription>
          </Alert>
        ) : null}

        {!snapshot && error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('turboEngine.errorTitle')}</AlertTitle>
            <AlertDescription>{t('turboEngine.errorDescription', { error })}</AlertDescription>
          </Alert>
        ) : null}

        {!bridgeAndStoreAvailable ? (
          <Alert>
            <Store className="h-4 w-4" />
            <AlertTitle>{t('turboEngine.unsupported.title')}</AlertTitle>
            <AlertDescription>
              {turboEngineBridgeAvailable
                ? t('turboEngine.unsupported.description')
                : t('turboEngine.unsupported.nonStoreDescription')}
            </AlertDescription>
          </Alert>
        ) : null}

        {snapshot?.isStale ? (
          <Alert>
            <CalendarClock className="h-4 w-4" />
            <AlertTitle>{t('turboEngine.stale.title')}</AlertTitle>
            <AlertDescription>{t('turboEngine.stale.description')}</AlertDescription>
          </Alert>
        ) : null}

        {lastPurchase ? (
          <Alert>
            <BadgeCheck className="h-4 w-4" />
            <AlertTitle>{t('turboEngine.purchaseOutcome.title')}</AlertTitle>
            <AlertDescription>{t(`turboEngine.purchaseOutcome.${lastPurchase.outcome}`)}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
