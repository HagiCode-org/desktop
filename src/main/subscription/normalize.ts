import {
  createDefaultSubscriptionSnapshot,
  sponsorPlanProductConfig,
  type SubscriptionDiagnostic,
  type SubscriptionPurchaseOutcome,
  type SubscriptionSnapshot,
} from '../../types/subscription.js';
import {
  createDefaultTurboEngineLicenseSnapshot,
  turboEngineProductConfig,
  type TurboEngineLicenseSnapshot,
} from '../../types/turboengine-license.js';
import type {
  StoreLicenseProductConfig,
  StoreLicensePurchaseOutcome,
  StoreLicenseSnapshot,
  StoreLicenseStatus,
} from '../../types/store-license.js';
import type { RawStoreLicenseState, RawStorePurchaseResult } from './subscription-broker.js';

function toDiagnostics(raw: RawStoreLicenseState): SubscriptionDiagnostic[] {
  if (!raw.errorCode && !raw.errorMessage) {
    return [];
  }

  return [
    {
      code: raw.errorCode ?? 'store-query-failed',
      message: raw.errorMessage ?? 'Microsoft Store license query failed.',
      recordedAt: raw.fetchedAt,
    },
  ];
}

function deriveStatus(raw: RawStoreLicenseState, productConfig: StoreLicenseProductConfig): StoreLicenseStatus {
  if (raw.availability !== 'supported') {
    return 'unknown';
  }

  const expirationDate = raw.license?.expirationDate ?? raw.sku?.collectionEndDate ?? null;
  const expirationTime = expirationDate ? Date.parse(expirationDate) : Number.NaN;
  const hasExpired = Number.isFinite(expirationTime) && expirationTime < Date.now();
  const isOwned = Boolean(raw.license?.isActive || raw.sku?.isInUserCollection || raw.product?.isInUserCollection);

  if (isOwned && !hasExpired) {
    return 'active';
  }

  if (hasExpired) {
    return 'expired';
  }

  if (raw.purchaseEligibility === 'licensable') {
    return 'inactive';
  }

  if (raw.purchaseEligibility === 'not-licensable' && !isOwned) {
    return 'canceled';
  }

  if (raw.purchaseEligibility === 'license-action-not-applicable') {
    return isOwned ? 'active' : 'inactive';
  }

  return isOwned ? 'active' : 'inactive';
}

function normalizeStoreLicenseSnapshot<TSnapshot extends StoreLicenseSnapshot>(options: {
  raw: RawStoreLicenseState;
  productConfig: StoreLicenseProductConfig;
  createSnapshot: (overrides: Partial<TSnapshot>) => TSnapshot;
}): TSnapshot {
  const { raw, productConfig, createSnapshot } = options;
  const status = deriveStatus(raw, productConfig);
  const diagnostics = toDiagnostics(raw);

  return createSnapshot({
    availability: raw.availability,
    status,
    source: raw.availability === 'supported' ? 'store' : 'fallback',
    isStale: raw.availability !== 'supported',
    lastCheckedAt: raw.fetchedAt,
    lastSuccessfulSyncAt: raw.availability === 'supported' ? raw.fetchedAt : null,
    expirationDate: raw.license?.expirationDate ?? raw.sku?.collectionEndDate ?? null,
    renewalDate: raw.license?.expirationDate ?? raw.sku?.collectionEndDate ?? null,
    diagnostics,
  } as Partial<TSnapshot>);
}

function createGenericStaleSnapshot<TSnapshot extends StoreLicenseSnapshot>(options: {
  previousSnapshot: TSnapshot;
  error: unknown;
  checkedAt?: string;
}): TSnapshot {
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const message = options.error instanceof Error ? options.error.message : String(options.error);

  return {
    ...options.previousSnapshot,
    source: 'fallback',
    isStale: true,
    lastCheckedAt: checkedAt,
    diagnostics: [
      ...options.previousSnapshot.diagnostics.filter((diagnostic) => diagnostic.code !== 'store-refresh-failed'),
      {
        code: 'store-refresh-failed',
        message: 'Microsoft Store license refresh failed.',
        detail: message,
        recordedAt: checkedAt,
      },
    ],
  };
}

