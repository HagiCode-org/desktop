import type {
  SubscriptionGetSnapshotOptions,
  SubscriptionPurchaseResult,
  SubscriptionEntitlementName,
  SubscriptionSnapshot,
} from '../../types/subscription.js';
import type { StoreLicenseProductConfig } from '../../types/store-license.js';
import {
  createDefaultSubscriptionSnapshot,
  sponsorPlanProductConfig,
} from '../../types/subscription.js';
import { EntitlementEvaluator } from './entitlement-evaluator.js';
import type { RawStorePurchaseResult, SubscriptionPlatformBroker } from './subscription-broker.js';
import { buildPurchaseMessage, createStaleSnapshot, createUnavailableSnapshot, normalizeSubscriptionSnapshot } from './normalize.js';
import {
  StoreLicenseService,
  type StoreLicenseRefreshReason,
  type StoreLicenseRetryPolicy,
} from './store-license-service.js';

export type SubscriptionRefreshReason = StoreLicenseRefreshReason;

interface SubscriptionServiceOptions {
  broker: SubscriptionPlatformBroker;
  entitlementEvaluator: EntitlementEvaluator;
  retryPolicy?: Partial<StoreLicenseRetryPolicy>;
  /** Defaults to sponsor plan; tip / other products must pass their own config. */
  productConfig?: StoreLicenseProductConfig<SubscriptionEntitlementName>;
}

export class SubscriptionService {
  private readonly service: StoreLicenseService<SubscriptionSnapshot, SubscriptionEntitlementName>;

  constructor(options: SubscriptionServiceOptions) {
    this.service = new StoreLicenseService<SubscriptionSnapshot, SubscriptionEntitlementName>({
      productConfig: options.productConfig ?? sponsorPlanProductConfig,
      broker: options.broker,
      entitlementEvaluator: options.entitlementEvaluator,
      createDefaultSnapshot: createDefaultSubscriptionSnapshot,
      normalizeSnapshot: normalizeSubscriptionSnapshot,
      createStaleSnapshot,
      createUnavailableSnapshot,
      buildPurchaseMessage,
      retryPolicy: options.retryPolicy,
    });
  }

  getCurrentSnapshot(): SubscriptionSnapshot {
    return this.service.getCurrentSnapshot();
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

  async verifyOnStartup(): Promise<SubscriptionSnapshot> {
    return this.service.verifyOnStartup();
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
