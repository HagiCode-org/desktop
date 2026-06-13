import Store from 'electron-store';
import type { SubscriptionSnapshot } from '../../types/subscription.js';

interface SubscriptionStoreSchema {
  snapshot?: SubscriptionSnapshot;
}

export class SubscriptionSnapshotStore {
  private readonly store: Store<SubscriptionStoreSchema>;

  constructor(store?: Store<SubscriptionStoreSchema>) {
    this.store = store ?? new Store<SubscriptionStoreSchema>({
      name: 'hagicode-desktop-subscription',
    });
  }

  load(): SubscriptionSnapshot | null {
    return this.store.get('snapshot') ?? null;
  }

  save(snapshot: SubscriptionSnapshot): SubscriptionSnapshot {
    this.store.set('snapshot', snapshot);
    return snapshot;
  }
}
