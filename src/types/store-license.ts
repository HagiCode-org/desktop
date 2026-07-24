export const HAGICODE_DESKTOP_WINDOWS_STORE_ID = '9N3PM0N3SVDW';
export const HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL = `https://apps.microsoft.com/detail/${HAGICODE_DESKTOP_WINDOWS_STORE_ID}`;
export const HAGICODE_DESKTOP_WINDOWS_STORE_REVIEW_URL = HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL;

export const storeLicenseAvailabilityValues = [
  'supported',
  'unsupported-runtime',
  'store-unavailable',
  'error',
] as const;

export type StoreLicenseAvailability = (typeof storeLicenseAvailabilityValues)[number];

export const storeLicenseStatusValues = [
  'active',
  'inactive',
  'expired',
  'canceled',
  'grace-period',
  'pending',
  'unknown',
] as const;

export type StoreLicenseStatus = (typeof storeLicenseStatusValues)[number];

export const storeLicenseSyncSources = [
  'initial',
  'store',
  'fallback',
] as const;

export type StoreLicenseSyncSource = (typeof storeLicenseSyncSources)[number];

export const storeLicenseKinds = [
  'subscription',
  'perpetual',
  'consumable',
] as const;

export type StoreLicenseKind = (typeof storeLicenseKinds)[number];

export const storeLicensePurchaseOutcomeValues = [
  'succeeded',
  'already-purchased',
  'canceled',
  'not-purchased',
  'network-error',
  'server-error',
  'not-supported',
  'failed',
] as const;

export type StoreLicensePurchaseOutcome = (typeof storeLicensePurchaseOutcomeValues)[number];

export interface StoreLicenseDiagnostic {
  code: string;
  message: string;
  detail?: string;
  recordedAt: string;
}

export interface StoreLicenseSnapshot<TEntitlement extends string = string> {
  productKey: string;
  storeId: string;
  productId: string;
  productName: string;
  licenseKind: StoreLicenseKind;
  availability: StoreLicenseAvailability;
  status: StoreLicenseStatus;
  entitlements: TEntitlement[];
  source: StoreLicenseSyncSource;
  isStale: boolean;
  lastCheckedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  expirationDate: string | null;
  renewalDate: string | null;
  diagnostics: StoreLicenseDiagnostic[];
}

export interface StoreLicenseGetSnapshotOptions {
  refreshIfStale?: boolean;
}

export interface StoreLicensePurchaseResult<TSnapshot extends StoreLicenseSnapshot = StoreLicenseSnapshot> {
  outcome: StoreLicensePurchaseOutcome;
  message: string;
  snapshot: TSnapshot;
}

export interface StoreLicenseBridge<
  TSnapshot extends StoreLicenseSnapshot = StoreLicenseSnapshot,
  TPurchaseResult extends StoreLicensePurchaseResult<TSnapshot> = StoreLicensePurchaseResult<TSnapshot>,
> {
  getSnapshot: (options?: StoreLicenseGetSnapshotOptions) => Promise<TSnapshot>;
  refresh: () => Promise<TSnapshot>;
  purchase: () => Promise<TPurchaseResult>;
  onDidChange: (callback: (snapshot: TSnapshot) => void) => () => void;
}

export interface StoreLicenseProductConfig<TEntitlement extends string = string> {
  key: string;
  storeId: string;
  productId: string;
  productName: string;
  storeWebUrl: string;
  licenseKind: StoreLicenseKind;
  entitlementNames: readonly TEntitlement[];
  purchaseLabel: string;
  statusLabel: string;
  unavailableMessage: string;
}

export function createDefaultStoreLicenseSnapshot<TEntitlement extends string>(
  product: StoreLicenseProductConfig<TEntitlement>,
  overrides: Partial<StoreLicenseSnapshot<TEntitlement>> = {},
): StoreLicenseSnapshot<TEntitlement> {
  return {
    productKey: product.key,
    storeId: product.storeId,
    productId: product.productId,
    productName: product.productName,
    licenseKind: product.licenseKind,
    availability: 'supported',
    status: 'unknown',
    entitlements: [],
    source: 'initial',
    isStale: false,
    lastCheckedAt: null,
    lastSuccessfulSyncAt: null,
    expirationDate: null,
    renewalDate: null,
    diagnostics: [],
    ...overrides,
  };
}
