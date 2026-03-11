import * as electron from 'electron';
import Store from 'electron-store';

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Region type based on user location
 */
export type Region = 'CN' | 'INTERNATIONAL';

/**
 * Detection result with metadata
 */
export interface DetectionResult {
  region: Region;
  detectedAt: Date;
  method: 'locale' | 'cache' | 'override';
  localeSnapshot: string | null;
  rawLocale: string | null;
  matchedRule: 'zh-family' | 'default-international' | 'error-fallback' | 'manual-override';
}

interface StoredDetectionResult {
  region: Region;
  detectedAt: string;
  localeSnapshot: string | null;
  rawLocale: string | null;
  matchedRule: DetectionResult['matchedRule'];
}

interface LocaleResolution {
  region: Region;
  rawLocale: string | null;
  normalizedLocale: string | null;
  matchedRule: DetectionResult['matchedRule'];
}

interface RegionDetectorOptions {
  getLocale?: () => string;
  now?: () => Date;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

/**
 * Normalize locale strings into a canonical BCP 47 representation so
 * cache comparisons and language-family matching stay stable across OSes.
 */
export function normalizeLocale(locale: string | null | undefined): string | null {
  const trimmed = locale?.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = trimmed.replace(/_/g, '-');
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? candidate;
  } catch {
    return candidate;
  }
}

export function isChineseLocale(locale: string | null | undefined): boolean {
  const normalizedLocale = normalizeLocale(locale);
  if (!normalizedLocale) {
    return false;
  }

  // Treat the whole zh-* family as the Chinese prompt path so locale
  // variants like zh, zh-Hans, zh-Hans-CN, zh-TW, and zh-HK stay stable.
  const [language] = normalizedLocale.split('-');
  return language.toLowerCase() === 'zh';
}

export function resolveRegionFromLocale(locale: string | null | undefined): Region {
  return isChineseLocale(locale) ? 'CN' : 'INTERNATIONAL';
}

/**
 * RegionDetector handles automatic region detection for manifest-driven dependency installation
 *
 * Region detection is used to select the appropriate install command from manifest.json:
 * - CN region: uses installCommand.china
 * - INTERNATIONAL region: uses installCommand.global
 */
export class RegionDetector {
  private store: Store<Record<string, unknown>>;
  private readonly getLocale: () => string;
  private readonly now: () => Date;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(store: Store<Record<string, unknown>>, options: RegionDetectorOptions = {}) {
    this.store = store;
    this.getLocale = options.getLocale ?? (() => {
      const electronApp = (electron as { app?: { getLocale: () => string } }).app;
      if (!electronApp) {
        throw new Error('Electron app unavailable');
      }
      return electronApp.getLocale();
    });
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? console;
  }

  /**
   * Detect user region based on system locale
   */
  detectRegion(): Region {
    return this.resolveCurrentLocale().region;
  }

  /**
   * Detect region with caching support
   */
  detectWithCache(): DetectionResult {
    const currentResolution = this.resolveCurrentLocale();
    const cached = currentResolution.matchedRule === 'error-fallback'
      ? null
      : this.getCachedDetection(currentResolution.normalizedLocale);

    if (cached) {
      this.logger.info('[RegionDetector] Using cached detection result', {
        region: cached.region,
        localeSnapshot: cached.localeSnapshot,
        rawLocale: cached.rawLocale,
        matchedRule: cached.matchedRule,
      });
      return cached;
    }

    const result: DetectionResult = {
      region: currentResolution.region,
      detectedAt: this.now(),
      method: 'locale',
      localeSnapshot: currentResolution.normalizedLocale,
      rawLocale: currentResolution.rawLocale,
      matchedRule: currentResolution.matchedRule,
    };

    this.logger.info('[RegionDetector] Performing new region detection', {
      region: result.region,
      rawLocale: result.rawLocale,
      normalizedLocale: result.localeSnapshot,
      matchedRule: result.matchedRule,
    });

    if (result.matchedRule !== 'error-fallback') {
      this.cacheDetectionResult(result);
    }

    return result;
  }

