import Store from 'electron-store';
import type { StoreLicenseSnapshot } from '../../types/store-license.js';

interface StoreLicenseStoreSchema<TSnapshot extends StoreLicenseSnapshot = StoreLicenseSnapshot> {
  snapshot?: TSnapshot;
}

export class StoreLicenseSnapshotStore<TSnapshot extends StoreLicenseSnapshot = StoreLicenseSnapshot> {
  private readonly store: Store<StoreLicenseStoreSchema<TSnapshot>>;

  constructor(options: { name: string }, store?: Store<StoreLicenseStoreSchema<TSnapshot>>) {
    this.store = store ?? new Store<StoreLicenseStoreSchema<TSnapshot>>({
      name: options.name,
    });
  }

  load(): TSnapshot | null {
    return this.store.get('snapshot') ?? null;
  }

  save(snapshot: TSnapshot): TSnapshot {
    this.store.set('snapshot', snapshot);
    return snapshot;
  }
}
