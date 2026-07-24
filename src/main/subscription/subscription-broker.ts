import { sponsorPlanProductConfig } from '../../types/subscription.js';
import type {
  StoreLicenseProductConfig,
  StoreLicensePurchaseOutcome,
} from '../../types/store-license.js';
import log from 'electron-log';
import {
  executeWindowsStorePurchaseAddon,
  executeWindowsStoreStatusAddon,
  resolveWindowsStorePurchaseAddonPath,
} from './windows-store-purchase-addon.js';

export interface RawStoreLicenseProduct {
  storeId: string;
  title: string | null;
  isInUserCollection: boolean;
}

export interface RawStoreLicenseSku {
  storeId: string | null;
  title: string | null;
  isSubscription: boolean;
  isInUserCollection: boolean;
  collectionEndDate: string | null;
}

export interface RawStoreLicense {
  storeId: string | null;
  isActive: boolean;
  expirationDate: string | null;
}

export interface RawStoreLicenseState {
  fetchedAt: string;
  availability: 'supported' | 'store-unavailable' | 'error';
  appLicenseActive: boolean;
  product: RawStoreLicenseProduct | null;
  sku: RawStoreLicenseSku | null;
  license: RawStoreLicense | null;
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

export type RawStoreSubscriptionProduct = RawStoreLicenseProduct;
export type RawStoreSubscriptionSku = RawStoreLicenseSku;
export type RawStoreSubscriptionLicense = RawStoreLicense;
export type RawStoreSubscriptionState = RawStoreLicenseState;

export interface RawStorePurchaseResult {
  outcome: StoreLicensePurchaseOutcome;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface StoreLicensePlatformBroker {
  queryStatus(): Promise<RawStoreLicenseState>;
  purchase(): Promise<RawStorePurchaseResult>;
  dispose(): void;
}

export type SubscriptionPlatformBroker = StoreLicensePlatformBroker;

export interface MicrosoftStoreSubscriptionBrokerOptions {
  windowHandle?: Buffer | bigint | null;
  adapterFactory?: (
    windowHandle: bigint | null,
    productConfig?: StoreLicenseProductConfig,
  ) => Promise<StoreLicensePlatformBroker>;
  productConfig?: StoreLicenseProductConfig;
}

type DynWinRtStoreCollectionData = {
  endDate?: unknown;
};

type DynWinRtStoreSku = {
  storeId?: unknown;
  title?: unknown;
  isSubscription?: unknown;
  isInUserCollection?: unknown;
  collectionData?: DynWinRtStoreCollectionData | null;
};

type DynWinRtStoreSkuCollection = {
  toArray?: () => DynWinRtStoreSku[];
  length?: number;
  getAt?: (index: number) => DynWinRtStoreSku;
};

type DynWinRtStoreProduct = {
  storeId?: unknown;
  title?: unknown;
  isInUserCollection?: unknown;
  skus?: DynWinRtStoreSkuCollection | DynWinRtStoreSku[] | null;
};

type DynWinRtStoreProductMap = {
  hasKey?: (key: string) => boolean;
  has?: (key: string) => boolean;
  get?: (key: string) => DynWinRtStoreProduct | undefined;
};

type DynWinRtStoreProductQueryResult = {
  products?: DynWinRtStoreProductMap | null;
  extendedError?: unknown;
};

const WINDOWS_EPOCH_OFFSET_MILLISECONDS = 11644473600000n;
const HUNDRED_NANOSECONDS_PER_MILLISECOND = 10000n;

function toIsoDate(value: unknown): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    const universalTime = (value as { universalTime?: unknown } | null)?.universalTime;
    const ticks = typeof universalTime === 'bigint'
      ? universalTime
      : typeof universalTime === 'number' && Number.isFinite(universalTime)
        ? BigInt(Math.trunc(universalTime))
        : null;

    if (ticks == null) {
      return null;
    }

