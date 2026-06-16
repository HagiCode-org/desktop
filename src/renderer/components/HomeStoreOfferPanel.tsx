import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  Loader2,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  createDefaultSubscriptionSnapshot,
  HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL,
  subscriptionEntitlementNames,
} from '../../types/subscription.js';
import { createDefaultTurboEngineLicenseSnapshot, turboEngineEntitlementNames } from '../../types/turboengine-license.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CommercePreviewDebugDialog,
  getCommercePreviewScenarioLabel,
  useCommercePreviewDebug,
} from '@/components/commerce/CommercePreviewDebug';
import { useNavigate } from '@/hooks/useNavigate';
import type { AppDispatch, RootState } from '@/store';
import {
  loadSubscriptionSnapshot,
  purchaseSubscription,
  selectSubscriptionState,
} from '@/store/slices/subscriptionSlice';
import {
  loadTurboEngineLicenseSnapshot,
  purchaseTurboEngineLicense,
  selectTurboEngineLicenseState,
} from '@/store/slices/turboEngineLicenseSlice';

interface HomeStoreOfferPanelProps {
  isWindowsStoreRuntime: boolean;
}

interface CommerceRowProps {
  actions: ReactNode;
  icon: LucideIcon;
  isActive: boolean;
  summary: string;
  title: string;
}

