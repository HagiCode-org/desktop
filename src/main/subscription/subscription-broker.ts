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

export interface MicrosoftStoreSubscriptionBrokerOptions {
  windowHandle?: Buffer | bigint | null;
  adapterFactory?: (windowHandle: bigint | null) => Promise<SubscriptionPlatformBroker>;
}

type DynWinRtRuntimeModule = {
  roInitialize?: (mode?: number) => void;
};

type DynWinRtStoreContext = {
  getAppLicenseAsync(signal?: AbortSignal): Promise<unknown>;
  getStoreProductsForProductKindsAsync(
    productKinds: string[],
    storeIds: string[],
    signal?: AbortSignal,
  ): Promise<unknown>;
  getUserCollectionAsync(productKinds: string[], signal?: AbortSignal): Promise<unknown>;
  canAcquireStoreLicenseAsync(storeId: string, signal?: AbortSignal): Promise<unknown>;
  requestPurchaseAsync(storeId: string, signal?: AbortSignal): Promise<unknown>;
};

type DynWinRtStoreModule = DynWinRtRuntimeModule & {
  StoreCanLicenseStatus: Record<string, number>;
  StoreContext: {
    getDefault(): DynWinRtStoreContext;
  };
  StorePurchaseStatus: Record<string, number>;
  InitializeWithWindow?: {
    initialize?: (target: unknown, hwnd: bigint | number) => void;
    Initialize?: (target: unknown, hwnd: bigint | number) => void;
  };
  IClosable?: {
    from(value: unknown): { close(): void };
  };
};

const STORE_PRODUCT_KINDS = ['Durable', 'Consumable', 'UnmanagedConsumable'];
const DYNWINRT_RUNTIME_SPECIFIER = '@microsoft/dynwinrt';
const DYNWINRT_BINDINGS_SPECIFIER = './generated-js/index.js';

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

function getFirstNamedNumber(enumObject: Record<string, number>, keys: string[]): number | undefined {
  for (const key of keys) {
    if (typeof enumObject[key] === 'number') {
      return enumObject[key];
    }
  }

  return undefined;
}

function mapPurchaseOutcome(statusEnum: Record<string, number>, statusValue: unknown): SubscriptionPurchaseOutcome {
  const statusNumber = typeof statusValue === 'number' ? statusValue : Number.NaN;

  switch (statusNumber) {
    case getFirstNamedNumber(statusEnum, ['succeeded', 'Succeeded']):
      return 'succeeded';
    case getFirstNamedNumber(statusEnum, ['alreadyPurchased', 'AlreadyPurchased']):
      return 'already-purchased';
    case getFirstNamedNumber(statusEnum, ['notPurchased', 'NotPurchased']):
      return 'canceled';
    case getFirstNamedNumber(statusEnum, ['networkError', 'NetworkError']):
      return 'network-error';
    case getFirstNamedNumber(statusEnum, ['serverError', 'ServerError']):
      return 'server-error';
    default:
      return 'failed';
  }
}

