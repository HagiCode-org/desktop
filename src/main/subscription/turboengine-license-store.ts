import Store from 'electron-store';
import type { TurboEngineLicenseSnapshot } from '../../types/turboengine-license.js';
import { turboEngineProductConfig } from '../../types/turboengine-license.js';
import { StoreLicenseSnapshotStore } from './store-license-store.js';

interface TurboEngineStoreSchema {
  snapshot?: TurboEngineLicenseSnapshot;
}

export class TurboEngineLicenseSnapshotStore extends StoreLicenseSnapshotStore<TurboEngineLicenseSnapshot> {
  constructor(store?: Store<TurboEngineStoreSchema>) {
    super({ name: turboEngineProductConfig.snapshotStoreName }, store as never);
  }
}
