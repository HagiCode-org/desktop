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
  type SubscriptionPurchaseOutcome,
  type SubscriptionSnapshot,
} from '../../../types/subscription.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  const { t } = useTranslation('pages');
  const dispatch = useDispatch<AppDispatch>();
  const {
    snapshot,
    lastPurchase,
    isLoading,
    isRefreshing,
    isPurchasing,
    error,
  } = useSelector((state: RootState) => selectSubscriptionState(state));

  useEffect(() => {
    if (!snapshot && !isLoading) {
      void dispatch(loadSubscriptionSnapshot());
    }
  }, [dispatch, isLoading, snapshot]);

  useEffect(() => () => {
    dispatch(clearSubscriptionPurchaseResult());
  }, [dispatch]);

  const handleRefresh = async () => {
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

  const statusKey = getStatusKey(snapshot);
  const canPurchase = snapshot?.availability === 'supported';
  const isActive = snapshot?.status === 'active';

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <section className="relative mx-auto max-w-2xl overflow-hidden rounded-[36px] border border-border/80 bg-[radial-gradient(circle_at_top,rgba(53,99,233,0.16),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_18px_48px_rgba(22,32,51,0.08)] dark:bg-[radial-gradient(circle_at_top,rgba(53,99,233,0.22),transparent_38%),linear-gradient(180deg,rgba(15,21,37,0.98),rgba(22,30,49,0.96))] dark:shadow-[0_18px_48px_rgba(8,12,24,0.28)] sm:p-8">
        <div className="space-y-6 text-center">
          <Badge variant="outline" className="rounded-full border-border/80 bg-background/80 px-3 py-1 text-[10px] uppercase tracking-[0.24em]">
            {t('subscription.eyebrow')}
          </Badge>

          <div className="space-y-3">
            <h1 className="mx-auto max-w-[14ch] text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {isActive ? t('subscription.hero.active.title') : t('subscription.hero.inactive.title')}
            </h1>
            <p className="mx-auto max-w-[34rem] text-sm leading-6 text-muted-foreground sm:text-base">
              {isActive ? t('subscription.hero.active.description') : t('subscription.hero.inactive.description')}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Badge variant={getStatusBadgeVariant(snapshot)} className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
              {t(`subscription.status.${statusKey}`)}
            </Badge>
            {snapshot?.isStale ? (
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                {t('subscription.staleBadge')}
              </Badge>
            ) : null}
            <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
              {t('subscription.summary.planName')}
            </Badge>
          </div>

          {isLoading && !snapshot ? (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border/80 bg-background/60 px-6 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm leading-6 text-muted-foreground">{t('subscription.loading')}</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 text-left sm:grid-cols-2">
                <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t('subscription.message.ongoingTitle')}
                  </p>
                  <p className="mt-2 text-sm font-medium leading-6 text-foreground">
                    {t('subscription.message.ongoingDescription')}
                  </p>
                </div>
                <div className="rounded-3xl border border-border/70 bg-background/75 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t('subscription.message.perksTitle')}
                  </p>
                  <p className="mt-2 text-sm font-medium leading-6 text-foreground">
                    {t('subscription.message.perksDescription')}
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                  {t('subscription.message.unlockNoticeTitle')}
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-foreground">
                  {t('subscription.message.unlockNoticeDescription')}
                </p>
              </div>

              <p className="text-sm leading-6 text-foreground/85">
                {isActive ? t('subscription.message.activeThanks') : t('subscription.message.inactivePrompt')}
              </p>

              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Button className="h-11 min-w-[220px] justify-between" onClick={() => void handlePurchase()} disabled={!canPurchase || isPurchasing}>
                  <span className="inline-flex items-center gap-2">
                    {isPurchasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    {isPurchasing
                      ? t('subscription.actions.processing')
                      : (isActive ? t('subscription.actions.manage') : t('subscription.actions.buy'))}
                  </span>
                  {!isPurchasing ? <ArrowRight className="h-4 w-4" /> : null}
                </Button>
                <Button variant="outline" className="h-11 min-w-[220px] justify-between" onClick={() => void handleRefresh()} disabled={isRefreshing || isLoading}>
                  <span className="inline-flex items-center gap-2">
                    {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    {isRefreshing ? t('subscription.actions.refreshing') : t('subscription.actions.refresh')}
                  </span>
                  {!isRefreshing ? <ArrowRight className="h-4 w-4" /> : null}
                </Button>
              </div>

              <p className="text-sm leading-6 text-muted-foreground">
                {canPurchase
                  ? (isActive ? t('subscription.actions.manageHint') : t('subscription.actions.buyHint'))
                  : t('subscription.actions.unsupportedHint')}
              </p>
            </>
          )}
        </div>
      </section>

      <div className="mx-auto mt-4 max-w-2xl space-y-3">
        {!snapshot && error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('subscription.errorTitle')}</AlertTitle>
            <AlertDescription>{t('subscription.errorDescription', { error })}</AlertDescription>
          </Alert>
        ) : null}

        {snapshot?.availability !== 'supported' ? (
          <Alert>
            <Store className="h-4 w-4" />
            <AlertTitle>{t('subscription.unsupported.title')}</AlertTitle>
            <AlertDescription>{t('subscription.unsupported.description')}</AlertDescription>
          </Alert>
        ) : null}

        {snapshot?.isStale ? (
          <Alert>
            <CalendarClock className="h-4 w-4" />
            <AlertTitle>{t('subscription.stale.title')}</AlertTitle>
            <AlertDescription>{t('subscription.stale.description')}</AlertDescription>
          </Alert>
        ) : null}

        {lastPurchase ? (
          <Alert>
            <BadgeCheck className="h-4 w-4" />
            <AlertTitle>{t('subscription.purchaseOutcome.title')}</AlertTitle>
            <AlertDescription>{t(`subscription.purchaseOutcome.${lastPurchase.outcome}`)}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