function mapPurchaseEligibility(
  statusEnum: Record<string, number>,
  statusValue: unknown,
): RawStoreSubscriptionState['purchaseEligibility'] {
  const statusNumber = typeof statusValue === 'number' ? statusValue : Number.NaN;

  switch (statusNumber) {
    case getFirstNamedNumber(statusEnum, ['licensable', 'Licensable']):
      return 'licensable';
    case getFirstNamedNumber(statusEnum, ['notLicensableToUser', 'NotLicensableToUser']):
      return 'not-licensable';
    case getFirstNamedNumber(statusEnum, ['licenseActionNotApplicableToProduct', 'LicenseActionNotApplicableToProduct']):
      return 'license-action-not-applicable';
    case getFirstNamedNumber(statusEnum, ['networkError', 'NetworkError']):
      return 'network-error';
    case getFirstNamedNumber(statusEnum, ['serverError', 'ServerError']):
      return 'server-error';
    default:
      return 'unknown';
  }
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

function buildUnavailableState(fetchedAt: string, error: unknown): RawStoreSubscriptionState {
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

function readNativeWindowHandle(rawHandle: Buffer | bigint | null | undefined): bigint | null {
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

function initializeOwnerWindow(
  storeModule: DynWinRtStoreModule,
  context: DynWinRtStoreContext,
  windowHandle: bigint | null,
): void {
  if (windowHandle == null) {
    return;
  }

  const initializer = storeModule.InitializeWithWindow;
  const initialize = initializer?.initialize ?? initializer?.Initialize;

  if (typeof initialize !== 'function') {
    return;
  }

  initialize.call(initializer, context, windowHandle);
}

async function loadDynWinRtStoreModule(): Promise<DynWinRtStoreModule> {
  const runtimeSpecifier = DYNWINRT_RUNTIME_SPECIFIER;
  const bindingsSpecifier = DYNWINRT_BINDINGS_SPECIFIER;
  const [runtimeModule, bindingsModule] = await Promise.all([
    import(runtimeSpecifier),
    import(bindingsSpecifier),
  ]);

  return {
    ...(bindingsModule as Record<string, unknown>),
    ...(runtimeModule as Record<string, unknown>),
  } as DynWinRtStoreModule;
}

async function createDynWinRtBroker(windowHandle: bigint | null): Promise<SubscriptionPlatformBroker> {
  return DynWinRtStoreSubscriptionBroker.create(windowHandle);
}

class DynWinRtStoreSubscriptionBroker implements SubscriptionPlatformBroker {
  static async create(windowHandle: bigint | null): Promise<DynWinRtStoreSubscriptionBroker> {
    const storeModule = await loadDynWinRtStoreModule();

    try {
      storeModule.roInitialize?.(1);
    } catch {
      // Electron may have already initialized COM for this thread.
    }

    const context = storeModule.StoreContext.getDefault();
    initializeOwnerWindow(storeModule, context, windowHandle);
    return new DynWinRtStoreSubscriptionBroker(storeModule, context);
  }

  private constructor(
    private readonly storeModule: DynWinRtStoreModule,
    private readonly context: DynWinRtStoreContext,
  ) {}

  async queryStatus(): Promise<RawStoreSubscriptionState> {
    const fetchedAt = new Date().toISOString();

    try {
      const [appLicense, productsResult, collectionResult, canAcquireResult] = await Promise.all([
        this.context.getAppLicenseAsync(),
        this.context.getStoreProductsForProductKindsAsync(STORE_PRODUCT_KINDS, [HAGICODE_SPONSOR_PLAN_STORE_ID]),
        this.context.getUserCollectionAsync(STORE_PRODUCT_KINDS),
        this.context.canAcquireStoreLicenseAsync(HAGICODE_SPONSOR_PLAN_STORE_ID),
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
        purchaseEligibility: mapPurchaseEligibility(this.storeModule.StoreCanLicenseStatus, (canAcquireResult as { status?: unknown }).status),
        errorCode: normalizeErrorCode((productsResult as { extendedError?: unknown } | null)?.extendedError),
        errorMessage: null,
      };
    } catch (error) {
      return buildUnavailableState(fetchedAt, error);
    }
  }

  async purchase(): Promise<RawStorePurchaseResult> {
    try {
      const result = await this.context.requestPurchaseAsync(HAGICODE_SPONSOR_PLAN_STORE_ID);

      return {
        outcome: mapPurchaseOutcome(this.storeModule.StorePurchaseStatus, (result as { status?: unknown }).status),
        errorCode: normalizeErrorCode((result as { extendedError?: unknown } | null)?.extendedError),
        errorMessage: null,
      };
    } catch (error) {
      return {
        outcome: 'failed',
        ...normalizeThrownError(error),
      };
    }
  }

  dispose(): void {
    try {
      this.storeModule.IClosable?.from(this.context).close();
    } catch {
      // StoreContext does not always expose IClosable in generated bindings.
    }
  }
}

class UnavailableSubscriptionPlatformBroker implements SubscriptionPlatformBroker {
  constructor(private readonly error: unknown) {}

  async queryStatus(): Promise<RawStoreSubscriptionState> {
    return buildUnavailableState(new Date().toISOString(), this.error);
  }

  async purchase(): Promise<RawStorePurchaseResult> {
    return buildUnsupportedPurchaseResult(this.error);
  }

  dispose(): void {}
}

export class MicrosoftStoreSubscriptionBroker implements SubscriptionPlatformBroker {
  private readonly adapterFactory: (windowHandle: bigint | null) => Promise<SubscriptionPlatformBroker>;
  private readonly windowHandle: bigint | null;
  private brokerPromise: Promise<SubscriptionPlatformBroker> | null = null;
  private broker: SubscriptionPlatformBroker | null = null;
  private disposed = false;

  constructor(options: MicrosoftStoreSubscriptionBrokerOptions = {}) {
    this.windowHandle = readNativeWindowHandle(options.windowHandle ?? null);
    this.adapterFactory = options.adapterFactory ?? createDynWinRtBroker;
  }

  private async resolveBroker(): Promise<SubscriptionPlatformBroker> {
    if (this.broker) {
      return this.broker;
    }

    if (!this.brokerPromise) {
      this.brokerPromise = this.initializeBroker();
    }

    return this.brokerPromise;
  }

  private async initializeBroker(): Promise<SubscriptionPlatformBroker> {
    try {
      return this.setBroker(await this.adapterFactory(this.windowHandle));
    } catch (error) {
      return this.setBroker(new UnavailableSubscriptionPlatformBroker(error));
    }
  }

  private setBroker(broker: SubscriptionPlatformBroker): SubscriptionPlatformBroker {
    this.broker = broker;

    if (this.disposed) {
      broker.dispose();
    }

    return broker;
  }

  async queryStatus(): Promise<RawStoreSubscriptionState> {
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
