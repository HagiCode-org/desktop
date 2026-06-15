export const HAGICODE_SPONSOR_PLAN_STORE_ID = '9N0BTGWV23M1';
export const HAGICODE_SPONSOR_PLAN_PRODUCT_ID = 'Hagicode.SponserPlan';
export const HAGICODE_SPONSOR_PLAN_STORE_WEB_URL = `https://apps.microsoft.com/detail/${HAGICODE_SPONSOR_PLAN_STORE_ID}`;
export const HAGICODE_DESKTOP_WINDOWS_STORE_ID = '9N3PM0N3SVDW';
export const HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL = `https://apps.microsoft.com/detail/${HAGICODE_DESKTOP_WINDOWS_STORE_ID}`;

export const subscriptionAvailabilityValues = [
  'supported',
  'unsupported-runtime',
  'store-unavailable',
  'error',
] as const;

export type SubscriptionAvailability = (typeof subscriptionAvailabilityValues)[number];

export const subscriptionStatusValues = [
  'active',
  'inactive',
  'expired',
  'canceled',
  'grace-period',
  'pending',
  'unknown',
] as const;

export type SubscriptionStatus = (typeof subscriptionStatusValues)[number];

export const subscriptionSyncSources = [
  'cache',
  'store',
  'fallback',
] as const;

export type SubscriptionSyncSource = (typeof subscriptionSyncSources)[number];

export const subscriptionEntitlementNames = [
  'sponsorBadge',
  'premiumFeatureGate',
] as const;

export type SubscriptionEntitlementName = (typeof subscriptionEntitlementNames)[number];

export interface SubscriptionDiagnostic {
  code: string;
  message: string;
  detail?: string;
  recordedAt: string;
}

export interface SubscriptionSnapshot {
  planStoreId: string;
  planProductId: string;
  availability: SubscriptionAvailability;
  status: SubscriptionStatus;
  entitlements: SubscriptionEntitlementName[];
  source: SubscriptionSyncSource;
  isStale: boolean;
  lastCheckedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  expirationDate: string | null;
  renewalDate: string | null;
  diagnostics: SubscriptionDiagnostic[];
}

export interface SubscriptionGetSnapshotOptions {
  refreshIfStale?: boolean;
}

export const subscriptionPurchaseOutcomeValues = [
  'succeeded',
  'already-purchased',
  'canceled',
  'not-purchased',
  'network-error',
  'server-error',
  'not-supported',
  'failed',
] as const;

export type SubscriptionPurchaseOutcome = (typeof subscriptionPurchaseOutcomeValues)[number];

export interface SubscriptionPurchaseResult {
  outcome: SubscriptionPurchaseOutcome;
  message: string;
  snapshot: SubscriptionSnapshot;
}

export interface SubscriptionBridge {
  getSnapshot: (options?: SubscriptionGetSnapshotOptions) => Promise<SubscriptionSnapshot>;
  refresh: () => Promise<SubscriptionSnapshot>;
  purchase: () => Promise<SubscriptionPurchaseResult>;
  onDidChange: (callback: (snapshot: SubscriptionSnapshot) => void) => () => void;
}

export const subscriptionChannels = {
  getSnapshot: 'subscription:get-snapshot',
  refresh: 'subscription:refresh',
  purchase: 'subscription:purchase',
  changed: 'subscription:changed',
} as const;

export function createDefaultSubscriptionSnapshot(
  overrides: Partial<SubscriptionSnapshot> = {},
): SubscriptionSnapshot {
  return {
    planStoreId: HAGICODE_SPONSOR_PLAN_STORE_ID,
    planProductId: HAGICODE_SPONSOR_PLAN_PRODUCT_ID,
    availability: 'supported',
    status: 'unknown',
    entitlements: [],
    source: 'cache',
    isStale: false,
    lastCheckedAt: null,
    lastSuccessfulSyncAt: null,
    expirationDate: null,
    renewalDate: null,
    diagnostics: [],
    ...overrides,
  };
}
