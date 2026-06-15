import type {
  SubscriptionGetSnapshotOptions,
  SubscriptionPurchaseResult,
  SubscriptionEntitlementName,
  SubscriptionSnapshot,
} from '../../types/subscription.js';
import {
  createDefaultSubscriptionSnapshot,
  sponsorPlanProductConfig,
} from '../../types/subscription.js';
import { EntitlementEvaluator } from './entitlement-evaluator.js';
import type { RawStorePurchaseResult, SubscriptionPlatformBroker } from './subscription-broker.js';
import { buildPurchaseMessage, createStaleSnapshot, createUnavailableSnapshot, normalizeSubscriptionSnapshot } from './normalize.js';
import { StoreLicenseService, type StoreLicenseRefreshReason } from './store-license-service.js';
import { SubscriptionSnapshotStore } from './subscription-store.js';

export type SubscriptionRefreshReason = StoreLicenseRefreshReason;

interface SubscriptionServiceOptions {
  broker: SubscriptionPlatformBroker;
  snapshotStore: SubscriptionSnapshotStore;
  entitlementEvaluator: EntitlementEvaluator;
}

export class SubscriptionService {
  private readonly service: StoreLicenseService<SubscriptionSnapshot, SubscriptionEntitlementName>;

  constructor(options: SubscriptionServiceOptions) {
    this.service = new StoreLicenseService<SubscriptionSnapshot, SubscriptionEntitlementName>({
      productConfig: sponsorPlanProductConfig,
      broker: options.broker,
      snapshotStore: options.snapshotStore,
      entitlementEvaluator: options.entitlementEvaluator,
      createDefaultSnapshot: createDefaultSubscriptionSnapshot,
      normalizeSnapshot: normalizeSubscriptionSnapshot,
      createStaleSnapshot,
      createUnavailableSnapshot,
      buildPurchaseMessage,
    });
  }

  getCachedSnapshot(): SubscriptionSnapshot {
    return this.service.getCachedSnapshot();
  }

  async getSnapshot(options: SubscriptionGetSnapshotOptions = {}): Promise<SubscriptionSnapshot> {
    return this.service.getSnapshot(options);
  }

  async refresh(reason: SubscriptionRefreshReason): Promise<SubscriptionSnapshot> {
    return this.service.refresh(reason);
  }

  async refreshOnStartup(): Promise<SubscriptionSnapshot> {
    return this.service.refreshOnStartup();
  }

  async purchase(): Promise<SubscriptionPurchaseResult> {
    return this.service.purchase();
  }

  async completePurchase(purchaseResult: RawStorePurchaseResult): Promise<SubscriptionPurchaseResult> {
    return this.service.completePurchase(purchaseResult);
  }

  onDidChange(listener: (snapshot: SubscriptionSnapshot) => void): () => void {
    return this.service.onDidChange(listener);
  }

  dispose(): void {
    this.service.dispose();
  }
}
