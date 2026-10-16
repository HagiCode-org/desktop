import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useCommercePreviewDebug } from '@/components/commerce/CommercePreviewDebug';
import { resolveHomeEntitlementTier, type HomeEntitlementTier } from '@/lib/home-rail-plan';
import type { AppDispatch, RootState } from '@/store';
import { loadSubscriptionSnapshot, selectSubscriptionState } from '@/store/slices/subscriptionSlice';
import {
  loadTurboEngineLicenseSnapshot,
  selectTurboEngineLicenseState,
} from '@/store/slices/turboEngineLicenseSlice';

/**
 * Who is looking at the home page: a paying user, a free user, or not known yet.
 * Loads the entitlement snapshots itself, because the purchase panel that normally
 * loads them is not mounted while the tier is unknown.
 */
export function useHomeEntitlementTier(): HomeEntitlementTier {
  const dispatch = useDispatch<AppDispatch>();
  const { scenario } = useCommercePreviewDebug();
  const subscription = useSelector((state: RootState) => selectSubscriptionState(state));
  const turboEngine = useSelector((state: RootState) => selectTurboEngineLicenseState(state));

  const subscriptionBridgeAvailable = typeof window.electronAPI?.subscription?.getSnapshot === 'function';
  const turboEngineBridgeAvailable = typeof window.electronAPI?.turboEngineLicense?.getSnapshot === 'function';

  useEffect(() => {
    if (subscriptionBridgeAvailable && !subscription.snapshot && !subscription.isLoading && !subscription.error) {
      void dispatch(loadSubscriptionSnapshot());
    }
  }, [dispatch, subscription.error, subscription.isLoading, subscription.snapshot, subscriptionBridgeAvailable]);

  useEffect(() => {
    if (turboEngineBridgeAvailable && !turboEngine.snapshot && !turboEngine.isLoading && !turboEngine.error) {
      void dispatch(loadTurboEngineLicenseSnapshot());
    }
  }, [dispatch, turboEngine.error, turboEngine.isLoading, turboEngine.snapshot, turboEngineBridgeAvailable]);

  return resolveHomeEntitlementTier({
    scenario,
    subscription: {
      bridgeAvailable: subscriptionBridgeAvailable,
      snapshotStatus: subscription.snapshot?.status,
      hasError: Boolean(subscription.error),
    },
    turboEngine: {
      bridgeAvailable: turboEngineBridgeAvailable,
      snapshotStatus: turboEngine.snapshot?.status,
      hasError: Boolean(turboEngine.error),
    },
  });
}
