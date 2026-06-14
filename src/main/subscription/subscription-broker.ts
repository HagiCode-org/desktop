import {
  HAGICODE_SPONSOR_PLAN_STORE_ID,
  type SubscriptionPurchaseOutcome,
} from '../../types/subscription.js';
import {
  executeWindowsStorePurchaseAddon,
  resolveWindowsStorePurchaseAddonPath,
} from './windows-store-purchase-addon.js';

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
  DynWinRtMethodSig?: new () => { addIn(type: unknown): unknown };
  DynWinRtType?: {
    registerInterface: (name: string, iid: unknown) => {
      addMethod: (name: string, signature: unknown) => {
        method: (index: number) => {
          invoke: (obj: unknown, args: unknown[]) => unknown;
        };
      };
    };
    u64: () => unknown;
  };
  DynWinRtValue?: {
    u64: (value: number) => unknown;
  };
  WinGuid?: {
    parse: (guid: string) => unknown;
  };
  roInitialize?: (mode?: number) => void;
};

type DynWinRtStoreLicense = {
  skuStoreId?: unknown;
  isActive?: unknown;
  expirationDate?: unknown;
};

type DynWinRtStoreLicenseMap = {
  hasKey?: (key: string) => boolean;
  get?: (key: string) => DynWinRtStoreLicense | undefined;
};

type DynWinRtStoreAppLicense = {
  isActive?: unknown;
  addOnLicenses?: DynWinRtStoreLicenseMap | null;
};

type DynWinRtCanAcquireLicenseResult = {
  status?: unknown;
  extendedError?: unknown;
};

type DynWinRtStoreContext = {
  getAppLicenseAsync(signal?: AbortSignal): Promise<unknown>;
  canAcquireStoreLicenseAsync(storeId: string, signal?: AbortSignal): Promise<unknown>;
  requestPurchaseAsync(storeId: string, signal?: AbortSignal): Promise<unknown>;
};

type DynWinRtStoreModule = DynWinRtRuntimeModule & {
  StoreCanLicenseStatus: Record<string, number>;
  StoreContext: {
    getDefault(): DynWinRtStoreContext;
  };
  StorePurchaseStatus: Record<string, number>;
};

const DYNWINRT_RUNTIME_SPECIFIER = '@microsoft/dynwinrt';
const DYNWINRT_STORE_CONTEXT_SPECIFIER = './generated-js/StoreContext.js';
const DYNWINRT_STORE_CAN_LICENSE_STATUS_SPECIFIER = './generated-js/StoreCanLicenseStatus.js';
const DYNWINRT_STORE_PURCHASE_STATUS_SPECIFIER = './generated-js/StorePurchaseStatus.js';
const WINDOWS_EPOCH_OFFSET_MILLISECONDS = 11644473600000n;
const HUNDRED_NANOSECONDS_PER_MILLISECOND = 10000n;
const INITIALIZE_WITH_WINDOW_IID = '3E68D4BD-7135-4D10-8018-9FB6D9F33FA1';

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

function findMatchingLicense(appLicense: DynWinRtStoreAppLicense | null): RawStoreSubscriptionLicense | null {
  const addOnLicenses = appLicense?.addOnLicenses;
  const hasKey = addOnLicenses?.hasKey;
  const get = addOnLicenses?.get;

  if (typeof hasKey !== 'function' || typeof get !== 'function') {
    return null;
  }

  if (!hasKey.call(addOnLicenses, HAGICODE_SPONSOR_PLAN_STORE_ID)) {
    return null;
  }

  const license = get.call(addOnLicenses, HAGICODE_SPONSOR_PLAN_STORE_ID);

  if (!license) {
    return null;
  }

  return {
    storeId: typeof license.skuStoreId === 'string' ? license.skuStoreId : null,
    isActive: Boolean(license.isActive),
    expirationDate: toIsoDate(license.expirationDate),
  };
}

