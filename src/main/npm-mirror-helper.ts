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
 * NpmMirrorHelper handles automatic region detection and npm mirror configuration
 */
export class NpmMirrorHelper {
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
      console.log(`[NpmMirrorHelper] System locale detected: ${locale}`);

      // Check if the locale is Chinese
      if (CHINESE_LOCALES.includes(locale)) {
        return 'CN';
      }

      // Default to international
      return 'INTERNATIONAL';
    } catch (error) {
      console.error('[NpmMirrorHelper] Failed to detect locale, defaulting to INTERNATIONAL:', error);
      return 'INTERNATIONAL';
    }
  }

  /**
   * Get npm install arguments based on detected region
   * Returns array of command-line arguments for npm install
   */
  getNpmInstallArgs(): string[] {
    const region = this.detectWithCache().region;

    if (region === 'CN') {
      const mirrorUrl = 'https://registry.npmmirror.com';
      console.log(`[NpmMirrorHelper] Using Taobao npm mirror: ${mirrorUrl}`);
      return ['--registry', mirrorUrl];
    }

    console.log('[NpmMirrorHelper] Using official npm registry');
    return []; // Use default official registry
  }

  /**
   * Detect region with caching support
   */
  detectWithCache(): DetectionResult {
    // Try to get cached result
    const cached = this.getCachedDetection();

    if (cached) {
      console.log('[NpmMirrorHelper] Using cached detection result');
      return cached;
    }

    // No valid cache, perform new detection
    console.log('[NpmMirrorHelper] Performing new region detection');
    const region = this.detectRegion();
    const result: DetectionResult = {
      region,
      detectedAt: new Date(),
      method: 'locale',
    };

    // Cache the result
    this.cacheDetectionResult(result);

    return result;
  }

  /**
   * Get cached detection result if valid
   */
  private getCachedDetection(): DetectionResult | null {
    try {
      const cached = this.store.get('npmRegionDetection') as DetectionResult | undefined;

      if (!cached) {
        return null;
      }

      const detectedAt = new Date(cached.detectedAt);
      const now = new Date();
      const cacheAge = now.getTime() - detectedAt.getTime();

      // Check if cache is still valid (within TTL)
      if (cacheAge > CACHE_TTL) {
        console.log('[NpmMirrorHelper] Cache expired, will re-detect');
        return null;
      }

      // Return cached result with Date object properly deserialized
      return {
        ...cached,
        detectedAt,
      };
    } catch (error) {
      console.error('[NpmMirrorHelper] Failed to read cache:', error);
      return null;
    }
  }

  /**
   * Cache detection result
   */
  private cacheDetectionResult(result: DetectionResult): void {
    try {
      this.store.set('npmRegionDetection', result);
      console.log('[NpmMirrorHelper] Detection result cached successfully');
    } catch (error) {
      console.error('[NpmMirrorHelper] Failed to cache detection result:', error);
      // Non-critical error, continue without caching
    }
  }

  /**
   * Clear cached detection result
   */
  clearCache(): void {
    try {
      this.store.delete('npmRegionDetection');
      console.log('[NpmMirrorHelper] Cache cleared successfully');
    } catch (error) {
      console.error('[NpmMirrorHelper] Failed to clear cache:', error);
    }
  }

  /**
   * Get current mirror status for UI display
   */
  getMirrorStatus(): {
    region: Region;
    mirrorUrl: string;
    mirrorName: string;
    detectedAt: Date | null;
  } {
    const detection = this.detectWithCache();

    if (detection.region === 'CN') {
      return {
        region: 'CN',
        mirrorUrl: 'https://registry.npmmirror.com',
        mirrorName: 'Taobao NPM Mirror',
        detectedAt: detection.detectedAt,
      };
    }

    return {
      region: 'INTERNATIONAL',
      mirrorUrl: 'https://registry.npmjs.org',
      mirrorName: 'Official npm',
      detectedAt: detection.detectedAt,
    };
  }

  /**
   * Force re-detection and clear cache
   */
  redetect(): DetectionResult {
    console.log('[NpmMirrorHelper] Forced re-detection requested');
    this.clearCache();
    return this.detectWithCache();
  }
}
