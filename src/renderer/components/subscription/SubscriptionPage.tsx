import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import {
  AlertCircle,
  BadgeCheck,
  CalendarClock,
  CreditCard,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Store,
} from 'lucide-react';
import {
  HAGICODE_SPONSOR_PLAN_STORE_ID,
  subscriptionEntitlementNames,
  type SubscriptionDiagnostic,
  type SubscriptionPurchaseOutcome,
  type SubscriptionSnapshot,
} from '../../../types/subscription.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppDispatch, RootState } from '@/store';
import {
  clearSubscriptionPurchaseResult,
  loadSubscriptionSnapshot,
  purchaseSubscription,
  refreshSubscriptionSnapshot,
  selectHasSubscriptionEntitlement,
  selectSubscriptionState,
} from '@/store/slices/subscriptionSlice';

function formatTimestamp(value: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

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

function DiagnosticList({ diagnostics }: { diagnostics: SubscriptionDiagnostic[] }) {
  const { t } = useTranslation('pages');

  if (diagnostics.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('subscription.diagnostics.empty')}</p>;
  }

  return (
    <div className="space-y-3">
      {diagnostics.map((diagnostic) => (
        <div key={`${diagnostic.code}-${diagnostic.recordedAt}`} className="rounded-xl border border-border/70 bg-background/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">{diagnostic.message}</p>
            <Badge variant="outline" className="text-[10px] uppercase tracking-[0.14em]">
              {diagnostic.code}
            </Badge>
          </div>
          {diagnostic.detail ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{diagnostic.detail}</p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">{formatTimestamp(diagnostic.recordedAt)}</p>
        </div>
      ))}
    </div>
  );
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
  const sponsorBadgeEnabled = useSelector((state: RootState) => selectHasSubscriptionEntitlement(state, 'sponsorBadge'));
  const premiumFeatureEnabled = useSelector((state: RootState) => selectHasSubscriptionEntitlement(state, 'premiumFeatureGate'));

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
  const entitlementState = {
    sponsorBadge: sponsorBadgeEnabled,
    premiumFeatureGate: premiumFeatureEnabled,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card className="overflow-hidden border-border/80 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.02),rgba(15,23,42,0.08))] shadow-md">
        <CardHeader className="gap-6 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.24em]">
                {t('subscription.eyebrow')}
              </Badge>
              <div className="space-y-2">
                <CardTitle className="text-3xl">{t('subscription.title')}</CardTitle>
                <CardDescription className="max-w-3xl text-sm leading-6">
                  {t('subscription.description')}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={getStatusBadgeVariant(snapshot)} className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
                  {t(`subscription.status.${statusKey}`)}
                </Badge>
                {snapshot?.status === 'active' && snapshot.expirationDate ? (
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                    {t('subscription.renewalOrExpiry', { value: formatTimestamp(snapshot.expirationDate) })}
                  </Badge>
                ) : null}
                {snapshot?.isStale ? (
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                    {t('subscription.staleBadge')}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void handleRefresh()} disabled={isRefreshing || isLoading}>
                {isRefreshing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('subscription.actions.refreshing')}
                  </>
                ) : (
                  <>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    {t('subscription.actions.refresh')}
                  </>
                )}
              </Button>
              <Button onClick={() => void handlePurchase()} disabled={!canPurchase || isPurchasing}>
                {isPurchasing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('subscription.actions.processing')}
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    {snapshot?.status === 'active'
                      ? t('subscription.actions.manage')
                      : t('subscription.actions.buy')}
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background/75 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('subscription.summary.planLabel')}</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{t('subscription.summary.planName')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{HAGICODE_SPONSOR_PLAN_STORE_ID}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/75 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('subscription.summary.lastSyncLabel')}</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{formatTimestamp(snapshot?.lastSuccessfulSyncAt ?? null)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('subscription.summary.source', {
                  value: t(`subscription.sourceValue.${snapshot?.source ?? 'cache'}`),
                })}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/75 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('subscription.summary.entitlementsLabel')}</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{snapshot?.entitlements.length ?? 0}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('subscription.summary.entitlementsHint')}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {isLoading && !snapshot ? (
        <Card className="border-dashed border-border/80 bg-muted/15">
          <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 pt-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t('subscription.loading')}</p>
          </CardContent>
        </Card>
      ) : null}

      {!snapshot && error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('subscription.errorTitle')}</AlertTitle>
          <AlertDescription>{t('subscription.errorDescription', { error })}</AlertDescription>
        </Alert>
      ) : null}

      {snapshot ? (
        <>
          {snapshot.availability !== 'supported' ? (
            <Alert>
              <Store className="h-4 w-4" />
              <AlertTitle>{t('subscription.unsupported.title')}</AlertTitle>
              <AlertDescription>{t('subscription.unsupported.description')}</AlertDescription>
            </Alert>
          ) : null}

          {snapshot.isStale ? (
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

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <Card className="border-border/80 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Store className="h-5 w-5 text-primary" />
                    {t('subscription.stateCard.title')}
                  </CardTitle>
                  <CardDescription>{t('subscription.stateCard.description')}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('subscription.fields.status')}</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{t(`subscription.status.${statusKey}`)}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('subscription.fields.planStoreId')}</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{snapshot.planStoreId}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('subscription.fields.lastCheckedAt')}</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{formatTimestamp(snapshot.lastCheckedAt)}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('subscription.fields.expirationDate')}</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{formatTimestamp(snapshot.expirationDate)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/80 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    {t('subscription.entitlements.title')}
                  </CardTitle>
                  <CardDescription>{t('subscription.entitlements.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {subscriptionEntitlementNames.map((entitlement) => {
                    const enabled = entitlementState[entitlement];

                    return (
                      <div key={entitlement} className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{t(`subscription.entitlements.names.${entitlement}`)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{t(`subscription.entitlements.details.${entitlement}`)}</p>
                        </div>
                        <Badge variant={enabled ? 'default' : 'outline'}>
                          {enabled ? t('subscription.entitlements.enabled') : t('subscription.entitlements.disabled')}
                        </Badge>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/80 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <AlertCircle className="h-5 w-5 text-primary" />
                  {t('subscription.diagnostics.title')}
                </CardTitle>
                <CardDescription>{t('subscription.diagnostics.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('subscription.diagnostics.lastSuccessfulSync')}</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{formatTimestamp(snapshot.lastSuccessfulSyncAt)}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('subscription.diagnostics.source')}</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{t(`subscription.sourceValue.${snapshot.source}`)}</p>
                  </div>
                </div>

                <DiagnosticList diagnostics={snapshot.diagnostics} />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
