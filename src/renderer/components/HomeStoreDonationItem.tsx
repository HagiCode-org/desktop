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
import { shouldShowMsstoreDonationItem } from '@/lib/msstore-donation-item';
import type {
  MsstoreDonationItemPurchaseResult,
  MsstoreDonationItemState,
} from '../../types/msstore-donation-item.js';

interface HomeStoreDonationItemProps {
  isWindowsStoreRuntime: boolean;
}

const defaultState: MsstoreDonationItemState = {
  purchaseCount: 0,
};

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
  const [isPurchasing, setIsPurchasing] = useState(false);
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

  const handlePurchase = async () => {
    if (!window.electronAPI.msstoreDonationItem || isPurchasing) {
      return;
    }

    setIsPurchasing(true);
    try {
      const resultAction = await dispatch(purchaseMsstoreDonationItem());
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
      }));

      if (result.outcome === 'succeeded' || result.outcome === 'already-purchased') {
        toast.success(t(`donationItem.messages.purchaseOutcome.${result.outcome}`, { ns: 'pages' }));
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
      setIsPurchasing(false);
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
    <section className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">作者快穷死了，救救作者</h2>
          <p className="mt-2 text-sm text-muted-foreground">作者的 token 要耗尽了，快为作者续命</p>
          <p className="mt-3 text-sm text-muted-foreground">
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
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="mt-4">
        <Button
          type="button"
          onClick={() => void handlePurchase()}
          disabled={isPurchasing}
          className="gap-2"
        >
          {isPurchasing ? t('donationItem.actions.purchasing', { ns: 'pages' }) : t('donationItem.actions.purchase', { ns: 'pages' })}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
