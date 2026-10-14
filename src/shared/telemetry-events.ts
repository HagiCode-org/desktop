import type { PackageSourceType } from '../main/package-sources/package-source.js';
import type { ViewType } from '../renderer/store/slices/viewSlice.js';
import type { ServiceRegion } from '../types/service-region.js';
import { MSSTORE_DONATION_TIP_TIER_IDS } from '../types/msstore-donation-item.js';
import type { VersionDownloadMode } from '../types/version-download.js';
import { SUPPORTED_DESKTOP_LANGUAGE_CODES } from './desktop-languages.js';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_COUNT = 1000;

export const TELEMETRY_VIEW_IDS = [
  'system',
  'web',
  'version',
  'diagnostic',
  'dependency-management',
  'settings',
  'subscription',
  'turboengine',
] as const;
export type TelemetryViewIdsMatchViewType = Assert<Equals<(typeof TELEMETRY_VIEW_IDS)[number], ViewType>>;

const TELEMETRY_PREVIOUS_VIEW_IDS = [...TELEMETRY_VIEW_IDS, 'none'] as const;

export const TELEMETRY_SERVICE_REGIONS = ['CN', 'INTERNATIONAL'] as const;
export type TelemetryServiceRegionsMatchServiceRegion = Assert<Equals<(typeof TELEMETRY_SERVICE_REGIONS)[number], ServiceRegion>>;

export const TELEMETRY_PACKAGE_SOURCE_KINDS = ['local-folder', 'http-index'] as const;
export type TelemetryPackageSourceKindsMatchPackageSourceType = Assert<Equals<(typeof TELEMETRY_PACKAGE_SOURCE_KINDS)[number], PackageSourceType>>;

export const TELEMETRY_VERSION_DOWNLOAD_MODES = ['http-direct', 'source-fallback'] as const;
export type TelemetryVersionDownloadModesMatchVersionDownloadMode = Assert<Equals<(typeof TELEMETRY_VERSION_DOWNLOAD_MODES)[number], VersionDownloadMode>>;

const TELEMETRY_ONBOARDING_STEPS = ['language_selection', 'welcome', 'legal_consent', 'download'] as const;
const TELEMETRY_OPERATION_STATUSES = ['success', 'failure'] as const;
const TELEMETRY_WEB_SERVICE_ERROR_KINDS = ['no_active_version', 'version_not_ready', 'dependencies_missing', 'other'] as const;

export type TelemetrySamplingClass = 'session' | 'always';

export type TelemetryPropertySpec =
  | { readonly type: 'enum'; readonly values: readonly string[]; readonly optional?: true }
  | { readonly type: 'number'; readonly min: number; readonly max: number; readonly optional?: true }
  | { readonly type: 'boolean'; readonly optional?: true };

export interface TelemetryEventSpec {
  readonly sampling: TelemetrySamplingClass;
  readonly properties: Readonly<Record<string, TelemetryPropertySpec>>;
}

const enumProp = <const V extends readonly string[]>(values: V) => ({ type: 'enum', values } as const);
const numberProp = (min: number, max: number) => ({ type: 'number', min, max } as const);
const optionalProp = <P extends object>(prop: P) => ({ ...prop, optional: true } as const);

