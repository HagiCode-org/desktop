import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log';
import type {
  PresetCacheData,
  CacheValidationResult,
  PresetIndex,
} from '../types/preset.js';
import { CACHE_FILENAME, CACHE_MAX_SIZE_MB } from '../types/preset.js';

/**
 * PresetCacheManager manages local caching of preset configurations
 * Handles cache validation, storage, and retrieval for offline support
 */
export class PresetCacheManager {
  private cacheFilePath: string;
  private userDataPath: string;

  constructor() {
    // Get user data directory from Electron
    this.userDataPath = app.getPath('userData');
    this.cacheFilePath = path.join(this.userDataPath, CACHE_FILENAME);

    log.info('[PresetCacheManager] Initialized with cache path:', this.cacheFilePath);
  }

  /**
   * Get cached presets if available and valid
   * @returns Cached preset data or null if not available
   */
  async getCachedPreset(): Promise<PresetCacheData | null> {
    try {
      log.info('[PresetCacheManager] Reading cache from:', this.cacheFilePath);

      // Check if cache file exists
      try {
        await fs.access(this.cacheFilePath);
      } catch {
        log.info('[PresetCacheManager] Cache file does not exist');
        return null;
      }

      // Read cache file
      const content = await fs.readFile(this.cacheFilePath, 'utf-8');

      // Parse JSON and validate structure
      const cacheData = JSON.parse(content) as PresetCacheData;

      // Validate cache data structure
      if (!this.validateCacheData(cacheData)) {
        log.warn('[PresetCacheManager] Cache data validation failed, deleting cache');
        await this.clearCache();
        return null;
      }

      // Check file size
      const stats = await fs.stat(this.cacheFilePath);
      const sizeMB = stats.size / (1024 * 1024);
      if (sizeMB > CACHE_MAX_SIZE_MB) {
        log.warn('[PresetCacheManager] Cache file too large:', sizeMB.toFixed(2), 'MB');
        await this.clearCache();
        return null;
      }

      log.info('[PresetCacheManager] Cache loaded successfully');
      return cacheData;
    } catch (error) {
      log.error('[PresetCacheManager] Failed to read cache:', error);

      // If cache is corrupt, delete it
      try {
        await this.clearCache();
      } catch (clearError) {
        log.error('[PresetCacheManager] Failed to clear corrupt cache:', clearError);
      }

      return null;
    }
  }

  /**
   * Save preset data to cache with atomic write
   * @param presets Preset index data to cache
   * @returns Success status
   */
  async setCachedPreset(presets: PresetIndex): Promise<{ success: boolean; error?: string }> {
    try {
      log.info('[PresetCacheManager] Writing cache to:', this.cacheFilePath);

      // Create cache data with metadata
      const now = Date.now();
      const cacheData: PresetCacheData = {
        presets,
        timestamp: now,
        version: presets.version,
        validUntil: now + (24 * 60 * 60 * 1000), // 24 hours
      };

      // Convert to JSON
      const jsonString = JSON.stringify(cacheData, null, 2);

      // Create temp file for atomic write
      const tempPath = `${this.cacheFilePath}.tmp`;

      try {
        // Write to temp file with restricted permissions
        await fs.writeFile(tempPath, jsonString, {
          mode: 0o600,
          encoding: 'utf-8',
        });

        // Verify file was written correctly
        const writtenContent = await fs.readFile(tempPath, 'utf-8');
        JSON.parse(writtenContent); // Validate JSON

        // Atomic rename
        await fs.rename(tempPath, this.cacheFilePath);

        log.info('[PresetCacheManager] Cache written successfully');
        return { success: true };
      } catch (writeError) {
        // Clean up temp file on error
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore
        }
        throw writeError;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('[PresetCacheManager] Failed to write cache:', errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Check if cached presets are still valid
   * @returns Cache validation result
   */
  async isCacheValid(): Promise<CacheValidationResult> {
    try {
      const cacheData = await this.getCachedPreset();

      if (!cacheData) {
        return {
          isValid: false,
          isExpired: false,
          ageMs: 0,
        };
      }

      const now = Date.now();
      const ageMs = now - cacheData.timestamp;
      const isExpired = now > cacheData.validUntil;

      log.info('[PresetCacheManager] Cache validation:', {
        isValid: !isExpired,
        isExpired,
        ageHours: (ageMs / (1000 * 60 * 60)).toFixed(2),
      });

      return {
        isValid: !isExpired,
        isExpired,
        ageMs,
        timestamp: cacheData.timestamp,
      };
    } catch (error) {
      log.error('[PresetCacheManager] Cache validation error:', error);
      return {
        isValid: false,
        isExpired: true,
        ageMs: 0,
      };
    }
  }

  /**
   * Clear cached presets
   * @returns Success status
   */
  async clearCache(): Promise<{ success: boolean; error?: string }> {
    try {
      log.info('[PresetCacheManager] Clearing cache');

      // Check if cache file exists
      try {
        await fs.access(this.cacheFilePath);
      } catch {
        log.info('[PresetCacheManager] Cache file does not exist, nothing to clear');
        return { success: true };
      }

      // Delete cache file
      await fs.unlink(this.cacheFilePath);

      log.info('[PresetCacheManager] Cache cleared successfully');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('[PresetCacheManager] Failed to clear cache:', errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get cache file path
   * @returns Full path to cache file
   */
  getCacheFilePath(): string {
    return this.cacheFilePath;
  }

  /**
   * Get cache age in hours
   * @returns Age in hours or 0 if cache doesn't exist
   */
  async getCacheAgeHours(): Promise<number> {
    try {
      const cacheData = await this.getCachedPreset();

      if (!cacheData) {
        return 0;
      }

      const ageMs = Date.now() - cacheData.timestamp;
      return ageMs / (1000 * 60 * 60);
    } catch (error) {
      log.error('[PresetCacheManager] Failed to get cache age:', error);
      return 0;
    }
  }

  /**
   * Validate cache data structure
   * @param cacheData Cache data to validate
   * @returns True if valid
   */
  private validateCacheData(cacheData: unknown): cacheData is PresetCacheData {
    if (!cacheData || typeof cacheData !== 'object') {
      return false;
    }

    const data = cacheData as Record<string, unknown>;

    return (
      typeof data.presets === 'object' &&
      typeof data.timestamp === 'number' &&
      typeof data.version === 'string' &&
      typeof data.validUntil === 'number'
    );
  }

  /**
   * Get cache statistics
   * @returns Cache size and age information
   */
  async getCacheStats(): Promise<{ sizeBytes: number; sizeMB: number; ageHours: number; exists: boolean }> {
    try {
      await fs.access(this.cacheFilePath);

      const stats = await fs.stat(this.cacheFilePath);
      const sizeBytes = stats.size;
      const sizeMB = sizeBytes / (1024 * 1024);
      const ageHours = await this.getCacheAgeHours();

      return {
        sizeBytes,
        sizeMB: Math.round(sizeMB * 100) / 100,
        ageHours: Math.round(ageHours * 100) / 100,
        exists: true,
      };
    } catch {
      return {
        sizeBytes: 0,
        sizeMB: 0,
        ageHours: 0,
        exists: false,
      };
    }
  }
}
