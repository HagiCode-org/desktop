import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import { ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AppDispatch, RootState } from '@/store';
import {
  dismissMsstoreDonationItem,
  loadMsstoreDonationItemState,
  purchaseMsstoreDonationItem,
  selectMsstoreDonationItemState,
  setMsstoreDonationItemState,
} from '@/store/slices/msstoreDonationItemSlice';
import {
  loadSubscriptionSnapshot,
  selectSubscriptionState,
} from '@/store/slices/subscriptionSlice';
import {
  getMsstoreDonationTierCatalog,
  shouldShowMsstoreDonationItem,
} from '@/lib/msstore-donation-item';
import type {
  MsstoreDonationItemPurchaseResult,
  MsstoreDonationItemState,
  MsstoreDonationTipTierId,
} from '../../types/msstore-donation-item.js';
import { DEFAULT_MSSTORE_DONATION_PURCHASE_COUNTS_BY_TIER } from '../../types/msstore-donation-item.js';

interface HomeStoreDonationItemProps {
  isWindowsStoreRuntime: boolean;
}

const defaultState: MsstoreDonationItemState = {
  purchaseCount: 0,
  purchaseCountsByTier: { ...DEFAULT_MSSTORE_DONATION_PURCHASE_COUNTS_BY_TIER },
};

const tierCatalog = getMsstoreDonationTierCatalog();

