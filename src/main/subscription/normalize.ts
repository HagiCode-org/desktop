import {
  createDefaultSubscriptionSnapshot,
  HAGICODE_SPONSOR_PLAN_STORE_ID,
  type SubscriptionDiagnostic,
  type SubscriptionPurchaseOutcome,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
} from '../../types/subscription.js';
import type { RawStorePurchaseResult, RawStoreSubscriptionState } from './subscription-broker.js';

function toDiagnostics(raw: RawStoreSubscriptionState): SubscriptionDiagnostic[] {
  if (!raw.errorCode && !raw.errorMessage) {
    return [];
  }

  return [
    {
      code: raw.errorCode ?? 'store-query-failed',
      message: raw.errorMessage ?? 'Microsoft Store subscription query failed.',
      recordedAt: raw.fetchedAt,
    },
  ];
}

function deriveStatus(raw: RawStoreSubscriptionState): SubscriptionStatus {
  if (raw.availability !== 'supported') {
    return 'unknown';
  }

  const expirationDate = raw.license?.expirationDate ?? raw.sku?.collectionEndDate ?? null;
  const now = Date.now();
  const expirationTime = expirationDate ? Date.parse(expirationDate) : Number.NaN;
  const hasExpired = Number.isFinite(expirationTime) && expirationTime < now;
  const isActive = Boolean(raw.license?.isActive || raw.sku?.isInUserCollection);

  if (isActive && !hasExpired) {
    return 'active';
  }

  if (hasExpired) {
    return 'expired';
  }

  if (raw.purchaseEligibility === 'licensable') {
    return 'inactive';
  }

  if (raw.purchaseEligibility === 'not-licensable' && !isActive) {
    return 'canceled';
  }

  if (raw.purchaseEligibility === 'license-action-not-applicable') {
    return 'pending';
  }

  return isActive ? 'active' : 'inactive';
}

export function normalizeSubscriptionSnapshot(raw: RawStoreSubscriptionState): SubscriptionSnapshot {
  const status = deriveStatus(raw);
  const diagnostics = toDiagnostics(raw);

  return createDefaultSubscriptionSnapshot({
    planStoreId: raw.product?.storeId ?? HAGICODE_SPONSOR_PLAN_STORE_ID,
    availability: raw.availability,
    status,
    source: raw.availability === 'supported' ? 'store' : 'fallback',
    isStale: raw.availability !== 'supported',
    lastCheckedAt: raw.fetchedAt,
    lastSuccessfulSyncAt: raw.availability === 'supported' ? raw.fetchedAt : null,
    expirationDate: raw.license?.expirationDate ?? raw.sku?.collectionEndDate ?? null,
    renewalDate: raw.license?.expirationDate ?? raw.sku?.collectionEndDate ?? null,
    diagnostics,
  });
}

export function createStaleSnapshot(
  previousSnapshot: SubscriptionSnapshot,
  error: unknown,
  checkedAt: string = new Date().toISOString(),
): SubscriptionSnapshot {
  const message = error instanceof Error ? error.message : String(error);

  return {
    ...previousSnapshot,
    source: 'fallback',
    isStale: true,
    lastCheckedAt: checkedAt,
    diagnostics: [
      ...previousSnapshot.diagnostics.filter((diagnostic) => diagnostic.code !== 'store-refresh-failed'),
      {
        code: 'store-refresh-failed',
        message: 'Microsoft Store subscription refresh failed.',
        detail: message,
        recordedAt: checkedAt,
      },
    ],
  };
}

export function createUnavailableSnapshot(error: unknown, checkedAt: string = new Date().toISOString()): SubscriptionSnapshot {
  const message = error instanceof Error ? error.message : String(error);

  return createDefaultSubscriptionSnapshot({
    availability: 'store-unavailable',
    status: 'unknown',
    source: 'fallback',
    isStale: true,
    lastCheckedAt: checkedAt,
    diagnostics: [
      {
        code: 'store-unavailable',
        message: 'Microsoft Store subscription is unavailable in the current runtime.',
        detail: message,
        recordedAt: checkedAt,
      },
    ],
  });
}

export function buildPurchaseMessage(outcome: SubscriptionPurchaseOutcome): string {
  switch (outcome) {
    case 'succeeded':
      return 'Purchase completed and subscription status was refreshed.';
    case 'already-purchased':
      return 'This Microsoft Store account already owns the sponsor plan.';
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

export function createPurchaseFailureResult(
  rawResult: RawStorePurchaseResult,
  snapshot: SubscriptionSnapshot,
): { outcome: SubscriptionPurchaseOutcome; message: string; snapshot: SubscriptionSnapshot } {
  return {
    outcome: rawResult.outcome,
    message: buildPurchaseMessage(rawResult.outcome),
    snapshot,
  };
}
