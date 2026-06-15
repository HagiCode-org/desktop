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
import type { StoreLicenseSnapshotStore } from './store-license-store.js';

export type StoreLicenseRefreshReason = 'startup' | 'manual' | 'purchase' | 'scheduled';

interface StoreLicenseServiceOptions<
  TSnapshot extends StoreLicenseSnapshot<TEntitlement>,
  TEntitlement extends string,
> {
  productConfig: StoreLicenseProductConfig<TEntitlement>;
  broker: StoreLicensePlatformBroker;
  snapshotStore: StoreLicenseSnapshotStore<TSnapshot>;
  entitlementEvaluator: { evaluate(snapshot: TSnapshot): TEntitlement[] };
  createDefaultSnapshot: () => TSnapshot;
  normalizeSnapshot: (raw: RawStoreLicenseState) => TSnapshot;
  createStaleSnapshot: (previousSnapshot: TSnapshot, error: unknown) => TSnapshot;
  createUnavailableSnapshot: (error: unknown) => TSnapshot;
  buildPurchaseMessage: (outcome: StoreLicensePurchaseOutcome) => string;
}

export class StoreLicenseService<
  TSnapshot extends StoreLicenseSnapshot<TEntitlement>,
  TEntitlement extends string,
> {
  private readonly productConfig: StoreLicenseProductConfig<TEntitlement>;
  private readonly broker: StoreLicensePlatformBroker;
  private readonly snapshotStore: StoreLicenseSnapshotStore<TSnapshot>;
  private readonly entitlementEvaluator: { evaluate(snapshot: TSnapshot): TEntitlement[] };
  private readonly createDefaultSnapshot: () => TSnapshot;
  private readonly normalizeSnapshot: (raw: RawStoreLicenseState) => TSnapshot;
  private readonly createStaleSnapshot: (previousSnapshot: TSnapshot, error: unknown) => TSnapshot;
  private readonly createUnavailableSnapshot: (error: unknown) => TSnapshot;
  private readonly buildPurchaseMessage: (outcome: StoreLicensePurchaseOutcome) => string;
  private readonly events = new EventEmitter();
  private currentSnapshot: TSnapshot;
  private refreshInFlight: Promise<TSnapshot> | null = null;

  constructor(options: StoreLicenseServiceOptions<TSnapshot, TEntitlement>) {
    this.productConfig = options.productConfig;
    this.broker = options.broker;
    this.snapshotStore = options.snapshotStore;
    this.entitlementEvaluator = options.entitlementEvaluator;
    this.createDefaultSnapshot = options.createDefaultSnapshot;
    this.normalizeSnapshot = options.normalizeSnapshot;
    this.createStaleSnapshot = options.createStaleSnapshot;
    this.createUnavailableSnapshot = options.createUnavailableSnapshot;
    this.buildPurchaseMessage = options.buildPurchaseMessage;

    const cachedSnapshot = this.snapshotStore.load();
    this.currentSnapshot = this.withEntitlements(cachedSnapshot ?? this.createDefaultSnapshot());
  }

  getCachedSnapshot(): TSnapshot {
    return this.currentSnapshot;
  }

  async getSnapshot(options: StoreLicenseGetSnapshotOptions = {}): Promise<TSnapshot> {
    if (options.refreshIfStale && this.currentSnapshot.isStale) {
      log.info('[StoreLicenseService] Cached snapshot is stale, scheduling refresh.', {
        productKey: this.productConfig.key,
        lastCheckedAt: this.currentSnapshot.lastCheckedAt,
        availability: this.currentSnapshot.availability,
        status: this.currentSnapshot.status,
      });
      void this.refresh('manual');
    }

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
      cachedAvailability: this.currentSnapshot.availability,
      cachedStatus: this.currentSnapshot.status,
      cachedIsStale: this.currentSnapshot.isStale,
      cachedLastCheckedAt: this.currentSnapshot.lastCheckedAt,
    });

    this.refreshInFlight = (async () => {
      try {
        const rawSnapshot = await this.broker.queryStatus();
        const normalizedSnapshot = this.withEntitlements(this.normalizeSnapshot(rawSnapshot));
        const persistedSnapshot = normalizedSnapshot.availability === 'supported'
          ? this.snapshotStore.save(normalizedSnapshot)
          : normalizedSnapshot;

        log.info('[StoreLicenseService] Refresh completed.', {
          productKey: this.productConfig.key,
          reason,
          availability: persistedSnapshot.availability,
          status: persistedSnapshot.status,
          source: persistedSnapshot.source,
          isStale: persistedSnapshot.isStale,
          lastCheckedAt: persistedSnapshot.lastCheckedAt,
          lastSuccessfulSyncAt: persistedSnapshot.lastSuccessfulSyncAt,
          diagnostics: persistedSnapshot.diagnostics.map((diagnostic) => diagnostic.code),
        });
        this.setCurrentSnapshot(persistedSnapshot);
        return persistedSnapshot;
      } catch (error) {
        const cachedSnapshot = this.snapshotStore.load();
        const fallbackSnapshot = cachedSnapshot
          ? this.withEntitlements(this.createStaleSnapshot(cachedSnapshot, error))
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

    const snapshot = purchaseResult.outcome === 'canceled'
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
}