    const unixMilliseconds = ticks / HUNDRED_NANOSECONDS_PER_MILLISECOND - WINDOWS_EPOCH_OFFSET_MILLISECONDS;
    const date = new Date(Number(unixMilliseconds));

    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return value.toISOString();
}

function normalizeErrorCode(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value === 0 ? null : String(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    if (value.trim() === '0') {
      return null;
    }

    return value.trim();
  }

  return null;
}

function normalizeThrownError(error: unknown): { errorCode: string | null; errorMessage: string | null } {
  if (error instanceof Error) {
    const errorWithCode = error as Error & { code?: unknown };
    return {
      errorCode: normalizeErrorCode(errorWithCode.code) ?? error.name,
      errorMessage: error.message,
    };
  }

  return {
    errorCode: null,
    errorMessage: error == null ? null : String(error),
  };
}

function toStoreSkuArray(value: DynWinRtStoreSkuCollection | DynWinRtStoreSku[] | null | undefined): DynWinRtStoreSku[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  if (typeof value.toArray === 'function') {
    return value.toArray();
  }

  const length = typeof value.length === 'number' ? value.length : 0;
  const getAt = value.getAt;
  if (typeof getAt !== 'function' || length <= 0) {
    return [];
  }

  const items: DynWinRtStoreSku[] = [];
  for (let index = 0; index < length; index += 1) {
    items.push(getAt.call(value, index));
  }
  return items;
}

function findMatchingStoreProduct(
  queryResult: DynWinRtStoreProductQueryResult | null,
  storeId: string,
): DynWinRtStoreProduct | null {
  const products = queryResult?.products;
  if (!products) {
    return null;
  }

  const hasKey = typeof products.hasKey === 'function'
    ? products.hasKey.bind(products)
    : typeof products.has === 'function'
      ? products.has.bind(products)
      : null;
  const get = typeof products.get === 'function' ? products.get.bind(products) : null;

  if (!hasKey || !get || !hasKey(storeId)) {
    return null;
  }

  return get(storeId) ?? null;
}

function normalizeStoreSku(value: DynWinRtStoreSku | null | undefined): RawStoreLicenseSku | null {
  if (!value) {
    return null;
  }

  return {
    storeId: typeof value.storeId === 'string' ? value.storeId : null,
    title: typeof value.title === 'string' ? value.title : null,
    isSubscription: Boolean(value.isSubscription),
    isInUserCollection: Boolean(value.isInUserCollection),
    collectionEndDate: toIsoDate(value.collectionData?.endDate),
  };
}

function findOwnedSku(storeProduct: DynWinRtStoreProduct | null): RawStoreLicenseSku | null {
  if (!storeProduct) {
    return null;
  }

  const skus = toStoreSkuArray(storeProduct.skus);
  const ownedSku = skus.find((sku) => Boolean(sku?.isInUserCollection)) ?? null;
  if (ownedSku) {
    return normalizeStoreSku(ownedSku);
  }

  if (Boolean(storeProduct.isInUserCollection) && skus.length > 0) {
    const fallbackSku = normalizeStoreSku(skus[0]);
    return fallbackSku
      ? {
          ...fallbackSku,
          isInUserCollection: true,
        }
      : null;
  }

  return null;
}

function getStoreProductKinds(productConfig: StoreLicenseProductConfig): string[] {
  if (productConfig.licenseKind === 'subscription') {
    return ['Subscription', 'Durable'];
  }
  if (productConfig.licenseKind === 'consumable') {
    // One-time tip / IAP consumables must not be queried as Durable.
    return ['Consumable'];
  }
  return ['Durable', 'Subscription'];
}

function getQueryResultErrorCode(queryResult: DynWinRtStoreProductQueryResult | null | undefined): string | null {
  return normalizeErrorCode(queryResult?.extendedError);
}

function getQueryResultErrorMessage(errorCode: string | null, context: string): string | null {
  if (!errorCode) {
    return null;
  }

  return `${context} failed with ${errorCode}.`;
}

function normalizeStoreProduct(
  product: DynWinRtStoreProduct | null,
  fallbackStoreId: string,
  fallbackTitle: string,
  isOwned: boolean,
): RawStoreLicenseProduct {
  return {
    storeId: typeof product?.storeId === 'string' ? product.storeId : fallbackStoreId,
    title: typeof product?.title === 'string' ? product.title : fallbackTitle,
    isInUserCollection: isOwned || Boolean(product?.isInUserCollection),
  };
}

export function buildSupportedStateFromProductQueries(options: {
  fetchedAt: string;
  associatedQueryResult: DynWinRtStoreProductQueryResult | null;
  collectionQueryResult: DynWinRtStoreProductQueryResult | null;
  productConfig?: StoreLicenseProductConfig;
}): RawStoreLicenseState {
  const productConfig = options.productConfig ?? sponsorPlanProductConfig;
  const associatedProduct = findMatchingStoreProduct(options.associatedQueryResult, productConfig.storeId);
  const collectionProduct = findMatchingStoreProduct(options.collectionQueryResult, productConfig.storeId);
  const sku = findOwnedSku(collectionProduct) ?? findOwnedSku(associatedProduct);
  const isOwned = Boolean(collectionProduct?.isInUserCollection || associatedProduct?.isInUserCollection || sku?.isInUserCollection);
  const errorCode = getQueryResultErrorCode(options.collectionQueryResult) ?? getQueryResultErrorCode(options.associatedQueryResult);

  return {
    fetchedAt: options.fetchedAt,
    availability: 'supported',
    appLicenseActive: false,
    product: normalizeStoreProduct(associatedProduct ?? collectionProduct, productConfig.storeId, productConfig.productName, isOwned),
    sku,
    license: null,
    purchaseEligibility: isOwned
      ? 'license-action-not-applicable'
      : associatedProduct
        ? 'licensable'
        : 'unknown',
    errorCode,
    errorMessage: getQueryResultErrorMessage(errorCode, 'Microsoft Store product query'),
  };
}

function buildUnavailableState(fetchedAt: string, error: unknown): RawStoreLicenseState {
  const { errorCode, errorMessage } = normalizeThrownError(error);

  return {
    fetchedAt,
    availability: 'store-unavailable',
    appLicenseActive: false,
    product: null,
    sku: null,
    license: null,
    purchaseEligibility: 'unknown',
    errorCode,
    errorMessage,
  };
}

function buildUnsupportedPurchaseResult(error: unknown): RawStorePurchaseResult {
  const { errorCode, errorMessage } = normalizeThrownError(error);

  return {
    outcome: 'not-supported',
    errorCode,
    errorMessage,
  };
}

export function readNativeWindowHandle(rawHandle: Buffer | bigint | null | undefined): bigint | null {
  if (typeof rawHandle === 'bigint') {
    return rawHandle;
  }

  if (!rawHandle || rawHandle.length === 0) {
    return null;
  }

  if (rawHandle.length >= 8) {
    return rawHandle.readBigUInt64LE(0);
  }

  if (rawHandle.length >= 4) {
    return BigInt(rawHandle.readUInt32LE(0));
  }

  let value = 0n;
  for (let index = 0; index < rawHandle.length; index += 1) {
    value |= BigInt(rawHandle[index]) << BigInt(index * 8);
  }

  return value;
}

async function createNativeAddonBroker(
  windowHandle: bigint | null,
  productConfig: StoreLicenseProductConfig = sponsorPlanProductConfig,
): Promise<StoreLicensePlatformBroker> {
  const addonModulePath = resolveWindowsStorePurchaseAddonPath();
  if (!addonModulePath) {
    throw new Error('Microsoft Store native addon is unavailable.');
  }

  return new NativeAddonStoreSubscriptionBroker(
    addonModulePath,
    windowHandle,
    productConfig,
  );
}

class NativeAddonStoreSubscriptionBroker implements StoreLicensePlatformBroker {
  constructor(
    private readonly addonModulePath: string,
    private readonly windowHandle: bigint | null,
    private readonly productConfig: StoreLicenseProductConfig,
  ) {}