export const TELEMETRY_EVENT_CATALOG = {
  app_started: {
    sampling: 'always',
    properties: {
      source: enumProp(['main_process']),
      kind: enumProp(['startup']),
    },
  },
  main_view_entered: {
    sampling: 'always',
    properties: {
      source: enumProp(['renderer']),
      kind: enumProp(['main_view']),
    },
  },
  app_exited: {
    sampling: 'always',
    properties: {
      status: enumProp(['normal']),
      duration: numberProp(0, MAX_DURATION_MS),
    },
  },
  view_entered: {
    sampling: 'session',
    properties: {
      view: enumProp(TELEMETRY_VIEW_IDS),
      previousView: enumProp(TELEMETRY_PREVIOUS_VIEW_IDS),
    },
  },
  onboarding_step_entered: {
    sampling: 'always',
    properties: {
      step: enumProp(TELEMETRY_ONBOARDING_STEPS),
    },
  },
  onboarding_legal_decided: {
    sampling: 'always',
    properties: {
      decision: enumProp(['accepted', 'declined']),
    },
  },
  onboarding_skipped: {
    sampling: 'always',
    properties: {},
  },
  onboarding_download_finished: {
    sampling: 'always',
    properties: {
      status: enumProp(TELEMETRY_OPERATION_STATUSES),
      duration: numberProp(0, MAX_DURATION_MS),
    },
  },
  onboarding_completed: {
    sampling: 'always',
    properties: {},
  },
  web_service_start_finished: {
    sampling: 'always',
    properties: {
      status: enumProp(TELEMETRY_OPERATION_STATUSES),
      errorKind: optionalProp(enumProp(TELEMETRY_WEB_SERVICE_ERROR_KINDS)),
      duration: numberProp(0, MAX_DURATION_MS),
    },
  },
  web_service_stop_finished: {
    sampling: 'session',
    properties: {
      status: enumProp(TELEMETRY_OPERATION_STATUSES),
      duration: numberProp(0, MAX_DURATION_MS),
    },
  },
  web_service_restart_finished: {
    sampling: 'session',
    properties: {
      status: enumProp(TELEMETRY_OPERATION_STATUSES),
      duration: numberProp(0, MAX_DURATION_MS),
    },
  },
  version_install_finished: {
    sampling: 'always',
    properties: {
      status: enumProp(TELEMETRY_OPERATION_STATUSES),
      mode: enumProp(TELEMETRY_VERSION_DOWNLOAD_MODES),
      duration: numberProp(0, MAX_DURATION_MS),
    },
  },
  dependency_install_finished: {
    sampling: 'session',
    properties: {
      status: enumProp(TELEMETRY_OPERATION_STATUSES),
      count: numberProp(0, MAX_COUNT),
    },
  },
  language_changed: {
    sampling: 'session',
    properties: {
      language: enumProp(SUPPORTED_DESKTOP_LANGUAGE_CODES),
    },
  },
  package_source_switched: {
    sampling: 'session',
    properties: {
      sourceKind: enumProp(TELEMETRY_PACKAGE_SOURCE_KINDS),
    },
  },
  service_region_changed: {
    sampling: 'session',
    properties: {
      region: enumProp(TELEMETRY_SERVICE_REGIONS),
    },
  },
  promote_link_opened: {
    sampling: 'session',
    properties: {
      source: enumProp(['home_promote']),
    },
  },
  store_rating_prompt_actioned: {
    sampling: 'session',
    properties: {
      action: enumProp(['rate']),
    },
  },
  donation_item_actioned: {
    sampling: 'session',
    properties: {
      action: enumProp(['purchase', 'dismiss']),
      tier: optionalProp(enumProp(MSSTORE_DONATION_TIP_TIER_IDS)),
    },
  },
} as const satisfies Record<string, TelemetryEventSpec>;

type TelemetryCatalog = typeof TELEMETRY_EVENT_CATALOG;
export type TelemetryCatalogEventName = keyof TelemetryCatalog & string;

type PropertiesOf<N extends TelemetryCatalogEventName> = TelemetryCatalog[N]['properties'];
type PropertyValueOf<P> = P extends { readonly type: 'enum'; readonly values: infer V extends readonly string[] }
  ? V[number]
  : P extends { readonly type: 'number' }
    ? number
    : boolean;
type RequiredPropertyKeys<P> = {
  [K in keyof P]-?: P[K] extends { readonly optional: true } ? never : K;
}[keyof P];

export type TelemetryEventProperties<N extends TelemetryCatalogEventName> = {
  [K in RequiredPropertyKeys<PropertiesOf<N>>]: PropertyValueOf<PropertiesOf<N>[K]>;
} & {
  [K in Exclude<keyof PropertiesOf<N>, RequiredPropertyKeys<PropertiesOf<N>>>]?: PropertyValueOf<PropertiesOf<N>[K]>;
};

export function isCatalogEvent(name: unknown): name is TelemetryCatalogEventName {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(TELEMETRY_EVENT_CATALOG, name);
}

export function getEventSpec(name: TelemetryCatalogEventName): TelemetryEventSpec {
  return TELEMETRY_EVENT_CATALOG[name];
}
