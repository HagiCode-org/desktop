import { createRequire } from 'node:module';
import {
  HAGICODE_SPONSOR_PLAN_STORE_ID,
  type SubscriptionPurchaseOutcome,
} from '../../types/subscription.js';

export interface RawStoreSubscriptionProduct {
  storeId: string;
  title: string | null;
}

export interface RawStoreSubscriptionSku {
  storeId: string | null;
  title: string | null;
  isSubscription: boolean;
  isInUserCollection: boolean;
  collectionEndDate: string | null;
}

export interface RawStoreSubscriptionLicense {
  storeId: string | null;
  isActive: boolean;
  expirationDate: string | null;
}

export interface RawStoreSubscriptionState {
  fetchedAt: string;
  availability: 'supported' | 'store-unavailable' | 'error';
  appLicenseActive: boolean;
  product: RawStoreSubscriptionProduct | null;
  sku: RawStoreSubscriptionSku | null;
  license: RawStoreSubscriptionLicense | null;
  purchaseEligibility:
    | 'licensable'
    | 'not-licensable'
    | 'license-action-not-applicable'
    | 'network-error'
    | 'server-error'
    | 'unknown';
  errorCode: string | null;
  errorMessage: string | null;
}

export interface RawStorePurchaseResult {
  outcome: SubscriptionPurchaseOutcome;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface SubscriptionPlatformBroker {
  queryStatus(): Promise<RawStoreSubscriptionState>;
  purchase(): Promise<RawStorePurchaseResult>;
  dispose(): void;
}

type NodeRtStoreModule = {
  StoreCanLicenseStatus: Record<string, number>;
  StoreContext: {
    getDefault(): {
      getAppLicenseAsync(callback: (error: Error | null, result: unknown) => void): void;
      getStoreProductsAsync(
        productKinds: string[],
        storeIds: string[],
        callback: (error: Error | null, result: unknown) => void,
      ): void;
      getUserCollectionAsync(
        productKinds: string[],
        callback: (error: Error | null, result: unknown) => void,
      ): void;
      canAcquireStoreLicenseAsync(
        productStoreId: string,
        callback: (error: Error | null, result: unknown) => void,
      ): void;
      requestPurchaseAsync(
        storeId: string,
        callback: (error: Error | null, result: unknown) => void,
      ): void;
      off?(type: string, listener: (event: Event) => void): void;
    };
  };
  StorePurchaseStatus: Record<string, number>;
};

const STORE_PRODUCT_KINDS = ['Durable', 'Consumable', 'UnmanagedConsumable'];
const require = createRequire(import.meta.url);

function toIsoDate(value: unknown): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }

  return value.toISOString();
}