  async queryStatus(): Promise<RawStoreLicenseState> {
    const productKinds = getStoreProductKinds(this.productConfig);
    const state = await executeWindowsStoreStatusAddon({
      modulePath: this.addonModulePath,
      storeId: this.productConfig.storeId,
      productName: this.productConfig.productName,
      productKinds,
    });
    const isOwned = Boolean(state.license?.isActive || state.sku?.isInUserCollection || state.product?.isInUserCollection);

    if (state.availability === 'supported') {
      log.info('[MicrosoftStoreSubscriptionBroker] Store status query completed.', {
        productKey: this.productConfig.key,
        storeId: this.productConfig.storeId,
        productKinds,
        productFound: Boolean(state.product),
        owned: isOwned,
        skuStoreId: state.sku?.storeId ?? null,
        skuCollectionEndDate: state.sku?.collectionEndDate ?? null,
        resolvedAvailability: state.availability,
        resolvedPurchaseEligibility: state.purchaseEligibility,
        resolvedErrorCode: state.errorCode,
      });
    } else {
      log.warn('[MicrosoftStoreSubscriptionBroker] Store status query failed.', {
        productKey: this.productConfig.key,
        storeId: this.productConfig.storeId,
        productKinds,
        errorCode: state.errorCode,
        errorMessage: state.errorMessage,
      });
    }

    return state;
  }

