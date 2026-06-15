import Store from 'electron-store';
import type { SubscriptionSnapshot } from '../../types/subscription.js';
import { sponsorPlanProductConfig } from '../../types/subscription.js';
import { StoreLicenseSnapshotStore } from './store-license-store.js';

interface SubscriptionStoreSchema {
  snapshot?: SubscriptionSnapshot;
}

export class SubscriptionSnapshotStore extends StoreLicenseSnapshotStore<SubscriptionSnapshot> {
  constructor(store?: Store<SubscriptionStoreSchema>) {
    super({ name: sponsorPlanProductConfig.snapshotStoreName }, store as never);
  }
}
