import { EventEmitter } from 'node:events';
import log from 'electron-log';
import type {
  StoreLicenseGetSnapshotOptions,
  StoreLicenseProductConfig,
  StoreLicensePurchaseOutcome,
  StoreLicensePurchaseResult,
  StoreLicenseSnapshot,
} from '../../types/store-license.js';
import type { RawStoreLicenseState, RawStorePurchaseResult, StoreLicensePlatformBroker } from './subscription-broker.js';

export type StoreLicenseRefreshReason = 'startup' | 'manual' | 'purchase' | 'scheduled';

export interface StoreLicenseRetryPolicy {
  maxAttempts: number;
  retryDelayMs: number;
}

interface StoreLicenseServiceOptions<
  TSnapshot extends StoreLicenseSnapshot<TEntitlement>,
  TEntitlement extends string,
> {
  productConfig: StoreLicenseProductConfig<TEntitlement>;
  broker: StoreLicensePlatformBroker;
  entitlementEvaluator: { evaluate(snapshot: TSnapshot): TEntitlement[] };
  createDefaultSnapshot: () => TSnapshot;
  normalizeSnapshot: (raw: RawStoreLicenseState) => TSnapshot;
  createStaleSnapshot: (previousSnapshot: TSnapshot, error: unknown) => TSnapshot;
  createUnavailableSnapshot: (error: unknown) => TSnapshot;
  buildPurchaseMessage: (outcome: StoreLicensePurchaseOutcome) => string;
  retryPolicy?: Partial<StoreLicenseRetryPolicy>;
}

const defaultRetryPolicy: StoreLicenseRetryPolicy = {
  maxAttempts: 3,
  retryDelayMs: 350,
};

export class StoreLicenseService<
  TSnapshot extends StoreLicenseSnapshot<TEntitlement>,
  TEntitlement extends string,
