import { app } from 'electron';
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
  method: 'locale' | 'cache';
}

/**
 * Chinese locale codes that indicate China region
 */
const CHINESE_LOCALES = ['zh-CN', 'zh-TW', 'zh-HK', 'zh-SG'];

/**
 * RegionDetector handles automatic region detection for manifest-driven dependency installation
 *
 * Region detection is used to select the appropriate install command from manifest.json:
 * - CN region: uses installCommand.china
 * - INTERNATIONAL region: uses installCommand.global
 */
export class RegionDetector {
  private store: Store<Record<string, unknown>>;

  constructor(store: Store<Record<string, unknown>>) {
    this.store = store;
  }

  /**
   * Detect user region based on system locale
   */
  detectRegion(): Region {
    try {
      const locale = app.getLocale();
      console.log(`[RegionDetector] System locale detected: ${locale}`);

      if (CHINESE_LOCALES.includes(locale)) {
        return 'CN';
      }

      return 'INTERNATIONAL';
    } catch (error) {
      console.error('[RegionDetector] Failed to detect locale, defaulting to INTERNATIONAL:', error);
      return 'INTERNATIONAL';
    }
  }

  /**
   * Detect region with caching support
   */
  detectWithCache(): DetectionResult {
    const cached = this.getCachedDetection();

    if (cached) {
      console.log('[RegionDetector] Using cached detection result');
      return cached;
    }

    console.log('[RegionDetector] Performing new region detection');
    const region = this.detectRegion();
    const result: DetectionResult = {
      region,
      detectedAt: new Date(),
      method: 'locale',
    };

    this.cacheDetectionResult(result);

    return result;
  }

  /**
   * Get cached detection result if valid
   */
  private getCachedDetection(): DetectionResult | null {
    try {
      const cached = this.store.get('regionDetection') as DetectionResult | undefined;

      if (!cached) {
        return null;
      }

      const detectedAt = new Date(cached.detectedAt);
      const now = new Date();
      const cacheAge = now.getTime() - detectedAt.getTime();

      if (cacheAge > CACHE_TTL) {
        console.log('[RegionDetector] Cache expired, will re-detect');
        return null;
      }

      return {
        ...cached,
        detectedAt,
      };
    } catch (error) {
      console.error('[RegionDetector] Failed to read cache:', error);
      return null;
    }
  }

  /**
   * Cache detection result
   */
  private cacheDetectionResult(result: DetectionResult): void {
    try {
      this.store.set('regionDetection', result);
      console.log('[RegionDetector] Detection result cached successfully');
    } catch (error) {
      console.error('[RegionDetector] Failed to cache detection result:', error);
    }
  }

  /**
   * Clear cached detection result
   */
  clearCache(): void {
    try {
      this.store.delete('regionDetection');
      console.log('[RegionDetector] Cache cleared successfully');
    } catch (error) {
      console.error('[RegionDetector] Failed to clear cache:', error);
    }
  }

  /**
   * Force re-detection and clear cache
   */
  redetect(): DetectionResult {
    console.log('[RegionDetector] Forced re-detection requested');
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
}
