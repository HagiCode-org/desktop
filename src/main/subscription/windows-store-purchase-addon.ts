import path from 'node:path';
import { createRequire } from 'node:module';
import { HAGICODE_SPONSOR_PLAN_STORE_ID, type SubscriptionPurchaseOutcome } from '../../types/subscription.js';
import type { RawStorePurchaseResult } from './subscription-broker.js';

export interface WindowsStorePurchaseAddonResult {
  outcome: SubscriptionPurchaseOutcome;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface WindowsStoreLicenseQueryAddonResult {
  fetchedAt: string;
  availability: 'supported' | 'store-unavailable' | 'error';
  appLicenseActive: boolean;
  product: {
    storeId: string;
    title: string | null;
    isInUserCollection: boolean;
  } | null;
  sku: {
    storeId: string | null;
    title: string | null;
    isSubscription: boolean;
    isInUserCollection: boolean;
    collectionEndDate: string | null;
  } | null;
  license: {
    storeId: string | null;
    isActive: boolean;
    expirationDate: string | null;
  } | null;
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

interface WindowsStorePurchaseAddonOptions {
  modulePath: string;
  storeId?: string;
  ownerWindowHandle?: bigint | null;
}

interface WindowsStoreStatusAddonOptions {
  modulePath: string;
  storeId: string;
  productName: string;
  productKinds: string[];
}

export interface WindowsStoreUnfulfilledConsumableItem {
  trackingId: string;
  productId: string;
  quantity: number;
}

export interface WindowsStoreUnfulfilledConsumablesResult {
  ok: boolean;
  items: WindowsStoreUnfulfilledConsumableItem[];
  errorCode: string | null;
  errorMessage: string | null;
}

export interface WindowsStoreReportConsumableFulfillmentResult {
  ok: boolean;
  status: string;
  trackingId: string | null;
  balanceRemaining: number;
  errorCode: string | null;
  errorMessage: string | null;
}

interface WindowsStoreUnfulfilledConsumablesOptions {
  modulePath: string;
  productIds?: string[];
}

interface WindowsStoreReportConsumableFulfillmentOptions {
  modulePath: string;
  productId: string;
  trackingId?: string | null;
  quantity?: number;
}

interface NativeWindowsStoreAddon {
  requestPurchase(storeId: string, ownerWindowHandle?: string | null): Promise<Record<string, unknown>>;
  queryStoreStatus(storeId: string, productName: string, productKinds: string[]): Promise<Record<string, unknown>>;
  getUnfulfilledConsumables?(productIds?: string[]): Promise<Record<string, unknown>>;
  reportConsumableFulfillment?(
    productId: string,
    trackingId?: string | null,
    quantity?: number,
  ): Promise<Record<string, unknown>>;
}

type LoadPurchaseAddon = (modulePath: string) => NativeWindowsStoreAddon;

const require = createRequire(import.meta.url);
const ADDON_DIRECTORY = 'windows-store-purchase-addon';
const ADDON_MODULE_NAME = 'hagicode_store_purchase_addon.node';

function normalizeErrorCode(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
    return String(value);
  }

  return null;
}

function normalizeErrorMessage(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeAvailability(value: unknown): WindowsStoreLicenseQueryAddonResult['availability'] {
  return value === 'supported' || value === 'store-unavailable' || value === 'error'
    ? value
    : 'store-unavailable';
}

function normalizePurchaseEligibility(value: unknown): WindowsStoreLicenseQueryAddonResult['purchaseEligibility'] {
  return [
    'licensable',
    'not-licensable',
    'license-action-not-applicable',
    'network-error',
    'server-error',
    'unknown',
  ].includes(String(value))
    ? value as WindowsStoreLicenseQueryAddonResult['purchaseEligibility']
    : 'unknown';
}

function normalizeIsoDate(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeThrownError(error: unknown): { errorCode: string | null; errorMessage: string | null } {
  if (error && typeof error === 'object') {
    const errorLike = error as { code?: unknown; message?: unknown };
    return {
      errorCode: normalizeErrorCode(errorLike.code),
      errorMessage: normalizeErrorMessage(errorLike.message) ?? String(error),
    };
  }

  if (error instanceof Error) {
    return {
      errorCode: normalizeErrorCode((error as Error & { code?: unknown }).code),
      errorMessage: error.message,
    };
  }

  return {
    errorCode: null,
    errorMessage: error == null ? null : String(error),
  };
}

function isValidPurchaseOutcome(value: unknown): value is SubscriptionPurchaseOutcome {
  return [
    'succeeded',
    'already-purchased',
    'canceled',
    'not-purchased',
    'network-error',
    'server-error',
    'not-supported',
    'failed',
  ].includes(String(value));
}

function formatOwnerWindowHandle(value: bigint | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const formatted = value.toString(16);
  return formatted.startsWith('-') ? value.toString() : `0x${formatted}`;
}

export function resolveWindowsStorePurchaseAddonPath(options: {
  resourcesPath?: string | null;
  arch?: string | null;
} = {}): string | null {
  const resourcesPath = String(options.resourcesPath || process.resourcesPath || '').trim();
  const arch = String(options.arch || process.arch || '').trim().toLowerCase();

  if (!resourcesPath || !arch) {
    return null;
  }

  return path.join(resourcesPath, 'extra', ADDON_DIRECTORY, arch, ADDON_MODULE_NAME);
}

export function parseWindowsStorePurchaseAddonResult(value: Record<string, unknown>): WindowsStorePurchaseAddonResult {
  const outcome = isValidPurchaseOutcome(value.outcome) ? value.outcome : 'failed';

  return {
    outcome,
    errorCode: normalizeErrorCode(value.errorCode),
    errorMessage: normalizeErrorMessage(value.errorMessage),
  };
}

function defaultLoadPurchaseAddon(modulePath: string): NativeWindowsStoreAddon {
  return require(modulePath) as NativeWindowsStoreAddon;
}

function parseQueryProduct(
  value: unknown,
  fallbackStoreId: string,
  fallbackTitle: string,
): WindowsStoreLicenseQueryAddonResult['product'] {
  if (!value || typeof value !== 'object') {
    return {
      storeId: fallbackStoreId,
      title: fallbackTitle,
      isInUserCollection: false,
    };
  }

  const record = value as Record<string, unknown>;
  return {
    storeId: typeof record.storeId === 'string' && record.storeId.trim().length > 0 ? record.storeId.trim() : fallbackStoreId,
    title: typeof record.title === 'string' && record.title.trim().length > 0 ? record.title.trim() : fallbackTitle,
    isInUserCollection: Boolean(record.isInUserCollection),
  };
}

function parseQuerySku(value: unknown): WindowsStoreLicenseQueryAddonResult['sku'] {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    storeId: typeof record.storeId === 'string' && record.storeId.trim().length > 0 ? record.storeId.trim() : null,
    title: typeof record.title === 'string' && record.title.trim().length > 0 ? record.title.trim() : null,
    isSubscription: Boolean(record.isSubscription),
    isInUserCollection: Boolean(record.isInUserCollection),
    collectionEndDate: normalizeIsoDate(record.collectionEndDate),
  };
}

function parseQueryLicense(value: unknown): WindowsStoreLicenseQueryAddonResult['license'] {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    storeId: typeof record.storeId === 'string' && record.storeId.trim().length > 0 ? record.storeId.trim() : null,
    isActive: Boolean(record.isActive),
    expirationDate: normalizeIsoDate(record.expirationDate),
  };
}

function buildUnavailableStatusResult(
  options: Pick<WindowsStoreStatusAddonOptions, 'storeId' | 'productName'>,
  errorCode: string | null,
  errorMessage: string | null,
): WindowsStoreLicenseQueryAddonResult {
  return {
    fetchedAt: new Date().toISOString(),
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

export function parseWindowsStoreLicenseQueryAddonResult(
  value: Record<string, unknown>,
  options: Pick<WindowsStoreStatusAddonOptions, 'storeId' | 'productName'>,
): WindowsStoreLicenseQueryAddonResult {
  const availability = normalizeAvailability(value.availability);
  return {
    fetchedAt: normalizeIsoDate(value.fetchedAt) ?? new Date().toISOString(),
    availability,
    appLicenseActive: Boolean(value.appLicenseActive),
    product: availability === 'supported'
      ? parseQueryProduct(value.product, options.storeId, options.productName)
      : value.product && typeof value.product === 'object'
        ? parseQueryProduct(value.product, options.storeId, options.productName)
        : null,
    sku: parseQuerySku(value.sku),
    license: parseQueryLicense(value.license),
    purchaseEligibility: normalizePurchaseEligibility(value.purchaseEligibility),
    errorCode: normalizeErrorCode(value.errorCode),
    errorMessage: normalizeErrorMessage(value.errorMessage),
  };
}

export async function executeWindowsStorePurchaseAddon(
  options: WindowsStorePurchaseAddonOptions,
  loadPurchaseAddon: LoadPurchaseAddon = defaultLoadPurchaseAddon,
): Promise<RawStorePurchaseResult> {
  const modulePath = String(options.modulePath || '').trim();
  if (!modulePath) {
    return {
      outcome: 'not-supported',
      errorCode: 'addon-missing',
      errorMessage: 'Microsoft Store purchase addon is unavailable.',
    };
  }

  let nativeAddon: NativeWindowsStoreAddon;
  try {
    nativeAddon = loadPurchaseAddon(modulePath);
  } catch (error) {
    return {
      outcome: 'not-supported',
      errorCode: 'addon-load-failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const rawResult = await nativeAddon.requestPurchase(
      options.storeId || HAGICODE_SPONSOR_PLAN_STORE_ID,
      formatOwnerWindowHandle(options.ownerWindowHandle),
    );
    return parseWindowsStorePurchaseAddonResult(rawResult);
  } catch (error) {
    const { errorCode, errorMessage } = normalizeThrownError(error);
    return {
      outcome: 'failed',
      errorCode: errorCode ?? 'addon-execution-failed',
      errorMessage,
    };
  }
}

export async function executeWindowsStoreStatusAddon(
  options: WindowsStoreStatusAddonOptions,
  loadPurchaseAddon: LoadPurchaseAddon = defaultLoadPurchaseAddon,
): Promise<WindowsStoreLicenseQueryAddonResult> {
  const modulePath = String(options.modulePath || '').trim();
  if (!modulePath) {
    return buildUnavailableStatusResult(options, 'addon-missing', 'Microsoft Store status addon is unavailable.');
  }

  let nativeAddon: NativeWindowsStoreAddon;
  try {
    nativeAddon = loadPurchaseAddon(modulePath);
  } catch (error) {
    return buildUnavailableStatusResult(
      options,
      'addon-load-failed',
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const rawResult = await nativeAddon.queryStoreStatus(
      options.storeId,
      options.productName,
      options.productKinds,
    );
    return parseWindowsStoreLicenseQueryAddonResult(rawResult, options);
  } catch (error) {
    const { errorCode, errorMessage } = normalizeThrownError(error);
    return buildUnavailableStatusResult(options, errorCode ?? 'addon-execution-failed', errorMessage);
  }
}


function normalizeQuantity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return 0;
}

export function parseWindowsStoreUnfulfilledConsumablesResult(
  value: Record<string, unknown>,
): WindowsStoreUnfulfilledConsumablesResult {
  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items: WindowsStoreUnfulfilledConsumableItem[] = [];

  for (const entry of rawItems) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const productId = typeof record.productId === 'string' ? record.productId.trim() : '';
    if (!productId) {
      continue;
    }
    items.push({
      trackingId: typeof record.trackingId === 'string' ? record.trackingId.trim() : '',
      productId,
      quantity: normalizeQuantity(record.quantity),
    });
  }

  const explicitOk = value.ok;
  const ok = typeof explicitOk === 'boolean'
    ? explicitOk
    : normalizeErrorCode(value.errorCode) == null;

  return {
    ok,
    items,
    errorCode: normalizeErrorCode(value.errorCode),
    errorMessage: normalizeErrorMessage(value.errorMessage),
  };
}

export function parseWindowsStoreReportConsumableFulfillmentResult(
  value: Record<string, unknown>,
): WindowsStoreReportConsumableFulfillmentResult {
  const status = typeof value.status === 'string' && value.status.trim().length > 0
    ? value.status.trim()
    : 'failed';
  const explicitOk = value.ok;
  const ok = typeof explicitOk === 'boolean'
    ? explicitOk
    : status === 'succeeded';

  return {
    ok,
    status,
    trackingId: typeof value.trackingId === 'string' && value.trackingId.trim().length > 0
      ? value.trackingId.trim()
      : null,
    balanceRemaining: normalizeQuantity(value.balanceRemaining),
    errorCode: normalizeErrorCode(value.errorCode),
    errorMessage: normalizeErrorMessage(value.errorMessage),
  };
}

export async function executeWindowsStoreGetUnfulfilledConsumables(
  options: WindowsStoreUnfulfilledConsumablesOptions,
  loadPurchaseAddon: LoadPurchaseAddon = defaultLoadPurchaseAddon,
): Promise<WindowsStoreUnfulfilledConsumablesResult> {
  const modulePath = String(options.modulePath || '').trim();
  if (!modulePath) {
    return {
      ok: false,
      items: [],
      errorCode: 'addon-missing',
      errorMessage: 'Microsoft Store purchase addon is unavailable.',
    };
  }

  let nativeAddon: NativeWindowsStoreAddon;
  try {
    nativeAddon = loadPurchaseAddon(modulePath);
  } catch (error) {
    return {
      ok: false,
      items: [],
      errorCode: 'addon-load-failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  if (typeof nativeAddon.getUnfulfilledConsumables !== 'function') {
    return {
      ok: false,
      items: [],
      errorCode: 'addon-unsupported',
      errorMessage: 'Microsoft Store addon does not export getUnfulfilledConsumables.',
    };
  }

  try {
    const rawResult = await nativeAddon.getUnfulfilledConsumables(options.productIds ?? []);
    return parseWindowsStoreUnfulfilledConsumablesResult(rawResult);
  } catch (error) {
    const { errorCode, errorMessage } = normalizeThrownError(error);
    return {
      ok: false,
      items: [],
      errorCode: errorCode ?? 'unfulfilled-query-failed',
      errorMessage: errorMessage ?? 'Failed to query unfulfilled consumables.',
    };
  }
}

export async function executeWindowsStoreReportConsumableFulfillment(
  options: WindowsStoreReportConsumableFulfillmentOptions,
  loadPurchaseAddon: LoadPurchaseAddon = defaultLoadPurchaseAddon,
): Promise<WindowsStoreReportConsumableFulfillmentResult> {
  const modulePath = String(options.modulePath || '').trim();
  const productId = String(options.productId || '').trim();
  if (!modulePath) {
    return {
      ok: false,
      status: 'not-supported',
      trackingId: null,
      balanceRemaining: 0,
      errorCode: 'addon-missing',
      errorMessage: 'Microsoft Store purchase addon is unavailable.',
    };
  }
  if (!productId) {
    return {
      ok: false,
      status: 'failed',
      trackingId: null,
      balanceRemaining: 0,
      errorCode: 'product-id-required',
      errorMessage: 'reportConsumableFulfillment requires a productId.',
    };
  }

  let nativeAddon: NativeWindowsStoreAddon;
  try {
    nativeAddon = loadPurchaseAddon(modulePath);
  } catch (error) {
    return {
      ok: false,
      status: 'not-supported',
      trackingId: null,
      balanceRemaining: 0,
      errorCode: 'addon-load-failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  if (typeof nativeAddon.reportConsumableFulfillment !== 'function') {
    return {
      ok: false,
      status: 'not-supported',
      trackingId: null,
      balanceRemaining: 0,
      errorCode: 'addon-unsupported',
      errorMessage: 'Microsoft Store addon does not export reportConsumableFulfillment.',
    };
  }

  try {
    const rawResult = await nativeAddon.reportConsumableFulfillment(
      productId,
      options.trackingId ?? null,
      options.quantity ?? 1,
    );
    return parseWindowsStoreReportConsumableFulfillmentResult(rawResult);
  } catch (error) {
    const { errorCode, errorMessage } = normalizeThrownError(error);
    return {
      ok: false,
      status: 'failed',
      trackingId: typeof options.trackingId === 'string' ? options.trackingId : null,
      balanceRemaining: 0,
      errorCode: errorCode ?? 'consumable-report-failed',
      errorMessage: errorMessage ?? 'Failed to report consumable fulfillment.',
    };
  }
}