> {
  private readonly productConfig: StoreLicenseProductConfig<TEntitlement>;
  private readonly broker: StoreLicensePlatformBroker;
  private readonly entitlementEvaluator: { evaluate(snapshot: TSnapshot): TEntitlement[] };
  private readonly createDefaultSnapshot: () => TSnapshot;
  private readonly normalizeSnapshot: (raw: RawStoreLicenseState) => TSnapshot;
  private readonly createStaleSnapshot: (previousSnapshot: TSnapshot, error: unknown) => TSnapshot;
  private readonly createUnavailableSnapshot: (error: unknown) => TSnapshot;
  private readonly buildPurchaseMessage: (outcome: StoreLicensePurchaseOutcome) => string;
  private readonly retryPolicy: StoreLicenseRetryPolicy;
  private readonly events = new EventEmitter();
  private currentSnapshot: TSnapshot;
  private refreshInFlight: Promise<TSnapshot> | null = null;

  constructor(options: StoreLicenseServiceOptions<TSnapshot, TEntitlement>) {
    this.productConfig = options.productConfig;
    this.broker = options.broker;
    this.entitlementEvaluator = options.entitlementEvaluator;
    this.createDefaultSnapshot = options.createDefaultSnapshot;
    this.normalizeSnapshot = options.normalizeSnapshot;
    this.createStaleSnapshot = options.createStaleSnapshot;
    this.createUnavailableSnapshot = options.createUnavailableSnapshot;
    this.buildPurchaseMessage = options.buildPurchaseMessage;
    this.retryPolicy = {
      maxAttempts: Math.max(1, Math.trunc(options.retryPolicy?.maxAttempts ?? defaultRetryPolicy.maxAttempts)),
      retryDelayMs: Math.max(0, Math.trunc(options.retryPolicy?.retryDelayMs ?? defaultRetryPolicy.retryDelayMs)),
    };

    this.currentSnapshot = this.withEntitlements(this.createDefaultSnapshot());
  }

  getCurrentSnapshot(): TSnapshot {
    return this.currentSnapshot;
  }

  async getSnapshot(_options: StoreLicenseGetSnapshotOptions = {}): Promise<TSnapshot> {
    return this.currentSnapshot;
  }

  async refresh(reason: StoreLicenseRefreshReason): Promise<TSnapshot> {
    if (this.refreshInFlight) {
      log.info('[StoreLicenseService] Reusing in-flight refresh.', {
        productKey: this.productConfig.key,
        reason,
      });
      return this.refreshInFlight;
    }

    log.info('[StoreLicenseService] Starting refresh.', {
      productKey: this.productConfig.key,
      reason,
      currentAvailability: this.currentSnapshot.availability,
      currentStatus: this.currentSnapshot.status,
      currentIsStale: this.currentSnapshot.isStale,
      currentLastCheckedAt: this.currentSnapshot.lastCheckedAt,
    });

    this.refreshInFlight = (async () => {
      const recoverySnapshot = this.getRecoverySnapshot();

      try {
        const refreshedSnapshot = await this.querySnapshotWithTolerance(reason, recoverySnapshot);

        log.info('[StoreLicenseService] Refresh completed.', {
          productKey: this.productConfig.key,
          reason,
          availability: refreshedSnapshot.availability,
          status: refreshedSnapshot.status,
          source: refreshedSnapshot.source,
          isStale: refreshedSnapshot.isStale,
          lastCheckedAt: refreshedSnapshot.lastCheckedAt,
          lastSuccessfulSyncAt: refreshedSnapshot.lastSuccessfulSyncAt,
          diagnostics: refreshedSnapshot.diagnostics.map((diagnostic) => diagnostic.code),
        });
        this.setCurrentSnapshot(refreshedSnapshot);
        return refreshedSnapshot;
      } catch (error) {
        const fallbackSnapshot = recoverySnapshot
          ? this.withEntitlements(this.createStaleSnapshot(recoverySnapshot, error))
          : this.withEntitlements(this.createUnavailableSnapshot(error));

        log.warn('[StoreLicenseService] Refresh failed, using fallback snapshot.', {
          productKey: this.productConfig.key,
          reason,
          error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
          fallbackAvailability: fallbackSnapshot.availability,
          fallbackStatus: fallbackSnapshot.status,
          fallbackSource: fallbackSnapshot.source,
          fallbackIsStale: fallbackSnapshot.isStale,
          fallbackDiagnostics: fallbackSnapshot.diagnostics.map((diagnostic) => diagnostic.code),
        });
        this.setCurrentSnapshot(fallbackSnapshot);
        return fallbackSnapshot;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  async refreshOnStartup(): Promise<TSnapshot> {
    return this.refresh('startup');
  }

  async verifyOnStartup(): Promise<TSnapshot> {
    return this.refreshOnStartup();
  }

  async purchase(): Promise<StoreLicensePurchaseResult<TSnapshot>> {
    return this.completePurchase(await this.broker.purchase());
  }

  async completePurchase(purchaseResult: RawStorePurchaseResult): Promise<StoreLicensePurchaseResult<TSnapshot>> {
    log.info('[StoreLicenseService] Purchase completed.', {
      productKey: this.productConfig.key,
      outcome: purchaseResult.outcome,
      errorCode: purchaseResult.errorCode,
      errorMessage: purchaseResult.errorMessage,
    });

    if (purchaseResult.outcome === 'not-supported') {
      return {
        outcome: purchaseResult.outcome,
        message: this.buildPurchaseMessage(purchaseResult.outcome),
        snapshot: this.currentSnapshot,
      };
    }

    const snapshot = purchaseResult.outcome === 'canceled' || purchaseResult.outcome === 'not-purchased'
      ? this.currentSnapshot
      : await this.refresh('purchase');

    if (purchaseResult.outcome === 'failed' || purchaseResult.outcome === 'network-error' || purchaseResult.outcome === 'server-error') {
      return {
        outcome: purchaseResult.outcome,
        message: purchaseResult.errorMessage ?? this.buildPurchaseMessage(purchaseResult.outcome),
        snapshot,
      };
    }

    return {
      outcome: purchaseResult.outcome,
      message: this.buildPurchaseMessage(purchaseResult.outcome),
      snapshot,
    };
  }

  onDidChange(listener: (snapshot: TSnapshot) => void): () => void {
    this.events.on('changed', listener);
    return () => {
      this.events.off('changed', listener);
    };
  }

  dispose(): void {
    this.events.removeAllListeners();
    this.broker.dispose();
  }

  private setCurrentSnapshot(snapshot: TSnapshot): void {
    this.currentSnapshot = snapshot;
    this.events.emit('changed', snapshot);
  }

  private withEntitlements(snapshot: TSnapshot): TSnapshot {
    return {
      ...snapshot,
      entitlements: this.entitlementEvaluator.evaluate(snapshot),
    };
  }

  private async querySnapshotWithTolerance(
    reason: StoreLicenseRefreshReason,
    recoverySnapshot: TSnapshot | null,
  ): Promise<TSnapshot> {
    let lastKnownIssue: unknown = null;

    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt += 1) {
      try {
        const rawSnapshot = await this.broker.queryStatus();
        const normalizedSnapshot = this.withEntitlements(this.normalizeSnapshot(rawSnapshot));
        const retryReason = this.getRetryReason(normalizedSnapshot, recoverySnapshot);

        if (retryReason && attempt < this.retryPolicy.maxAttempts) {
          lastKnownIssue = this.createRetryError(normalizedSnapshot, retryReason);
          log.warn('[StoreLicenseService] Refresh returned a transient snapshot; retrying.', {
            productKey: this.productConfig.key,
            reason,
            attempt,
            maxAttempts: this.retryPolicy.maxAttempts,
            retryReason,
            availability: normalizedSnapshot.availability,
            status: normalizedSnapshot.status,
            isStale: normalizedSnapshot.isStale,
          });
          await this.delayBeforeRetry();
          continue;
        }

        if (normalizedSnapshot.availability !== 'supported' && recoverySnapshot) {
          throw this.createRetryError(normalizedSnapshot, retryReason ?? 'store-unavailable');
        }

        return normalizedSnapshot;
      } catch (error) {
        lastKnownIssue = error;

        if (attempt < this.retryPolicy.maxAttempts) {
          log.warn('[StoreLicenseService] Refresh attempt failed; retrying.', {
            productKey: this.productConfig.key,
            reason,
            attempt,
            maxAttempts: this.retryPolicy.maxAttempts,
            error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
          });
          await this.delayBeforeRetry();
          continue;
        }
      }
    }

    throw lastKnownIssue ?? new Error('Microsoft Store refresh failed.');
  }

  private getRetryReason(snapshot: TSnapshot, recoverySnapshot: TSnapshot | null): 'store-unavailable' | 'status-regression' | null {
    if (snapshot.availability !== 'supported') {
      return 'store-unavailable';
    }

    if (recoverySnapshot?.status === 'active' && snapshot.status !== 'active') {
      return 'status-regression';
    }

    return null;
  }

  private createRetryError(snapshot: TSnapshot, retryReason: 'store-unavailable' | 'status-regression'): Error {
    const primaryDiagnostic = snapshot.diagnostics[0];
    const detail = primaryDiagnostic?.detail ?? primaryDiagnostic?.message;
    const summary = retryReason === 'status-regression'
      ? `Microsoft Store refresh temporarily regressed ${this.productConfig.statusLabel}.`
      : `Microsoft Store refresh reported ${snapshot.availability}.`;

    return new Error(detail ? `${summary} ${detail}` : summary);
  }

  private getRecoverySnapshot(): TSnapshot | null {
    if (this.currentSnapshot.lastSuccessfulSyncAt || this.currentSnapshot.availability === 'supported') {
      return this.currentSnapshot;
    }

    return null;
  }

  private async delayBeforeRetry(): Promise<void> {
    if (this.retryPolicy.retryDelayMs <= 0) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, this.retryPolicy.retryDelayMs);
    });
  }
}
