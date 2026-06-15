import {
  createDefaultStoreLicenseSnapshot,
  type StoreLicenseBridge,
  type StoreLicenseGetSnapshotOptions,
  type StoreLicenseProductConfig,
  type StoreLicensePurchaseResult,
  type StoreLicenseSnapshot,
  HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL,
} from './store-license.js';

export const HAGICODE_TURBOENGINE_STORE_ID = '9NSD809W18Z6';
export const HAGICODE_TURBOENGINE_PRODUCT_ID = 'Hagicode.TurboEngine';
export const HAGICODE_TURBOENGINE_STORE_WEB_URL = `https://apps.microsoft.com/detail/${HAGICODE_TURBOENGINE_STORE_ID}`;

export const turboEngineEntitlementNames = [
  'turboEngineAccess',
] as const;

export type TurboEngineEntitlementName = (typeof turboEngineEntitlementNames)[number];

export const turboEngineChannels = {
  getSnapshot: 'turboengine-license:get-snapshot',
  verifyStartup: 'turboengine-license:verify-startup',
  refresh: 'turboengine-license:refresh',
  purchase: 'turboengine-license:purchase',
  changed: 'turboengine-license:changed',
} as const;

export const turboEngineProductConfig: StoreLicenseProductConfig<TurboEngineEntitlementName> = {
  key: 'turboengine',
  storeId: HAGICODE_TURBOENGINE_STORE_ID,
  productId: HAGICODE_TURBOENGINE_PRODUCT_ID,
  productName: 'TurboEngine',
  storeWebUrl: HAGICODE_TURBOENGINE_STORE_WEB_URL,
  licenseKind: 'perpetual',
  snapshotStoreName: 'hagicode-desktop-turboengine-license',
  entitlementNames: turboEngineEntitlementNames,
  purchaseLabel: 'TurboEngine license',
  statusLabel: 'TurboEngine license status',
  unavailableMessage: 'Microsoft Store TurboEngine license is unavailable in the current runtime.',
};

export interface TurboEngineLicenseSnapshot extends StoreLicenseSnapshot<TurboEngineEntitlementName> {}

export interface TurboEngineLicensePurchaseResult extends StoreLicensePurchaseResult<TurboEngineLicenseSnapshot> {}

export interface TurboEngineLicenseBridge extends StoreLicenseBridge<
  TurboEngineLicenseSnapshot,
  TurboEngineLicensePurchaseResult
> {
  verifyStartup: () => Promise<TurboEngineLicenseSnapshot>;
}

export type TurboEngineLicenseGetSnapshotOptions = StoreLicenseGetSnapshotOptions;

export function createDefaultTurboEngineLicenseSnapshot(
  overrides: Partial<TurboEngineLicenseSnapshot> = {},
): TurboEngineLicenseSnapshot {
  return createDefaultStoreLicenseSnapshot(turboEngineProductConfig, overrides);
}

export {
  HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL,
};
