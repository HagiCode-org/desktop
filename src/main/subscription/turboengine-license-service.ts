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
import { StoreLicenseService, type StoreLicenseRefreshReason } from './store-license-service.js';
import type { TurboEngineEntitlementEvaluator } from './turboengine-entitlement-evaluator.js';
import type { TurboEngineLicenseSnapshotStore } from './turboengine-license-store.js';

export type TurboEngineLicenseRefreshReason = StoreLicenseRefreshReason;

interface TurboEngineLicenseServiceOptions {
  broker: SubscriptionPlatformBroker;
  snapshotStore: TurboEngineLicenseSnapshotStore;
  entitlementEvaluator: TurboEngineEntitlementEvaluator;
}

export class TurboEngineLicenseService {
  private readonly service: StoreLicenseService<TurboEngineLicenseSnapshot, TurboEngineEntitlementName>;

  constructor(options: TurboEngineLicenseServiceOptions) {
    this.service = new StoreLicenseService<TurboEngineLicenseSnapshot, TurboEngineEntitlementName>({
      productConfig: turboEngineProductConfig,
      broker: options.broker,
      snapshotStore: options.snapshotStore,
      entitlementEvaluator: options.entitlementEvaluator,
      createDefaultSnapshot: createDefaultTurboEngineLicenseSnapshot,
      normalizeSnapshot: normalizeTurboEngineLicenseSnapshot,
      createStaleSnapshot: createTurboEngineStaleSnapshot,
      createUnavailableSnapshot: createTurboEngineUnavailableSnapshot,
      buildPurchaseMessage: buildTurboEnginePurchaseMessage,
    });
  }

  getCachedSnapshot(): TurboEngineLicenseSnapshot {
    return this.service.getCachedSnapshot();
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
