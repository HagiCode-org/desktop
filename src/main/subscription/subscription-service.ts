import { EventEmitter } from 'node:events';
import type {
  SubscriptionGetSnapshotOptions,
  SubscriptionPurchaseResult,
  SubscriptionSnapshot,
} from '../../types/subscription.js';
import { createDefaultSubscriptionSnapshot } from '../../types/subscription.js';
import { EntitlementEvaluator } from './entitlement-evaluator.js';
import type { SubscriptionPlatformBroker } from './subscription-broker.js';
import { buildPurchaseMessage, createStaleSnapshot, createUnavailableSnapshot, normalizeSubscriptionSnapshot } from './normalize.js';
import { SubscriptionSnapshotStore } from './subscription-store.js';

export type SubscriptionRefreshReason = 'startup' | 'manual' | 'purchase' | 'scheduled';

interface SubscriptionServiceOptions {
  broker: SubscriptionPlatformBroker;
  snapshotStore: SubscriptionSnapshotStore;
  entitlementEvaluator: EntitlementEvaluator;
}

export class SubscriptionService {
  private readonly broker: SubscriptionPlatformBroker;
  private readonly snapshotStore: SubscriptionSnapshotStore;
  private readonly entitlementEvaluator: EntitlementEvaluator;
  private readonly events = new EventEmitter();
  private currentSnapshot: SubscriptionSnapshot;
  private refreshInFlight: Promise<SubscriptionSnapshot> | null = null;

  constructor(options: SubscriptionServiceOptions) {
    this.broker = options.broker;
    this.snapshotStore = options.snapshotStore;
    this.entitlementEvaluator = options.entitlementEvaluator;

    const cachedSnapshot = this.snapshotStore.load();
    this.currentSnapshot = cachedSnapshot ?? createDefaultSubscriptionSnapshot();
    this.currentSnapshot = this.withEntitlements(this.currentSnapshot);
  }

  getCachedSnapshot(): SubscriptionSnapshot {
    return this.currentSnapshot;
  }

  async getSnapshot(options: SubscriptionGetSnapshotOptions = {}): Promise<SubscriptionSnapshot> {
    if (options.refreshIfStale && this.currentSnapshot.isStale) {
      void this.refresh('manual');
    }

    return this.currentSnapshot;
  }

  async refresh(reason: SubscriptionRefreshReason): Promise<SubscriptionSnapshot> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = (async () => {
      try {
        const rawSnapshot = await this.broker.queryStatus();
        const normalizedSnapshot = this.withEntitlements(normalizeSubscriptionSnapshot(rawSnapshot));
        const persistedSnapshot = normalizedSnapshot.availability === 'supported'
          ? this.snapshotStore.save(normalizedSnapshot)
          : normalizedSnapshot;

        this.setCurrentSnapshot(persistedSnapshot);
        return persistedSnapshot;
      } catch (error) {
        const fallbackSnapshot = this.snapshotStore.load()
          ? this.withEntitlements(createStaleSnapshot(this.snapshotStore.load()!, error))
          : this.withEntitlements(createUnavailableSnapshot(error));

        this.setCurrentSnapshot(fallbackSnapshot);
        return fallbackSnapshot;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  async refreshOnStartup(): Promise<SubscriptionSnapshot> {
    return this.refresh('startup');
  }

  async purchase(): Promise<SubscriptionPurchaseResult> {
    const purchaseResult = await this.broker.purchase();

    if (purchaseResult.outcome === 'not-supported') {
      return {
        outcome: purchaseResult.outcome,
        message: buildPurchaseMessage(purchaseResult.outcome),
        snapshot: this.currentSnapshot,
      };
    }

    const snapshot = purchaseResult.outcome === 'canceled'
      ? this.currentSnapshot
      : await this.refresh('purchase');

    if (purchaseResult.outcome === 'failed' || purchaseResult.outcome === 'network-error' || purchaseResult.outcome === 'server-error') {
      return {
        outcome: purchaseResult.outcome,
        message: purchaseResult.errorMessage ?? buildPurchaseMessage(purchaseResult.outcome),
        snapshot,
      };
    }

    return {
      outcome: purchaseResult.outcome,
      message: buildPurchaseMessage(purchaseResult.outcome),
      snapshot,
    };
  }

  onDidChange(listener: (snapshot: SubscriptionSnapshot) => void): () => void {
    this.events.on('changed', listener);
    return () => {
      this.events.off('changed', listener);
    };
  }

  dispose(): void {
    this.events.removeAllListeners();
    this.broker.dispose();
  }

  private setCurrentSnapshot(snapshot: SubscriptionSnapshot): void {
    this.currentSnapshot = snapshot;
    this.events.emit('changed', snapshot);
  }

  private withEntitlements(snapshot: SubscriptionSnapshot): SubscriptionSnapshot {
    return {
      ...snapshot,
      entitlements: this.entitlementEvaluator.evaluate(snapshot),
    };
  }
}