export default function HomeStoreDonationItem({ isWindowsStoreRuntime }: HomeStoreDonationItemProps) {
  const { t } = useTranslation(['pages']);
  const dispatch = useDispatch<AppDispatch>();
  const subscriptionState = useSelector((state: RootState) => selectSubscriptionState(state));

  const subscriptionBridgeAvailable = typeof window.electronAPI.subscription?.getSnapshot === 'function';
  const donationBridgeAvailable = typeof window.electronAPI.msstoreDonationItem?.getState === 'function';

  const donationSlice = useSelector((state: RootState) => selectMsstoreDonationItemState(state));
  const [state, setState] = useState<MsstoreDonationItemState>(defaultState);
  const [installDate, setInstallDate] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [purchasingTier, setPurchasingTier] = useState<MsstoreDonationTipTierId | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);

  const sponsorActive = subscriptionState.snapshot?.status === 'active';

  useEffect(() => {
    if (subscriptionBridgeAvailable && !subscriptionState.snapshot && !subscriptionState.isLoading) {
      void dispatch(loadSubscriptionSnapshot());
    }
  }, [dispatch, subscriptionBridgeAvailable, subscriptionState.isLoading, subscriptionState.snapshot]);

  useEffect(() => {
    let cancelled = false;

    const loadState = async () => {
      if (!donationBridgeAvailable) {
        if (!cancelled) {
          setReady(true);
        }
        return;
      }

      try {
        const ratingState = await window.electronAPI.getMsstoreRatingPromptState();
        if (cancelled) {
          return;
        }
        setInstallDate(ratingState?.installDate);
        void dispatch(loadMsstoreDonationItemState());
      } catch (error) {
        console.error('Failed to load MS Store donation item state:', error);
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    };

    void loadState();

    const unsubscribe = window.electronAPI.msstoreDonationItem?.onDidChange((nextState) => {
      if (!cancelled) {
        dispatch(setMsstoreDonationItemState(nextState ?? defaultState));
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [dispatch, donationBridgeAvailable]);

  useEffect(() => {
    if (donationSlice.state) {
      setState(donationSlice.state);
    }
  }, [donationSlice.state]);

  const visible = useMemo(() => shouldShowMsstoreDonationItem({
    isWinStoreRuntime: isWindowsStoreRuntime,
    installDate,
    dismissedAt: state.dismissedAt,
  }), [installDate, isWindowsStoreRuntime, state.dismissedAt]);

  if (!ready || !visible) {
    return null;
  }

  const handlePurchase = async (tier: MsstoreDonationTipTierId) => {
    if (!window.electronAPI.msstoreDonationItem || purchasingTier) {
      return;
    }

    setPurchasingTier(tier);
    try {
      const resultAction = await dispatch(purchaseMsstoreDonationItem({ tier }));
      if (!purchaseMsstoreDonationItem.fulfilled.match(resultAction)) {
        throw new Error(
          typeof resultAction.payload === 'string'
            ? resultAction.payload
            : resultAction.error.message ?? t('donationItem.messages.purchaseOutcome.failed', { ns: 'pages' }),
        );
      }
      const result = resultAction.payload as MsstoreDonationItemPurchaseResult;
      setState((prev) => ({
        ...prev,
        purchaseCount: result.purchaseCount,
        purchaseCountsByTier: result.purchaseCountsByTier ?? prev.purchaseCountsByTier,
      }));

      const shortName = t(`donationItem.tiers.${tier}.shortName`, { ns: 'pages' });
      const noPrivilege = t('donationItem.noPrivilegeNotice', { ns: 'pages' });

      if (result.outcome === 'succeeded' || result.outcome === 'already-purchased') {
        const base = t(`donationItem.messages.purchaseOutcome.${result.outcome}`, { ns: 'pages' });
        const tierThanks = t('donationItem.messages.tierThanks', {
          ns: 'pages',
          shortName,
          defaultValue: base,
        });
        // Higher tiers get stronger toast (duration / description with no-privilege restatement).
        const duration = tier === 'candy' ? 8000 : tier === 'dinner' ? 5500 : 4000;
        toast.success(tierThanks, {
          description: noPrivilege,
          duration,
        });
      } else if (result.outcome === 'canceled' || result.outcome === 'not-purchased') {
        toast.message(t(`donationItem.messages.purchaseOutcome.${result.outcome}`, { ns: 'pages' }));
      } else {
        toast.error(t(`donationItem.messages.purchaseOutcome.${result.outcome}`, {
          ns: 'pages',
          defaultValue: t('donationItem.messages.purchaseOutcome.failed', { ns: 'pages' }),
        }));
      }
    } catch (error) {
      toast.error(t('donationItem.messages.purchaseFailed', {
        ns: 'pages',
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setPurchasingTier(null);
    }
  };

  const handleDismiss = async () => {
    if (!sponsorActive || !window.electronAPI.msstoreDonationItem || isDismissing) {
      return;
    }

    setIsDismissing(true);
    try {
      const resultAction = await dispatch(dismissMsstoreDonationItem());
      if (!dismissMsstoreDonationItem.fulfilled.match(resultAction)) {
        throw new Error(
          typeof resultAction.payload === 'string'
            ? resultAction.payload
            : resultAction.error.message ?? t('donationItem.messages.dismissFailed', {
              ns: 'pages',
              error: t('donationItem.messages.purchaseOutcome.failed', { ns: 'pages' }),
            }),
        );
      }
      const nextState = resultAction.payload as MsstoreDonationItemState;
      setState(nextState);
      toast.success(t('donationItem.messages.dismissed', { ns: 'pages' }));
    } catch (error) {
      toast.error(t('donationItem.messages.dismissFailed', {
        ns: 'pages',
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setIsDismissing(false);
    }
  };

  return (
    <section
      className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-orange-500/10 p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
      data-testid="msstore-donation-panel"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-primary">作者快穷死了，救救作者</h2>
          <p className="mt-2 text-sm text-foreground/80">作者的 token 要耗尽了，快为作者续命</p>
          <p
            className="mt-3 text-sm text-muted-foreground"
            data-testid="msstore-donation-no-privilege"
          >
            {t('donationItem.noPrivilegeNotice', { ns: 'pages' })}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('donationItem.purchaseCount', { ns: 'pages', count: state.purchaseCount })}
          </p>
        </div>
        {sponsorActive ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('donationItem.actions.close', { ns: 'pages' })}
            onClick={() => void handleDismiss()}
            disabled={isDismissing}
            className="text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3" data-testid="msstore-donation-tier-list">
        {tierCatalog.map((tierMeta) => {
          const shortName = t(tierMeta.shortNameKey, { ns: 'pages' });
          const isPurchasing = purchasingTier === tierMeta.tier;
          const busy = purchasingTier !== null;

          return (
            <div
              key={tierMeta.tier}
              data-testid={`msstore-donation-tier-${tierMeta.tier}`}
              data-visual-level={tierMeta.visualLevel}
              className={`rounded-2xl border p-4 transition-all duration-300 motion-reduce:transition-none ${tierMeta.cardClassName}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-foreground">
                    <span aria-hidden="true" className="mr-1.5">
                      {tierMeta.emoji}
                    </span>
                    {shortName}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => void handlePurchase(tierMeta.tier)}
                  disabled={busy}
                  className={`group gap-2 transition-all duration-300 hover:-translate-y-0.5 motion-reduce:transform-none ${tierMeta.buttonClassName}`}
                >
                  {isPurchasing
                    ? t('donationItem.actions.purchasing', { ns: 'pages' })
                    : t('donationItem.actions.purchaseTier', {
                      ns: 'pages',
                      shortName,
                      defaultValue: t('donationItem.actions.purchase', { ns: 'pages' }),
                    })}
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transform-none" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
