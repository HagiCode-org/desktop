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
export const TURBOENGINE_DLC_PROGRAM_OPTION_SOURCE = 'desktop-msstore-license';

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

export interface TurboEngineDlcProgramOption {
  enabled: boolean | null;
  source: string | null;
}

export function createDefaultTurboEngineLicenseSnapshot(
  overrides: Partial<TurboEngineLicenseSnapshot> = {},
): TurboEngineLicenseSnapshot {
  return createDefaultStoreLicenseSnapshot(turboEngineProductConfig, overrides);
}

export function resolveTurboEngineDlcProgramOption(
  snapshot: TurboEngineLicenseSnapshot | null | undefined,
): TurboEngineDlcProgramOption {
  if (!snapshot) {
    return { enabled: null, source: null };
  }

  switch (snapshot.status) {
    case 'active':
      return {
        enabled: true,
        source: TURBOENGINE_DLC_PROGRAM_OPTION_SOURCE,
      };
    case 'inactive':
    case 'expired':
    case 'canceled':
    case 'pending':
      return {
        enabled: false,
        source: TURBOENGINE_DLC_PROGRAM_OPTION_SOURCE,
      };
    default:
      return { enabled: null, source: null };
  }
}

export {
  HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL,
};
