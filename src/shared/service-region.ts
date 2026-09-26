import type { ServiceRegion } from '../types/service-region.js';
import {
  OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL,
  OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL,
  normalizeOfficialServerHttpIndexUrl,
} from './package-source-defaults.js';

export function isServiceRegion(value: unknown): value is ServiceRegion {
  return value === 'CN' || value === 'INTERNATIONAL';
}

export function serviceRegionForOfficialIndexUrl(indexUrl: string | undefined): ServiceRegion | undefined {
  const normalizedUrl = normalizeOfficialServerHttpIndexUrl(indexUrl);
  if (normalizedUrl === OFFICIAL_MAINLAND_SERVER_HTTP_INDEX_URL) {
    return 'CN';
  }
  if (normalizedUrl === OFFICIAL_INTERNATIONAL_SERVER_HTTP_INDEX_URL) {
    return 'INTERNATIONAL';
  }
  return undefined;
}

export function resolveEffectiveServiceRegion(
  preference: unknown,
  activeSource: { type: 'http-index' | 'local-folder'; indexUrl?: string } | null,
): ServiceRegion {
  if (isServiceRegion(preference)) {
    return preference;
  }
  if (activeSource?.type === 'http-index') {
    return serviceRegionForOfficialIndexUrl(activeSource.indexUrl) ?? 'CN';
  }
  return 'CN';
}

export function serviceRegionPreferenceAfterSourceChange(
  preference: ServiceRegion | undefined,
  previousSource: { type: 'http-index' | 'local-folder'; indexUrl?: string } | null,
  currentSource: { type: 'http-index' | 'local-folder'; indexUrl?: string } | null,
): ServiceRegion | undefined {
  if (currentSource?.type === 'http-index') {
    const currentRegion = serviceRegionForOfficialIndexUrl(currentSource.indexUrl);
    if (currentRegion) {
      return currentRegion;
    }
  }

  if (preference === undefined && previousSource?.type === 'http-index') {
    return serviceRegionForOfficialIndexUrl(previousSource.indexUrl);
  }

  return undefined;
}