function getPurchaseToastKind(outcome: string): 'success' | 'error' | 'message' {
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

function CommerceRow({
  actions,
  icon: Icon,
  isActive,
  summary,
  title,
}: CommerceRowProps) {
  return (
    <div className="px-5 py-5">
      <div className="flex items-start gap-3">
        <div className="commerce-premium-icon commerce-premium-home-icon rounded-xl p-2.5">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="commerce-premium-heading font-medium">{title}</h3>
            {isActive ? <BadgeCheck className="h-4 w-4 text-primary" /> : null}
          </div>
          <p className="commerce-premium-copy mt-2 max-w-[62ch] text-sm leading-6">{summary}</p>

          {actions ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function HomeStoreOfferPanel({ isWindowsStoreRuntime }: HomeStoreOfferPanelProps) {
  const { t } = useTranslation(['common', 'pages']);
  const dispatch = useDispatch<AppDispatch>();
  const { navigateTo } = useNavigate();
  const previewDebug = useCommercePreviewDebug();
  const subscriptionBridgeAvailable = typeof window.electronAPI.subscription?.getSnapshot === 'function';
  const turboEngineBridgeAvailable = typeof window.electronAPI.turboEngineLicense?.getSnapshot === 'function';
  const subscriptionState = useSelector((state: RootState) => selectSubscriptionState(state));
  const turboEngineState = useSelector((state: RootState) => selectTurboEngineLicenseState(state));

  useEffect(() => {
    if (subscriptionBridgeAvailable && !subscriptionState.snapshot && !subscriptionState.isLoading) {
      void dispatch(loadSubscriptionSnapshot());
    }
  }, [dispatch, subscriptionBridgeAvailable, subscriptionState.isLoading, subscriptionState.snapshot]);

  useEffect(() => {
    if (turboEngineBridgeAvailable && !turboEngineState.snapshot && !turboEngineState.isLoading) {
      void dispatch(loadTurboEngineLicenseSnapshot());
    }
  }, [dispatch, turboEngineBridgeAvailable, turboEngineState.isLoading, turboEngineState.snapshot]);

  const openStorePage = async (url: string, errorMessageKey: string, fallbackMessageKey: string) => {
    const result = await window.electronAPI.openExternal(url);

    if (!result.success) {
      toast.error(t(errorMessageKey, {
        ns: 'pages',
        error: result.error || t(fallbackMessageKey, { ns: 'pages' }),
      }));
    }
  };

  const handleSubscriptionPurchase = async () => {
    if (!subscriptionBridgeAvailable) {
      return;
    }

    const resultAction = await dispatch(purchaseSubscription());
    if (!purchaseSubscription.fulfilled.match(resultAction)) {
      const message = typeof resultAction.payload === 'string'
        ? resultAction.payload
        : resultAction.error.message ?? t('pages:subscription.messages.purchaseFailedFallback');
      toast.error(t('pages:subscription.messages.purchaseFailed', { error: message }));
      return;
    }

    const toastMessage = t(`pages:subscription.purchaseOutcome.${resultAction.payload.outcome}`);
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

  const handleTurboEnginePurchase = async () => {
    if (!turboEngineBridgeAvailable) {
      return;
    }

    const resultAction = await dispatch(purchaseTurboEngineLicense());
    if (!purchaseTurboEngineLicense.fulfilled.match(resultAction)) {
      const message = typeof resultAction.payload === 'string'
        ? resultAction.payload
        : resultAction.error.message ?? t('pages:turboEngine.messages.purchaseFailedFallback');
      toast.error(t('pages:turboEngine.messages.purchaseFailed', { error: message }));
      return;
    }

    const toastMessage = t(`pages:turboEngine.purchaseOutcome.${resultAction.payload.outcome}`);
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

  const isPreviewing = previewDebug.isPreviewing;
  const effectiveWindowsStoreRuntime = previewDebug.scenario === 'live'
    ? isWindowsStoreRuntime
    : previewDebug.scenario !== 'non-store';
  const effectiveSubscriptionBridgeAvailable = previewDebug.scenario === 'live'
    ? subscriptionBridgeAvailable
    : previewDebug.scenario !== 'non-store';
  const effectiveTurboEngineBridgeAvailable = previewDebug.scenario === 'live'
    ? turboEngineBridgeAvailable
    : previewDebug.scenario !== 'non-store';
  const effectiveSubscriptionSnapshot = previewDebug.scenario === 'live'
    ? subscriptionState.snapshot
    : (previewDebug.scenario === 'non-store'
      ? null
      : createDefaultSubscriptionSnapshot({
        entitlements: previewDebug.scenario === 'active' ? [...subscriptionEntitlementNames] : [],
        source: 'store',
        status: previewDebug.scenario === 'active' ? 'active' : 'inactive',
      }));
  const effectiveTurboEngineSnapshot = previewDebug.scenario === 'live'
    ? turboEngineState.snapshot
    : (previewDebug.scenario === 'non-store'
      ? null
      : createDefaultTurboEngineLicenseSnapshot({
        entitlements: previewDebug.scenario === 'active' ? [...turboEngineEntitlementNames] : [],
        source: 'store',
        status: previewDebug.scenario === 'active' ? 'active' : 'inactive',
      }));

  const subscriptionActive = effectiveSubscriptionSnapshot?.status === 'active';
  const turboEngineActive = effectiveTurboEngineSnapshot?.status === 'active';
  const subscriptionCanPurchase = effectiveWindowsStoreRuntime
    && effectiveSubscriptionBridgeAvailable
    && effectiveSubscriptionSnapshot?.availability === 'supported'
    && !subscriptionActive;
  const turboEngineCanPurchase = effectiveWindowsStoreRuntime
    && effectiveTurboEngineBridgeAvailable
    && effectiveTurboEngineSnapshot?.availability === 'supported'
    && !turboEngineActive;
  return (
    <section className="commerce-premium-shell rounded-3xl p-6 sm:p-7">
      <div className="relative z-10">
        <div className="flex flex-col gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="commerce-premium-heading cursor-default text-left text-xl font-semibold"
                onClick={previewDebug.handleDebugTitleClick}
              >
                {t('system.commercePanel.title')}
              </button>
              {isPreviewing ? (
                <Badge variant="outline" className="commerce-premium-badge rounded-full px-3 py-1 text-xs">
                  {t('system.commercePanel.debug.previewBadge', {
                    mode: getCommercePreviewScenarioLabel(t, previewDebug.scenario),
                  })}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {!effectiveWindowsStoreRuntime ? (
          <div className="commerce-premium-panel mt-5 flex flex-col gap-3 rounded-2xl p-4">
            <Button
              type="button"
              onClick={() => void openStorePage(
                HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL,
                'subscription.messages.openStoreFailed',
                'subscription.messages.openStoreFailedFallback',
              )}
              className="commerce-premium-button justify-between"
              disabled={isPreviewing}
            >
              <span className="inline-flex items-center gap-2">
                <BadgeCheck className="h-4 w-4" />
                {t('pages:subscription.actions.installStoreApp')}
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}

        <div className="commerce-premium-panel mt-5 overflow-hidden rounded-2xl">
          <CommerceRow
            icon={ShieldCheck}
            isActive={Boolean(turboEngineActive)}
            summary={t('pages:turboEngine.article.unlockTitle')}
            title={t('common:sidebar.turboEngine')}
            actions={effectiveWindowsStoreRuntime ? (
              <>
                {turboEngineCanPurchase ? (
                  <Button
                    type="button"
                    onClick={() => void handleTurboEnginePurchase()}
                    disabled={turboEngineState.isPurchasing || isPreviewing}
                    className="commerce-premium-button justify-between"
                  >
                    <span className="inline-flex items-center gap-2">
                      {turboEngineState.isPurchasing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                      {turboEngineState.isPurchasing
                        ? t('pages:turboEngine.actions.processing')
                        : t('pages:turboEngine.actions.buy')}
                    </span>
                    {!turboEngineState.isPurchasing ? <ArrowRight className="h-4 w-4" /> : null}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={() => navigateTo('turboengine')} className="commerce-premium-button-secondary justify-between">
                <span>{t('system.commercePanel.actions.viewDetails')}</span>
                <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          />

          <div className="commerce-premium-divider border-t" />

          <CommerceRow
            icon={Sparkles}
            isActive={Boolean(subscriptionActive)}
            summary={t('system.commercePanel.sponsorSummary')}
            title={t('common:sidebar.subscription')}
            actions={effectiveWindowsStoreRuntime ? (
              <>
                {subscriptionCanPurchase ? (
                  <Button
                    type="button"
                    onClick={() => void handleSubscriptionPurchase()}
                    disabled={subscriptionState.isPurchasing || isPreviewing}
                    className="commerce-premium-button justify-between"
                  >
                    <span className="inline-flex items-center gap-2">
                      {subscriptionState.isPurchasing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                      {subscriptionState.isPurchasing
                        ? t('pages:subscription.actions.processing')
                        : t('pages:subscription.actions.buy')}
                    </span>
                    {!subscriptionState.isPurchasing ? <ArrowRight className="h-4 w-4" /> : null}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={() => navigateTo('subscription')} className="commerce-premium-button-secondary justify-between">
                  <span>{t('system.commercePanel.actions.viewDetails')}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          />
        </div>
      </div>

      <CommercePreviewDebugDialog
        open={previewDebug.dialogOpen}
        onOpenChange={previewDebug.setDialogOpen}
        scenario={previewDebug.scenario}
        onScenarioChange={previewDebug.setScenario}
      />
    </section>
  );
}
