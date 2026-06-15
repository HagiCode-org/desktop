import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CreditCard,
  Loader2,
  RefreshCcw,
  Store,
} from 'lucide-react';
import {
  createDefaultSubscriptionSnapshot,
  HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL,
  subscriptionEntitlementNames,
  type SubscriptionPurchaseOutcome,
  type SubscriptionSnapshot,
} from '../../../types/subscription.js';
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
  clearSubscriptionPurchaseResult,
  loadSubscriptionSnapshot,
  purchaseSubscription,
  refreshSubscriptionSnapshot,
  selectSubscriptionState,
} from '@/store/slices/subscriptionSlice';

function getStatusBadgeVariant(snapshot: SubscriptionSnapshot | null): 'default' | 'secondary' | 'destructive' | 'outline' {
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

function getStatusKey(snapshot: SubscriptionSnapshot | null): string {
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

function getPurchaseToastKind(outcome: SubscriptionPurchaseOutcome): 'success' | 'error' | 'message' {
  switch (outcome) {
    case 'succeeded':
    case 'already-purchased':
      return 'success';
    case 'canceled':
    case 'not-purchased':
      return 'message';
    default:
      return 'error';
  }
}

export default function SubscriptionPage() {
  const { t } = useTranslation(['pages', 'common']);
  const dispatch = useDispatch<AppDispatch>();
  const previewDebug = useCommercePreviewDebug();
  const subscriptionBridgeAvailable = typeof window.electronAPI.subscription?.getSnapshot === 'function';
  const {
    snapshot,
    lastPurchase,
    isLoading,
    isRefreshing,
    isPurchasing,
    error,
  } = useSelector((state: RootState) => selectSubscriptionState(state));

  useEffect(() => {
    if (subscriptionBridgeAvailable && !snapshot && !isLoading) {
      void dispatch(loadSubscriptionSnapshot());
    }
  }, [dispatch, isLoading, snapshot, subscriptionBridgeAvailable]);

  useEffect(() => () => {
    dispatch(clearSubscriptionPurchaseResult());
  }, [dispatch]);

  const handleRefresh = async () => {
    if (!subscriptionBridgeAvailable) {
      return;
    }

    const resultAction = await dispatch(refreshSubscriptionSnapshot());
    if (refreshSubscriptionSnapshot.fulfilled.match(resultAction)) {
      const nextSnapshot = resultAction.payload;
      if (nextSnapshot.isStale || nextSnapshot.availability !== 'supported') {
        toast.error(t('subscription.messages.refreshStale'));
        return;
      }

      toast.success(t('subscription.messages.refreshSuccess'));
      return;
    }

    const message = typeof resultAction.payload === 'string'
      ? resultAction.payload
      : resultAction.error.message ?? t('subscription.messages.refreshFailedFallback');
    toast.error(t('subscription.messages.refreshFailed', { error: message }));
  };

  const handlePurchase = async () => {
    if (!subscriptionBridgeAvailable) {
      return;
    }

    const resultAction = await dispatch(purchaseSubscription());
    if (!purchaseSubscription.fulfilled.match(resultAction)) {
      const message = typeof resultAction.payload === 'string'
        ? resultAction.payload
        : resultAction.error.message ?? t('subscription.messages.purchaseFailedFallback');
      toast.error(t('subscription.messages.purchaseFailed', { error: message }));
      return;
    }

    const toastKey = `subscription.purchaseOutcome.${resultAction.payload.outcome}`;
    const toastMessage = t(toastKey);

    switch (getPurchaseToastKind(resultAction.payload.outcome)) {
      case 'success':
        toast.success(toastMessage);
        break;
      case 'error':
        toast.error(toastMessage);
        break;
      default:
        toast(toastMessage);
        break;
    }
  };

  const openStorePage = async (url: string) => {
    const result = await window.electronAPI.openExternal(url);
    if (!result.success) {
      toast.error(t('subscription.messages.openStoreFailed', {
        error: result.error || t('subscription.messages.openStoreFailedFallback'),
      }));
    }
  };

  const isPreviewing = previewDebug.isPreviewing;
  const effectiveBridgeAvailable = previewDebug.scenario === 'live'
    ? subscriptionBridgeAvailable
    : previewDebug.scenario !== 'non-store';
  const effectiveSnapshot = previewDebug.scenario === 'live'
    ? snapshot
    : (previewDebug.scenario === 'non-store'
      ? null
      : createDefaultSubscriptionSnapshot({
        entitlements: previewDebug.scenario === 'active' ? [...subscriptionEntitlementNames] : [],
        source: 'store',
        status: previewDebug.scenario === 'active' ? 'active' : 'inactive',
      }));
  const effectiveLastPurchase = previewDebug.scenario === 'live' ? lastPurchase : null;
  const effectiveError = previewDebug.scenario === 'live' ? error : null;
  const effectiveIsLoading = previewDebug.scenario === 'live' ? isLoading : false;
  const effectiveIsRefreshing = previewDebug.scenario === 'live' ? isRefreshing : false;
  const effectiveIsPurchasing = previewDebug.scenario === 'live' ? isPurchasing : false;

  const statusKey = effectiveBridgeAvailable ? getStatusKey(effectiveSnapshot) : 'unsupported';
  const isActive = effectiveSnapshot?.status === 'active';
  const canPurchase = effectiveBridgeAvailable && effectiveSnapshot?.availability === 'supported' && !isActive;
  const statusDetail = isActive
    ? t('subscription.summary.activeDetail')
    : t('subscription.summary.inactiveDetail');
  const heroDescription = isActive
    ? t('subscription.hero.active.description')
    : t('subscription.hero.inactive.description');
  const supportNote = isActive
    ? t('subscription.message.activeThanks')
    : t('subscription.message.ongoingDescription');
  const actionTitle = isActive
    ? t('subscription.actions.manageTitle')
    : t('subscription.actions.buyTitle');
  const actionHint = effectiveBridgeAvailable
    ? (canPurchase
      ? t('subscription.actions.buyHint')
      : (isActive ? t('subscription.actions.activeHint') : t('subscription.actions.unsupportedHint')))
    : t('subscription.actions.installHint');

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <header className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <div className="flex flex-wrap justify-center gap-2">
          <Badge variant="outline" className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]">
            {t('subscription.summary.planName')}
          </Badge>
          <Badge variant={getStatusBadgeVariant(effectiveSnapshot)} className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.14em]">
            {t(`subscription.status.${statusKey}`)}
          </Badge>
          {effectiveSnapshot?.isStale ? (
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
              {t('subscription.staleBadge')}
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
          {t('subscription.title')}
        </button>
        <p className="mt-4 max-w-[70ch] text-sm leading-7 text-muted-foreground sm:text-base">
          {heroDescription}
        </p>
      </header>

      <section className="commerce-premium-shell rounded-3xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="commerce-premium-kicker text-[11px] font-semibold uppercase tracking-[0.2em]">
              {t('subscription.summary.planLabel')}
            </p>
            <h2 className="commerce-premium-heading mt-4 text-3xl font-semibold tracking-[-0.02em] [text-wrap:balance] sm:text-4xl">
              {t('subscription.summary.planName')}
            </h2>
            <p className="commerce-premium-copy mx-auto mt-4 max-w-[64ch] text-sm leading-7 sm:text-base">
              {supportNote}
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
            {effectiveIsLoading && !effectiveSnapshot ? (
              <div className="commerce-premium-panel flex flex-col items-center gap-3 rounded-3xl px-6 py-10 lg:col-span-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="commerce-premium-copy text-sm leading-6">{t('subscription.loading')}</p>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="commerce-premium-panel rounded-3xl p-5">
                    <p className="commerce-premium-kicker text-[11px] font-semibold uppercase tracking-[0.14em]">
                      {t('subscription.summary.planLabel')}
                    </p>
                    <p className="commerce-premium-heading mt-3 text-lg font-medium">{t('subscription.summary.planName')}</p>
                    <p className="commerce-premium-copy mt-3 text-sm leading-6">{statusDetail}</p>
                  </div>
                  <div className="commerce-premium-panel rounded-3xl p-5">
                    <p className="commerce-premium-kicker text-[11px] font-semibold uppercase tracking-[0.14em]">
                      {t('subscription.message.ongoingTitle')}
                    </p>
                    <p className="commerce-premium-copy mt-3 text-sm leading-6">{supportNote}</p>
                  </div>

                  <div className="commerce-premium-soft rounded-3xl p-5 sm:col-span-2">
                    <p className="commerce-premium-kicker text-[11px] font-semibold uppercase tracking-[0.14em]">
                      {t('subscription.message.unlockNoticeTitle')}
                    </p>
                    <p className="commerce-premium-heading mt-3 text-base font-medium">{actionTitle}</p>
                    <p className="commerce-premium-copy mt-3 text-sm leading-6">
                      {t('subscription.message.unlockNoticeDescription')}
                    </p>
                  </div>
                </div>

                <aside className="commerce-premium-panel rounded-3xl p-5 sm:p-6">
                  <p className="commerce-premium-kicker text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {actionTitle}
                  </p>
                  <p className="commerce-premium-copy mt-3 text-sm leading-7">{actionHint}</p>

                  {effectiveBridgeAvailable ? (
                    <div className="mt-6 flex flex-col gap-3">
                      {canPurchase ? (
                        <Button className="commerce-premium-button justify-between" onClick={() => void handlePurchase()} disabled={effectiveIsPurchasing || isPreviewing}>
                          <span className="inline-flex items-center gap-2">
                            {effectiveIsPurchasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                            {effectiveIsPurchasing
                              ? t('subscription.actions.processing')
                              : t('subscription.actions.buy')}
                          </span>
                          {!effectiveIsPurchasing ? <ArrowRight className="h-4 w-4" /> : null}
                        </Button>
                      ) : null}
                      <Button variant="outline" className="commerce-premium-button-secondary justify-between" onClick={() => void handleRefresh()} disabled={effectiveIsRefreshing || effectiveIsLoading || isPreviewing}>
                        <span className="inline-flex items-center gap-2">
                          {effectiveIsRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                          {effectiveIsRefreshing ? t('subscription.actions.refreshing') : t('subscription.actions.refresh')}
                        </span>
                        {!effectiveIsRefreshing ? <ArrowRight className="h-4 w-4" /> : null}
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-6 flex flex-col gap-3">
                      <Button className="commerce-premium-button justify-between" onClick={() => void openStorePage(HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL)} disabled={isPreviewing}>
                        <span className="inline-flex items-center gap-2">
                          <BadgeCheck className="h-4 w-4" />
                          {t('subscription.actions.installStoreApp')}
                        </span>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </aside>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-3">
        {!effectiveSnapshot && effectiveError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('subscription.errorTitle')}</AlertTitle>
            <AlertDescription>{t('subscription.errorDescription', { error: effectiveError })}</AlertDescription>
          </Alert>
        ) : null}

        {!effectiveBridgeAvailable || effectiveSnapshot?.availability !== 'supported' ? (
          <Alert className="commerce-premium-alert">
            <Store className="h-4 w-4" />
            <AlertTitle>{t('subscription.unsupported.title')}</AlertTitle>
            <AlertDescription>
              {effectiveBridgeAvailable
                ? t('subscription.unsupported.description')
                : t('subscription.unsupported.nonStoreDescription')}
            </AlertDescription>
          </Alert>
        ) : null}

        {effectiveSnapshot?.isStale ? (
          <Alert className="commerce-premium-alert">
            <CalendarClock className="h-4 w-4" />
            <AlertTitle>{t('subscription.stale.title')}</AlertTitle>
            <AlertDescription>{t('subscription.stale.description')}</AlertDescription>
          </Alert>
        ) : null}

        {effectiveLastPurchase ? (
          <Alert className="commerce-premium-alert">
            <BadgeCheck className="h-4 w-4" />
            <AlertTitle>{t('subscription.purchaseOutcome.title')}</AlertTitle>
            <AlertDescription>{t(`subscription.purchaseOutcome.${effectiveLastPurchase.outcome}`)}</AlertDescription>
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