  /**
   * Get cached detection result if valid
   */
  private getCachedDetection(currentLocaleSnapshot: string | null): DetectionResult | null {
    try {
      const cached = this.store.get('regionDetection') as StoredDetectionResult | undefined;

      if (!cached) {
        return null;
      }

      const detectedAt = new Date(cached.detectedAt);
      if (Number.isNaN(detectedAt.getTime())) {
        this.logger.warn('[RegionDetector] Cached detection has invalid timestamp, ignoring cache');
        return null;
      }

      const cacheAge = this.now().getTime() - detectedAt.getTime();

      if (cacheAge > CACHE_TTL) {
        this.logger.info('[RegionDetector] Cache expired, will re-detect', {
          cacheAgeMs: cacheAge,
          localeSnapshot: cached.localeSnapshot ?? null,
        });
        return null;
      }

      if (!cached.localeSnapshot) {
        this.logger.info('[RegionDetector] Cache missing locale snapshot, will re-detect');
        return null;
      }

      if (cached.localeSnapshot !== currentLocaleSnapshot) {
        this.logger.info('[RegionDetector] Locale snapshot changed, invalidating cache', {
          previousLocaleSnapshot: cached.localeSnapshot,
          currentLocaleSnapshot,
        });
        return null;
      }

      return {
        region: cached.region,
        detectedAt,
        method: 'cache',
        localeSnapshot: cached.localeSnapshot,
        rawLocale: cached.rawLocale,
        matchedRule: cached.matchedRule,
      };
    } catch (error) {
      this.logger.error('[RegionDetector] Failed to read cache:', error);
      return null;
    }
  }

  /**
   * Cache detection result
   */
  private cacheDetectionResult(result: DetectionResult): void {
    try {
      const cachedResult: StoredDetectionResult = {
        region: result.region,
        detectedAt: result.detectedAt.toISOString(),
        localeSnapshot: result.localeSnapshot,
        rawLocale: result.rawLocale,
        matchedRule: result.matchedRule,
      };
      this.store.set('regionDetection', cachedResult);
      this.logger.info('[RegionDetector] Detection result cached successfully', {
        region: result.region,
        localeSnapshot: result.localeSnapshot,
      });
    } catch (error) {
      this.logger.error('[RegionDetector] Failed to cache detection result:', error);
    }
  }

  /**
   * Clear cached detection result
   */
  clearCache(): void {
    try {
      this.store.delete('regionDetection');
      this.logger.info('[RegionDetector] Cache cleared successfully');
    } catch (error) {
      this.logger.error('[RegionDetector] Failed to clear cache:', error);
    }
  }

  /**
   * Force re-detection and clear cache
   */
  redetect(): DetectionResult {
    this.logger.info('[RegionDetector] Forced re-detection requested');
    this.clearCache();
    return this.detectWithCache();
  }

  /**
   * Get current detection result for UI display
   */
  getStatus(): {
    region: Region;
    detectedAt: Date | null;
  } {
    const detection = this.detectWithCache();

    return {
      region: detection.region,
      detectedAt: detection.detectedAt,
    };
  }

  private resolveCurrentLocale(): LocaleResolution {
    try {
      const rawLocale = this.getLocale();
      const normalizedLocale = normalizeLocale(rawLocale);
      const region = resolveRegionFromLocale(normalizedLocale);
      const matchedRule: DetectionResult['matchedRule'] = region === 'CN'
        ? 'zh-family'
        : 'default-international';

      return {
        region,
        rawLocale,
        normalizedLocale,
        matchedRule,
      };
    } catch (error) {
      this.logger.error('[RegionDetector] Failed to detect locale, defaulting to INTERNATIONAL:', error);
      return {
        region: 'INTERNATIONAL',
        rawLocale: null,
        normalizedLocale: null,
        matchedRule: 'error-fallback',
      };
    }
  }
}
