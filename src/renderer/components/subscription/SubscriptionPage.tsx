import { useEffect, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CreditCard,
  HeartHandshake,
  Loader2,
  Palette,
  RefreshCcw,
  Rocket,
  ShieldCheck,
  Sparkles,
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

function SurfaceSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-border/80 bg-card/95 p-6 shadow-sm sm:p-7">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h2>
        <p className="max-w-[68ch] text-sm leading-7 text-muted-foreground">{description}</p>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function SummaryStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-3xl border border-border/70 bg-background/80 px-4 py-4 shadow-sm sm:px-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-3 text-lg font-semibold tracking-tight text-foreground">{value}</p>
      {detail ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function StoryItem({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-3 rounded-3xl border border-border/70 bg-background/70 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-base font-semibold tracking-tight text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-7 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function SnapshotField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-border/70 py-3 last:border-b-0 last:pb-0 first:pt-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-sm font-medium leading-6 text-foreground break-all">{value}</dd>
    </div>
  );
}

function DiagnosticList({ diagnostics }: { diagnostics: SubscriptionDiagnostic[] }) {
  const { t } = useTranslation('pages');

  if (diagnostics.length === 0) {
    return <p className="text-sm leading-7 text-muted-foreground">{t('subscription.diagnostics.empty')}</p>;
  }

  return (
    <div className="space-y-3">
      {diagnostics.map((diagnostic) => (
        <div key={`${diagnostic.code}-${diagnostic.recordedAt}`} className="rounded-3xl border border-border/70 bg-background/75 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-[40ch] text-sm font-medium leading-6 text-foreground">{diagnostic.message}</p>
            <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]">
              {diagnostic.code}
            </Badge>
          </div>
          {diagnostic.detail ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{diagnostic.detail}</p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">{formatTimestamp(diagnostic.recordedAt)}</p>
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
  const isActive = snapshot?.status === 'active';
  const planStoreId = snapshot?.planStoreId ?? HAGICODE_SPONSOR_PLAN_STORE_ID;
  const lifecycleValue = formatTimestamp(snapshot?.renewalDate ?? snapshot?.expirationDate ?? null);
  const lifecycleLabel = isActive
    ? t('subscription.snapshot.fields.renewalDate')
    : t('subscription.snapshot.fields.expirationDate');
  const entitlementState = {
    sponsorBadge: sponsorBadgeEnabled,
    premiumFeatureGate: premiumFeatureEnabled,
  };

  const storyItems = isActive
    ? [
      {
        icon: HeartHandshake,
        title: t('subscription.gratitude.points.continuity.title'),
        description: t('subscription.gratitude.points.continuity.description'),
      },
      {
        icon: Palette,
        title: t('subscription.gratitude.points.benefits.title'),
        description: t('subscription.gratitude.points.benefits.description'),
      },
      {
        icon: Rocket,
        title: t('subscription.gratitude.points.roadmap.title'),
        description: t('subscription.gratitude.points.roadmap.description'),
      },
    ]
    : [
      {
        icon: Rocket,
        title: t('subscription.mission.points.evolution.title'),
        description: t('subscription.mission.points.evolution.description'),
      },
      {
        icon: Store,
        title: t('subscription.mission.points.investment.title'),
        description: t('subscription.mission.points.investment.description'),
      },
      {
        icon: Palette,
        title: t('subscription.mission.points.rewards.title'),
        description: t('subscription.mission.points.rewards.description'),
      },
    ];

  const benefitItems = [
    {
      icon: BadgeCheck,
      title: t('subscription.benefits.items.recognition.title'),
      description: t('subscription.benefits.items.recognition.description'),
    },
    {
      icon: Sparkles,
      title: t('subscription.benefits.items.theme.title'),
      description: t('subscription.benefits.items.theme.description'),
    },
    {
      icon: ShieldCheck,
      title: t('subscription.benefits.items.future.title'),
      description: t('subscription.benefits.items.future.description'),
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] space-y-8 pb-8">
      <section className="relative overflow-hidden rounded-[32px] border border-border/80 bg-[radial-gradient(circle_at_top_left,rgba(53,99,233,0.16),transparent_34%),radial-gradient(circle_at_86%_18%,rgba(16,185,129,0.12),transparent_26%),linear-gradient(145deg,rgba(250,252,254,0.98),rgba(238,242,248,0.92))] p-6 shadow-[0_18px_48px_rgba(22,32,51,0.08)] dark:bg-[radial-gradient(circle_at_top_left,rgba(53,99,233,0.22),transparent_34%),radial-gradient(circle_at_86%_18%,rgba(16,185,129,0.16),transparent_26%),linear-gradient(145deg,rgba(15,21,37,0.98),rgba(22,30,49,0.96))] dark:shadow-[0_18px_48px_rgba(8,12,24,0.28)] sm:p-8">
        <div className="absolute inset-y-0 right-0 hidden w-[34%] bg-[radial-gradient(circle_at_center,rgba(53,99,233,0.14),transparent_62%)] xl:block" aria-hidden="true" />
        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="space-y-6">
            <div className="space-y-4">
              <Badge variant="outline" className="rounded-full border-border/80 bg-background/80 px-3 py-1 text-[10px] uppercase tracking-[0.24em]">
                {t('subscription.eyebrow')}
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-[18ch] text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {isActive ? t('subscription.hero.active.title') : t('subscription.hero.inactive.title')}
                </h1>
                <p className="max-w-[65ch] text-sm leading-7 text-muted-foreground sm:text-base">
                  {isActive ? t('subscription.hero.active.description') : t('subscription.hero.inactive.description')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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

            <p className="max-w-[68ch] text-sm leading-7 text-foreground/85">
              {isActive ? t('subscription.hero.active.note') : t('subscription.hero.inactive.note')}
            </p>

            <div className="grid gap-3 md:grid-cols-3">
              <SummaryStat
                label={t('subscription.summary.planLabel')}
                value={t('subscription.summary.planName')}
                detail={planStoreId}
              />
              <SummaryStat
                label={isActive ? t('subscription.summary.renewalLabel') : t('subscription.summary.lastSyncLabel')}
                value={isActive ? lifecycleValue : formatTimestamp(snapshot?.lastSuccessfulSyncAt ?? null)}
                detail={t('subscription.summary.source', {
                  value: t(`subscription.sourceValue.${snapshot?.source ?? 'cache'}`),
                })}
              />
              <SummaryStat
                label={t('subscription.summary.entitlementsLabel')}
                value={String(snapshot?.entitlements.length ?? 0)}
                detail={isActive ? t('subscription.summary.activeDetail') : t('subscription.summary.inactiveDetail')}
              />
            </div>
          </div>

          <aside className="rounded-[28px] border border-border/80 bg-background/88 p-5 shadow-sm backdrop-blur-sm sm:p-6 xl:sticky xl:top-6">
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('subscription.actions.panelEyebrow')}
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  {isActive ? t('subscription.actions.manageTitle') : t('subscription.actions.buyTitle')}
                </h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  {canPurchase
                    ? (isActive ? t('subscription.actions.manageHint') : t('subscription.actions.buyHint'))
                    : t('subscription.actions.unsupportedHint')}
                </p>
              </div>

              <div className="space-y-3">
                <Button className="h-11 w-full justify-between" onClick={() => void handlePurchase()} disabled={!canPurchase || isPurchasing}>
                  <span className="inline-flex items-center gap-2">
                    {isPurchasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    {isPurchasing
                      ? t('subscription.actions.processing')
                      : (isActive ? t('subscription.actions.manage') : t('subscription.actions.buy'))}
                  </span>
                  {!isPurchasing ? <ArrowRight className="h-4 w-4" /> : null}
                </Button>
                <Button variant="outline" className="h-11 w-full justify-between" onClick={() => void handleRefresh()} disabled={isRefreshing || isLoading}>
                  <span className="inline-flex items-center gap-2">
                    {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    {isRefreshing ? t('subscription.actions.refreshing') : t('subscription.actions.refresh')}
                  </span>
                  {!isRefreshing ? <ArrowRight className="h-4 w-4" /> : null}
                </Button>
              </div>

              <div className="rounded-3xl border border-border/70 bg-muted/20 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t('subscription.actions.secondaryLabel')}
                </p>
                <p className="mt-2 text-sm leading-7 text-foreground/90">{t('subscription.actions.secondaryHint')}</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {isLoading && !snapshot ? (
        <div className="rounded-[28px] border border-dashed border-border/80 bg-muted/15 px-6 py-12 text-center shadow-sm">
          <div className="mx-auto flex max-w-md flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm leading-7 text-muted-foreground">{t('subscription.loading')}</p>
          </div>
        </div>
      ) : null}

      {!snapshot && error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('subscription.errorTitle')}</AlertTitle>
          <AlertDescription>{t('subscription.errorDescription', { error })}</AlertDescription>
        </Alert>
      ) : null}

      {snapshot ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <SurfaceSection
              eyebrow={isActive ? t('subscription.gratitude.eyebrow') : t('subscription.mission.eyebrow')}
              title={isActive ? t('subscription.gratitude.title') : t('subscription.mission.title')}
              description={isActive ? t('subscription.gratitude.description') : t('subscription.mission.description')}
            >
              <div className="grid gap-4 lg:grid-cols-3">
                {storyItems.map((item) => (
                  <StoryItem key={item.title} icon={item.icon} title={item.title} description={item.description} />
                ))}
              </div>
            </SurfaceSection>

            <SurfaceSection
              eyebrow={t('subscription.benefits.eyebrow')}
              title={t('subscription.benefits.title')}
              description={t('subscription.benefits.description')}
            >
              <div className="grid gap-4 lg:grid-cols-3">
                {benefitItems.map((item) => (
                  <StoryItem key={item.title} icon={item.icon} title={item.title} description={item.description} />
                ))}
              </div>
            </SurfaceSection>

            <SurfaceSection
              eyebrow={t('subscription.snapshot.eyebrow')}
              title={t('subscription.snapshot.title')}
              description={t('subscription.snapshot.description')}
            >
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.88fr)] lg:gap-8">
                <dl>
                  <SnapshotField label={t('subscription.snapshot.fields.status')} value={t(`subscription.status.${statusKey}`)} />
                  <SnapshotField label={t('subscription.snapshot.fields.planStoreId')} value={snapshot.planStoreId} />
                  <SnapshotField label={t('subscription.snapshot.fields.lastCheckedAt')} value={formatTimestamp(snapshot.lastCheckedAt)} />
                  <SnapshotField label={lifecycleLabel} value={lifecycleValue} />
                  <SnapshotField label={t('subscription.snapshot.fields.lastSuccessfulSync')} value={formatTimestamp(snapshot.lastSuccessfulSyncAt)} />
                  <SnapshotField label={t('subscription.snapshot.fields.source')} value={t(`subscription.sourceValue.${snapshot.source}`)} />
                </dl>

                <div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">{t('subscription.entitlements.title')}</h3>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {isActive ? t('subscription.entitlements.activeDescription') : t('subscription.entitlements.inactiveDescription')}
                    </p>
                  </div>
                  <div className="mt-5 space-y-3">
                    {subscriptionEntitlementNames.map((entitlement) => {
                      const enabled = entitlementState[entitlement];

                      return (
                        <div key={entitlement} className="rounded-3xl border border-border/70 bg-background/70 px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground">{t(`subscription.entitlements.names.${entitlement}`)}</p>
                            <Badge variant={enabled ? 'default' : 'outline'}>
                              {enabled ? t('subscription.entitlements.enabled') : t('subscription.entitlements.disabled')}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`subscription.entitlements.details.${entitlement}`)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </SurfaceSection>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
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

            <SurfaceSection
              eyebrow={t('subscription.diagnostics.eyebrow')}
              title={t('subscription.diagnostics.title')}
              description={t('subscription.diagnostics.description')}
            >
              <div className="space-y-4">
                <div className="grid gap-3">
                  <SummaryStat
                    label={t('subscription.diagnostics.lastSuccessfulSync')}
                    value={formatTimestamp(snapshot.lastSuccessfulSyncAt)}
                    detail={t('subscription.summary.source', {
                      value: t(`subscription.sourceValue.${snapshot.source}`),
                    })}
                  />
                </div>
                <DiagnosticList diagnostics={snapshot.diagnostics} />
              </div>
            </SurfaceSection>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
