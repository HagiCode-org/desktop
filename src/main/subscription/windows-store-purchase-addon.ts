import path from 'node:path';
import { createRequire } from 'node:module';
import { HAGICODE_SPONSOR_PLAN_STORE_ID, type SubscriptionPurchaseOutcome } from '../../types/subscription.js';
import type { RawStorePurchaseResult } from './subscription-broker.js';

export interface WindowsStorePurchaseAddonResult {
  outcome: SubscriptionPurchaseOutcome;
  errorCode: string | null;
  errorMessage: string | null;
}

interface WindowsStorePurchaseAddonOptions {
  modulePath: string;
  storeId?: string;
  ownerWindowHandle?: bigint | null;
}

interface NativePurchaseAddon {
  requestPurchase(storeId: string, ownerWindowHandle?: string | null): Promise<Record<string, unknown>>;
}

type LoadPurchaseAddon = (modulePath: string) => NativePurchaseAddon;

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

function defaultLoadPurchaseAddon(modulePath: string): NativePurchaseAddon {
  return require(modulePath) as NativePurchaseAddon;
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
      errorMessage: 'Windows Store purchase addon is unavailable.',
    };
  }

  let nativeAddon: NativePurchaseAddon;
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
