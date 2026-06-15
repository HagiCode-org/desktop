import {
  createDefaultStoreLicenseSnapshot,
  HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL,
  type StoreLicenseAvailability,
  type StoreLicenseBridge,
  type StoreLicenseDiagnostic,
  type StoreLicenseGetSnapshotOptions,
  type StoreLicenseProductConfig,
  type StoreLicensePurchaseOutcome,
  type StoreLicensePurchaseResult,
  type StoreLicenseSnapshot,
  type StoreLicenseStatus,
  type StoreLicenseSyncSource,
  storeLicenseAvailabilityValues,
  storeLicensePurchaseOutcomeValues,
  storeLicenseStatusValues,
  storeLicenseSyncSources,
} from './store-license.js';

export const HAGICODE_SPONSOR_PLAN_STORE_ID = '9N0BTGWV23M1';
export const HAGICODE_SPONSOR_PLAN_PRODUCT_ID = 'Hagicode.SponserPlan';
export const HAGICODE_SPONSOR_PLAN_STORE_WEB_URL = `https://apps.microsoft.com/detail/${HAGICODE_SPONSOR_PLAN_STORE_ID}`;

export const subscriptionAvailabilityValues = storeLicenseAvailabilityValues;
export type SubscriptionAvailability = StoreLicenseAvailability;
export const subscriptionStatusValues = storeLicenseStatusValues;
export type SubscriptionStatus = StoreLicenseStatus;
export const subscriptionSyncSources = storeLicenseSyncSources;
export type SubscriptionSyncSource = StoreLicenseSyncSource;

export const subscriptionEntitlementNames = [
  'sponsorBadge',
  'premiumFeatureGate',
] as const;

export type SubscriptionEntitlementName = (typeof subscriptionEntitlementNames)[number];

export type SubscriptionDiagnostic = StoreLicenseDiagnostic;

export const sponsorPlanProductConfig: StoreLicenseProductConfig<SubscriptionEntitlementName> = {
  key: 'subscription',
  storeId: HAGICODE_SPONSOR_PLAN_STORE_ID,
  productId: HAGICODE_SPONSOR_PLAN_PRODUCT_ID,
  productName: 'Hagicode Sponsor Plan',
  storeWebUrl: HAGICODE_SPONSOR_PLAN_STORE_WEB_URL,
  licenseKind: 'subscription',
  snapshotStoreName: 'hagicode-desktop-subscription',
  entitlementNames: subscriptionEntitlementNames,
  purchaseLabel: 'sponsor plan',
  statusLabel: 'subscription status',
  unavailableMessage: 'Microsoft Store subscription is unavailable in the current runtime.',
};

export interface SubscriptionSnapshot extends StoreLicenseSnapshot<SubscriptionEntitlementName> {
  planStoreId: string;
  planProductId: string;
}

export type SubscriptionGetSnapshotOptions = StoreLicenseGetSnapshotOptions;

export const subscriptionPurchaseOutcomeValues = storeLicensePurchaseOutcomeValues;

export type SubscriptionPurchaseOutcome = StoreLicensePurchaseOutcome;

export interface SubscriptionPurchaseResult extends StoreLicensePurchaseResult<SubscriptionSnapshot> {}

export interface SubscriptionBridge extends StoreLicenseBridge<SubscriptionSnapshot, SubscriptionPurchaseResult> {
  verifyStartup: () => Promise<SubscriptionSnapshot>;
}

export const subscriptionChannels = {
  getSnapshot: 'subscription:get-snapshot',
  verifyStartup: 'subscription:verify-startup',
  refresh: 'subscription:refresh',
  purchase: 'subscription:purchase',
  changed: 'subscription:changed',
} as const;

export function createDefaultSubscriptionSnapshot(
  overrides: Partial<SubscriptionSnapshot> = {},
): SubscriptionSnapshot {
  const baseSnapshot = createDefaultStoreLicenseSnapshot(sponsorPlanProductConfig, {
    ...overrides,
    storeId: overrides.planStoreId ?? overrides.storeId,
    productId: overrides.planProductId ?? overrides.productId,
  });

  return {
    ...baseSnapshot,
    planStoreId: overrides.planStoreId ?? baseSnapshot.storeId,
    planProductId: overrides.planProductId ?? baseSnapshot.productId,
    ...overrides,
  };
}

export {
  HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL,
};