function normalizeErrorCode(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

function valuesFromUnknownRecord(value: unknown): unknown[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.values(value as Record<string, unknown>);
}

function firstMatchingValue(
  value: unknown,
  predicate: (candidate: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  return valuesFromUnknownRecord(value)
    .find((candidate) => candidate && typeof candidate === 'object' && predicate(candidate as Record<string, unknown>)) as Record<string, unknown> | undefined
    ?? null;
}

function getNamedNumber(enumObject: Record<string, number>, key: string): number | undefined {
  return typeof enumObject[key] === 'number' ? enumObject[key] : undefined;
}

function mapPurchaseOutcome(storeModule: NodeRtStoreModule, statusValue: unknown): SubscriptionPurchaseOutcome {
  const statusNumber = typeof statusValue === 'number' ? statusValue : Number.NaN;

  switch (statusNumber) {
    case getNamedNumber(storeModule.StorePurchaseStatus, 'succeeded'):
      return 'succeeded';
    case getNamedNumber(storeModule.StorePurchaseStatus, 'alreadyPurchased'):
      return 'already-purchased';
    case getNamedNumber(storeModule.StorePurchaseStatus, 'notPurchased'):
      return 'canceled';
    case getNamedNumber(storeModule.StorePurchaseStatus, 'networkError'):
      return 'network-error';
    case getNamedNumber(storeModule.StorePurchaseStatus, 'serverError'):
      return 'server-error';
    default:
      return 'failed';
  }
}

function mapPurchaseEligibility(storeModule: NodeRtStoreModule, statusValue: unknown): RawStoreSubscriptionState['purchaseEligibility'] {
  const statusNumber = typeof statusValue === 'number' ? statusValue : Number.NaN;

  switch (statusNumber) {
    case getNamedNumber(storeModule.StoreCanLicenseStatus, 'licensable'):
      return 'licensable';
    case getNamedNumber(storeModule.StoreCanLicenseStatus, 'notLicensableToUser'):
      return 'not-licensable';
    case getNamedNumber(storeModule.StoreCanLicenseStatus, 'licenseActionNotApplicableToProduct'):
      return 'license-action-not-applicable';
    case getNamedNumber(storeModule.StoreCanLicenseStatus, 'networkError'):
      return 'network-error';
    case getNamedNumber(storeModule.StoreCanLicenseStatus, 'serverError'):
      return 'server-error';
    default:
      return 'unknown';
  }
}

function promisifyNodeRt<T>(
  runner: (callback: (error: Error | null, result: T) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    runner((error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

function findMatchingProduct(productsResult: unknown, storeId: string): Record<string, unknown> | null {
  return firstMatchingValue(
    (productsResult as { products?: unknown } | null)?.products,
    (candidate) => String(candidate.storeId ?? '').trim().toUpperCase() === storeId.toUpperCase(),
  );
}

function findMatchingSku(candidate: Record<string, unknown> | null): RawStoreSubscriptionSku | null {
  const sku = firstMatchingValue(candidate?.skus, () => true);

  if (!sku) {
    return null;
  }

  const collectionData = sku.collectionData as Record<string, unknown> | undefined;

  return {
    storeId: typeof sku.storeId === 'string' ? sku.storeId : null,
    title: typeof sku.title === 'string' ? sku.title : null,
    isSubscription: Boolean(sku.isSubscription),
    isInUserCollection: Boolean(sku.isInUserCollection),
    collectionEndDate: toIsoDate(collectionData?.endDate),
  };
}

function findMatchingLicense(appLicense: unknown): RawStoreSubscriptionLicense | null {
  const addOnLicenses = (appLicense as { addOnLicenses?: unknown } | null)?.addOnLicenses;
  const license = firstMatchingValue(
    addOnLicenses,
    (candidate) => {
      const skuStoreId = String(candidate.skuStoreId ?? '').trim().toUpperCase();
      return skuStoreId.includes(HAGICODE_SPONSOR_PLAN_STORE_ID);
    },
  );

  if (!license) {
    return null;
  }

  return {
    storeId: typeof license.skuStoreId === 'string' ? license.skuStoreId : null,
    isActive: Boolean(license.isActive),
    expirationDate: toIsoDate(license.expirationDate),
  };
}

function loadNodeRtStoreModule(): NodeRtStoreModule {
  return require('@nodert-win10-rs4/windows.services.store') as NodeRtStoreModule;
}

export class MicrosoftStoreSubscriptionBroker implements SubscriptionPlatformBroker {
  private readonly storeModule: NodeRtStoreModule;
  private readonly context: ReturnType<NodeRtStoreModule['StoreContext']['getDefault']>;

  constructor() {
    this.storeModule = loadNodeRtStoreModule();
    this.context = this.storeModule.StoreContext.getDefault();
  }

  async queryStatus(): Promise<RawStoreSubscriptionState> {
    const fetchedAt = new Date().toISOString();

    try {
      const [appLicense, productsResult, collectionResult, canAcquireResult] = await Promise.all([
        promisifyNodeRt((callback) => this.context.getAppLicenseAsync(callback)),
        promisifyNodeRt((callback) => this.context.getStoreProductsAsync(STORE_PRODUCT_KINDS, [HAGICODE_SPONSOR_PLAN_STORE_ID], callback)),
        promisifyNodeRt((callback) => this.context.getUserCollectionAsync(STORE_PRODUCT_KINDS, callback)),
        promisifyNodeRt((callback) => this.context.canAcquireStoreLicenseAsync(HAGICODE_SPONSOR_PLAN_STORE_ID, callback)),
      ]);

      const product = findMatchingProduct(productsResult, HAGICODE_SPONSOR_PLAN_STORE_ID)
        ?? findMatchingProduct(collectionResult, HAGICODE_SPONSOR_PLAN_STORE_ID);
      const sku = findMatchingSku(product);
      const license = findMatchingLicense(appLicense);

      return {
        fetchedAt,
        availability: 'supported',
        appLicenseActive: Boolean((appLicense as { isActive?: boolean } | null)?.isActive),
        product: product ? {
          storeId: typeof product.storeId === 'string' ? product.storeId : HAGICODE_SPONSOR_PLAN_STORE_ID,
          title: typeof product.title === 'string' ? product.title : null,
        } : null,
        sku,
        license,
        purchaseEligibility: mapPurchaseEligibility(this.storeModule, (canAcquireResult as { status?: unknown }).status),
        errorCode: normalizeErrorCode((productsResult as { extendedError?: unknown } | null)?.extendedError),
        errorMessage: null,
      };
    } catch (error) {
      return {
        fetchedAt,
        availability: 'store-unavailable',
        appLicenseActive: false,
        product: null,
        sku: null,
        license: null,
        purchaseEligibility: 'unknown',
        errorCode: error instanceof Error ? error.name : null,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async purchase(): Promise<RawStorePurchaseResult> {
    try {
      const result = await promisifyNodeRt((callback) => this.context.requestPurchaseAsync(HAGICODE_SPONSOR_PLAN_STORE_ID, callback));

      return {
        outcome: mapPurchaseOutcome(this.storeModule, (result as { status?: unknown }).status),
        errorCode: normalizeErrorCode((result as { extendedError?: unknown } | null)?.extendedError),
        errorMessage: null,
      };
    } catch (error) {
      return {
        outcome: 'failed',
        errorCode: error instanceof Error ? error.name : null,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  dispose(): void {
    // NodeRT store context does not expose explicit disposal semantics here.
  }
}
