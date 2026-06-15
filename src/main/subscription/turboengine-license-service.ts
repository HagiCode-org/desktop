import type {
  TurboEngineEntitlementName,
  TurboEngineLicensePurchaseResult,
  TurboEngineLicenseSnapshot,
} from '../../types/turboengine-license.js';
import {
  createDefaultTurboEngineLicenseSnapshot,
  turboEngineProductConfig,
} from '../../types/turboengine-license.js';
import type { RawStorePurchaseResult, SubscriptionPlatformBroker } from './subscription-broker.js';
import {
  buildTurboEnginePurchaseMessage,
  createTurboEngineStaleSnapshot,
  createTurboEngineUnavailableSnapshot,
  normalizeTurboEngineLicenseSnapshot,
} from './normalize.js';
import {
  StoreLicenseService,
  type StoreLicenseRefreshReason,
  type StoreLicenseRetryPolicy,
} from './store-license-service.js';
import type { TurboEngineEntitlementEvaluator } from './turboengine-entitlement-evaluator.js';

export type TurboEngineLicenseRefreshReason = StoreLicenseRefreshReason;

interface TurboEngineLicenseServiceOptions {
  broker: SubscriptionPlatformBroker;
  entitlementEvaluator: TurboEngineEntitlementEvaluator;
  retryPolicy?: Partial<StoreLicenseRetryPolicy>;
}

export class TurboEngineLicenseService {
  private readonly service: StoreLicenseService<TurboEngineLicenseSnapshot, TurboEngineEntitlementName>;

  constructor(options: TurboEngineLicenseServiceOptions) {
    this.service = new StoreLicenseService<TurboEngineLicenseSnapshot, TurboEngineEntitlementName>({
      productConfig: turboEngineProductConfig,
      broker: options.broker,
      entitlementEvaluator: options.entitlementEvaluator,
      createDefaultSnapshot: createDefaultTurboEngineLicenseSnapshot,
      normalizeSnapshot: normalizeTurboEngineLicenseSnapshot,
      createStaleSnapshot: createTurboEngineStaleSnapshot,
      createUnavailableSnapshot: createTurboEngineUnavailableSnapshot,
      buildPurchaseMessage: buildTurboEnginePurchaseMessage,
      retryPolicy: options.retryPolicy,
    });
  }

  getCurrentSnapshot(): TurboEngineLicenseSnapshot {
    return this.service.getCurrentSnapshot();
  }

  async getSnapshot(): Promise<TurboEngineLicenseSnapshot> {
    return this.service.getSnapshot();
  }

  async refresh(reason: TurboEngineLicenseRefreshReason): Promise<TurboEngineLicenseSnapshot> {
    return this.service.refresh(reason);
  }

  async refreshOnStartup(): Promise<TurboEngineLicenseSnapshot> {
    return this.service.refreshOnStartup();
  }

  async verifyOnStartup(): Promise<TurboEngineLicenseSnapshot> {
    return this.service.verifyOnStartup();
  }

  async purchase(): Promise<TurboEngineLicensePurchaseResult> {
    return this.service.purchase();
  }

  async completePurchase(purchaseResult: RawStorePurchaseResult): Promise<TurboEngineLicensePurchaseResult> {
    return this.service.completePurchase(purchaseResult);
  }

  onDidChange(listener: (snapshot: TurboEngineLicenseSnapshot) => void): () => void {
    return this.service.onDidChange(listener);
  }

  dispose(): void {
    this.service.dispose();
  }
}