  async purchase(): Promise<RawStorePurchaseResult> {
    return executeWindowsStorePurchaseAddon({
      modulePath: this.addonModulePath,
      storeId: this.productConfig.storeId,
      ownerWindowHandle: this.windowHandle,
    });
  }

  dispose(): void {}
}

class UnavailableSubscriptionPlatformBroker implements StoreLicensePlatformBroker {
  constructor(private readonly error: unknown) {}

  async queryStatus(): Promise<RawStoreLicenseState> {
    return buildUnavailableState(new Date().toISOString(), this.error);
  }

  async purchase(): Promise<RawStorePurchaseResult> {
    return buildUnsupportedPurchaseResult(this.error);
  }

  dispose(): void {}
}

export class MicrosoftStoreSubscriptionBroker implements StoreLicensePlatformBroker {
  private readonly adapterFactory: (
    windowHandle: bigint | null,
    productConfig?: StoreLicenseProductConfig,
  ) => Promise<StoreLicensePlatformBroker>;
  private readonly windowHandle: bigint | null;
  private readonly productConfig: StoreLicenseProductConfig;
  private brokerPromise: Promise<StoreLicensePlatformBroker> | null = null;
  private broker: StoreLicensePlatformBroker | null = null;
  private disposed = false;

  constructor(options: MicrosoftStoreSubscriptionBrokerOptions = {}) {
    this.windowHandle = readNativeWindowHandle(options.windowHandle ?? null);
    this.adapterFactory = options.adapterFactory ?? createNativeAddonBroker;
    this.productConfig = options.productConfig ?? sponsorPlanProductConfig;
  }

  private async resolveBroker(): Promise<StoreLicensePlatformBroker> {
    if (this.broker) {
      return this.broker;
    }

    if (!this.brokerPromise) {
      this.brokerPromise = this.initializeBroker();
    }

    return this.brokerPromise;
  }

  private async initializeBroker(): Promise<StoreLicensePlatformBroker> {
    try {
      return this.setBroker(await this.adapterFactory(this.windowHandle, this.productConfig));
    } catch (error) {
      return this.setBroker(new UnavailableSubscriptionPlatformBroker(error));
    }
  }

  private setBroker(broker: StoreLicensePlatformBroker): StoreLicensePlatformBroker {
    this.broker = broker;

    if (this.disposed) {
      broker.dispose();
    }

    return broker;
  }

  async queryStatus(): Promise<RawStoreLicenseState> {
    return (await this.resolveBroker()).queryStatus();
  }

  async purchase(): Promise<RawStorePurchaseResult> {
    return (await this.resolveBroker()).purchase();
  }

  dispose(): void {
    this.disposed = true;
    this.broker?.dispose();
  }
}