export function buildSupportedStateFromMinimalStoreApis(options: {
  fetchedAt: string;
  appLicense: DynWinRtStoreAppLicense | null;
  canAcquireResult: DynWinRtCanAcquireLicenseResult | null;
  canLicenseStatusEnum: Record<string, number>;
}): RawStoreSubscriptionState {
  const license = findMatchingLicense(options.appLicense);

  return {
    fetchedAt: options.fetchedAt,
    availability: 'supported',
    appLicenseActive: Boolean(options.appLicense?.isActive),
    product: {
      storeId: HAGICODE_SPONSOR_PLAN_STORE_ID,
      title: null,
    },
    sku: null,
    license,
    purchaseEligibility: mapPurchaseEligibility(options.canLicenseStatusEnum, options.canAcquireResult?.status),
    errorCode: normalizeErrorCode(options.canAcquireResult?.extendedError),
    errorMessage: null,
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

  const runtimeModule = storeModule as DynWinRtRuntimeModule;
  const DynWinRtType = runtimeModule.DynWinRtType;
  const DynWinRtMethodSig = runtimeModule.DynWinRtMethodSig;
  const DynWinRtValue = runtimeModule.DynWinRtValue;
  const WinGuid = runtimeModule.WinGuid;

  if (!DynWinRtType || !DynWinRtMethodSig || !DynWinRtValue || !WinGuid) {
    return;
  }

  const initializeWithWindowType = DynWinRtType
    .registerInterface('IInitializeWithWindow', WinGuid.parse(INITIALIZE_WITH_WINDOW_IID))
    .addMethod('Initialize', new DynWinRtMethodSig().addIn(DynWinRtType.u64()));
  const rawContext = (context as { _obj?: unknown } | null)?._obj ?? context;
  const cast = (rawContext as { cast?: (iid: unknown) => unknown }).cast;

  if (typeof cast !== 'function') {
    return;
  }

  const interopContext = cast.call(rawContext, WinGuid.parse(INITIALIZE_WITH_WINDOW_IID));
  initializeWithWindowType.method(6).invoke(interopContext, [DynWinRtValue.u64(Number(windowHandle))]);
}

async function loadGeneratedExport<T>(specifier: string, exportName: string): Promise<T> {
  const module = await import(specifier) as Record<string, unknown>;
  const value = module[exportName];

  if (value == null) {
    throw new Error(`dynwinrt generated binding ${specifier} did not export ${exportName}`);
  }

  return value as T;
}
async function loadDynWinRtStoreModule(): Promise<DynWinRtStoreModule> {
  // Avoid loading the generated namespace index, which eagerly evaluates the
  // full WinRT projection and can trigger unrelated circular-init failures.
  const [runtimeModule, StoreContext, StoreCanLicenseStatus, StorePurchaseStatus] = await Promise.all([
    import(DYNWINRT_RUNTIME_SPECIFIER),
    loadGeneratedExport<DynWinRtStoreModule['StoreContext']>(DYNWINRT_STORE_CONTEXT_SPECIFIER, 'StoreContext'),
    loadGeneratedExport<DynWinRtStoreModule['StoreCanLicenseStatus']>(DYNWINRT_STORE_CAN_LICENSE_STATUS_SPECIFIER, 'StoreCanLicenseStatus'),
    loadGeneratedExport<DynWinRtStoreModule['StorePurchaseStatus']>(DYNWINRT_STORE_PURCHASE_STATUS_SPECIFIER, 'StorePurchaseStatus'),
  ]);

  return {
    ...(runtimeModule as Record<string, unknown>),
    StoreContext,
    StoreCanLicenseStatus,
    StorePurchaseStatus,
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
    return new DynWinRtStoreSubscriptionBroker(storeModule, context, windowHandle);
  }

  private constructor(
    private readonly storeModule: DynWinRtStoreModule,
    private readonly context: DynWinRtStoreContext,
    private readonly windowHandle: bigint | null,
  ) {}

  async queryStatus(): Promise<RawStoreSubscriptionState> {
    const fetchedAt = new Date().toISOString();

    try {
      const [appLicense, canAcquireResult] = await Promise.all([
        this.context.getAppLicenseAsync(),
        this.context.canAcquireStoreLicenseAsync(HAGICODE_SPONSOR_PLAN_STORE_ID),
      ]);

      // Current dynwinrt preview crashes when marshalling string IIterable<T>
      // arguments, so store product collection queries are intentionally avoided
      // here until the upstream vector binding is fixed.
      return buildSupportedStateFromMinimalStoreApis({
        fetchedAt,
        appLicense: appLicense as DynWinRtStoreAppLicense | null,
        canAcquireResult: canAcquireResult as DynWinRtCanAcquireLicenseResult | null,
        canLicenseStatusEnum: this.storeModule.StoreCanLicenseStatus,
      });
    } catch (error) {
      return buildUnavailableState(fetchedAt, error);
    }
  }

  async purchase(): Promise<RawStorePurchaseResult> {
    const addonModulePath = resolveWindowsStorePurchaseAddonPath();
    if (addonModulePath) {
      const addonResult = await executeWindowsStorePurchaseAddon({
        modulePath: addonModulePath,
        storeId: HAGICODE_SPONSOR_PLAN_STORE_ID,
        ownerWindowHandle: this.windowHandle,
      });

      if (
        addonResult.outcome !== 'not-supported'
        && addonResult.errorCode !== 'addon-load-failed'
        && addonResult.errorCode !== 'addon-execution-failed'
      ) {
        return addonResult;
      }
    }

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
      (this.context as { close?: () => void }).close?.();
    } catch {
      // StoreContext does not always expose a close path in generated bindings.
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