function createGenericUnavailableSnapshot<TSnapshot extends StoreLicenseSnapshot>(options: {
  error: unknown;
  checkedAt?: string;
  productConfig: StoreLicenseProductConfig;
  createSnapshot: (overrides: Partial<TSnapshot>) => TSnapshot;
}): TSnapshot {
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const message = options.error instanceof Error ? options.error.message : String(options.error);

  return options.createSnapshot({
    availability: 'store-unavailable',
    status: 'unknown',
    source: 'fallback',
    isStale: true,
    lastCheckedAt: checkedAt,
    diagnostics: [
      {
        code: 'store-unavailable',
        message: options.productConfig.unavailableMessage,
        detail: message,
        recordedAt: checkedAt,
      },
    ],
  } as Partial<TSnapshot>);
}

function buildGenericPurchaseMessage(
  productConfig: StoreLicenseProductConfig,
  outcome: StoreLicensePurchaseOutcome,
): string {
  switch (outcome) {
    case 'succeeded':
      return `Purchase completed and ${productConfig.statusLabel} was refreshed.`;
    case 'already-purchased':
      return `This Microsoft Store account already owns the ${productConfig.purchaseLabel}.`;
    case 'canceled':
      return 'Purchase was canceled before activation completed.';
    case 'not-purchased':
      return 'Purchase did not complete.';
    case 'network-error':
      return 'Microsoft Store purchase failed because of a network error.';
    case 'server-error':
      return 'Microsoft Store purchase failed because of a server error.';
    case 'not-supported':
      return 'Microsoft Store purchase is unavailable in this runtime.';
    default:
      return 'Microsoft Store purchase failed.';
  }
}

export function normalizeSubscriptionSnapshot(raw: RawStoreLicenseState): SubscriptionSnapshot {
  return normalizeStoreLicenseSnapshot({
    raw,
    productConfig: sponsorPlanProductConfig,
    createSnapshot: createDefaultSubscriptionSnapshot,
  });
}

export function normalizeTurboEngineLicenseSnapshot(raw: RawStoreLicenseState): TurboEngineLicenseSnapshot {
  return normalizeStoreLicenseSnapshot({
    raw,
    productConfig: turboEngineProductConfig,
    createSnapshot: createDefaultTurboEngineLicenseSnapshot,
  });
}

export function createStaleSnapshot(
  previousSnapshot: SubscriptionSnapshot,
  error: unknown,
  checkedAt?: string,
): SubscriptionSnapshot {
  return createGenericStaleSnapshot({ previousSnapshot, error, checkedAt });
}

export function createTurboEngineStaleSnapshot(
  previousSnapshot: TurboEngineLicenseSnapshot,
  error: unknown,
  checkedAt?: string,
): TurboEngineLicenseSnapshot {
  return createGenericStaleSnapshot({ previousSnapshot, error, checkedAt });
}

export function createUnavailableSnapshot(error: unknown, checkedAt?: string): SubscriptionSnapshot {
  return createGenericUnavailableSnapshot({
    error,
    checkedAt,
    productConfig: sponsorPlanProductConfig,
    createSnapshot: createDefaultSubscriptionSnapshot,
  });
}

export function createTurboEngineUnavailableSnapshot(error: unknown, checkedAt?: string): TurboEngineLicenseSnapshot {
  return createGenericUnavailableSnapshot({
    error,
    checkedAt,
    productConfig: turboEngineProductConfig,
    createSnapshot: createDefaultTurboEngineLicenseSnapshot,
  });
}

export function buildPurchaseMessage(outcome: SubscriptionPurchaseOutcome): string {
  return buildGenericPurchaseMessage(sponsorPlanProductConfig, outcome);
}

export function buildTurboEnginePurchaseMessage(outcome: StoreLicensePurchaseOutcome): string {
  return buildGenericPurchaseMessage(turboEngineProductConfig, outcome);
}

export function createPurchaseFailureResult(
  rawResult: RawStorePurchaseResult,
  snapshot: SubscriptionSnapshot,
): { outcome: SubscriptionPurchaseOutcome; message: string; snapshot: SubscriptionSnapshot } {
  return {
    outcome: rawResult.outcome as SubscriptionPurchaseOutcome,
    message: buildPurchaseMessage(rawResult.outcome as SubscriptionPurchaseOutcome),
    snapshot,
  };
}
