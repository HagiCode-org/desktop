import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import log from 'electron-log';
import type { Version } from '../version-manager.js';
import type {
  PackageSource,
  HttpIndexConfig,
  PackageSourceValidationResult,
  DownloadProgressCallback,
} from './package-source.js';

/**
 * HTTP Index file asset interface (official format)
 */
export interface HttpIndexAsset {
  name: string;
  path?: string;
  size?: number;
  lastModified?: string;
}

/**
 * HTTP Index file version interface (official format)
 */
export interface HttpIndexVersion {
  version: string;
  files?: string[];
  assets: HttpIndexAsset[];
}

/**
 * Channel information interface
 * Represents a release channel (e.g., stable, beta, alpha)
 *
 * @example
 * ```json
 * {
 *   "latest": "1.0.0",
 *   "versions": ["1.0.0", "0.9.0"]
 * }
 * ```
 */
export interface ChannelInfo {
  /** The latest version string in this channel */
  latest: string;
  /** Array of version strings belonging to this channel */
  versions: string[];
}

/**
 * HTTP Index file structure
 * Represents the response from the HTTP index server
 *
 * @example
 * ```json
 * {
 *   "versions": [...],
 *   "channels": {
 *     "beta": { "latest": "0.1.0-beta.11", "versions": ["0.1.0-beta.11"] },
 *     "stable": { "latest": "1.0.0", "versions": ["1.0.0"] }
 *   }
 * }
 * ```
 */
export interface HttpIndexFile {
  versions: HttpIndexVersion[];
  /** Optional channels object mapping channel names to their version information.
   * When absent, all versions default to 'beta' channel for backward compatibility. */
  channels?: Record<string, ChannelInfo>;
}

/**
 * Cache entry for version list
 */
interface VersionCacheEntry {
  versions: Version[];
  timestamp: number;
}

/**
 * HTTP Index package source implementation
 * Fetches release information from a custom HTTP index server
 */
export class HttpIndexPackageSource implements PackageSource {
  readonly type = 'http-index' as const;
  private config: HttpIndexConfig;
  private cache: Map<string, VersionCacheEntry>;
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

  constructor(config: HttpIndexConfig) {
    this.config = config;
    this.cache = new Map();
  }

  /**
   * List all available versions from HTTP index
   */
  async listAvailableVersions(): Promise<Version[]> {
    try {
      log.info('[HttpIndexSource] Fetching index from:', this.config.indexUrl);

      // Check cache first
      const cacheKey = this.getCacheKey();
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        log.info('[HttpIndexSource] Using cached versions');
        return cached.versions;
      }

      // Prepare request headers
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };

      // Fetch index from HTTP server
      const response = await axios.get<HttpIndexFile>(this.config.indexUrl, {
        headers,
        timeout: 30000, // 30 second timeout
      });

      if (response.status !== 200) {
        throw new Error(`HTTP server returned status ${response.status}`);
      }

      const indexData = response.data;

      // Validate index structure
      if (!indexData || !Array.isArray(indexData.versions)) {
        throw new Error('Invalid index file format: missing or invalid versions array');
      }

      log.info('[HttpIndexSource] Found', indexData.versions.length, 'versions in index');

      // Get current platform for filtering
      const currentPlatform = this.getCurrentPlatform();
      log.info('[HttpIndexSource] Current platform:', currentPlatform);

      // Parse version information from index
      const versions: Version[] = [];
      for (const versionEntry of indexData.versions) {
        // Process assets
        for (const asset of versionEntry.assets) {
          // Extract platform from filename
          const platform = this.extractPlatformFromFilename(asset.name);
          if (!platform) {
            log.warn('[HttpIndexSource] Could not extract platform from filename:', asset.name);
            continue;
          }

          // Only include versions compatible with current platform
          if (platform === currentPlatform) {
            const downloadUrl = this.resolveAssetUrl(asset);
            const id = asset.name.replace(/\.zip$/, '');

            versions.push({
              id,
              version: versionEntry.version,
              platform,
              packageFilename: asset.name,
              releasedAt: asset.lastModified || new Date().toISOString(),
              size: asset.size,
              downloadUrl,
            });
          }
        }
      }

      // Map versions to channels if channels object exists
      if (indexData.channels) {
        log.info('[HttpIndexSource] Mapping versions to channels');
        for (const [channelName, channelInfo] of Object.entries(indexData.channels)) {
          for (const versionStr of channelInfo.versions) {
            const version = versions.find(v => v.version === versionStr);
            if (version) {
              version.channel = channelName;
            }
          }
        }
      } else {
        // Backward compatibility: default all versions to 'beta' when no channels specified
        log.info('[HttpIndexSource] No channels object found, defaulting all versions to beta');
        versions.forEach(v => v.channel = 'beta');
      }

      // Sort by version (newest first)
      versions.sort((a, b) => this.compareVersions(b.version, a.version));

      log.info('[HttpIndexSource] Found', versions.length, 'versions for platform:', currentPlatform);

      // Cache the results
      this.cache.set(cacheKey, {
        versions,
        timestamp: Date.now(),
      });

      return versions;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 404) {
          log.error('[HttpIndexSource] Index file not found:', this.config.indexUrl);
          throw new Error(
            `Index file not found at ${this.config.indexUrl}. ` +
            'Please check the URL is correct and accessible.'
          );
        } else if (status === 401 || status === 403) {
          log.error('[HttpIndexSource] Authentication failed');
          throw new Error(
            'Authentication failed. Please check your authentication token.'
          );
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          log.error('[HttpIndexSource] Failed to connect to server');
          throw new Error(
            'Failed to connect to the server. Please check your internet connection.'
          );
        }
      }

      log.error('[HttpIndexSource] Failed to fetch index:', error);
      throw error;
    }
  }

  /**
   * Download package from HTTP index source
   */
  async downloadPackage(
    version: Version,
    cachePath: string,
    onProgress?: DownloadProgressCallback
  ): Promise<void> {
    try {
      if (!version.downloadUrl) {
        throw new Error(`No download URL available for version: ${version.id}`);
      }

      log.info('[HttpIndexSource] Downloading package:', version.id);

      // Download with progress tracking
      const response = await axios.get<ArrayBuffer>(version.downloadUrl, {
        responseType: 'arraybuffer',
        onDownloadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const current = progressEvent.loaded;
            const total = progressEvent.total;
            const percentage = Math.round((current / total) * 100);
            onProgress({ current, total, percentage });
          }
        },
      });

      // Write to cache file
      const buffer = Buffer.from(response.data);
      await fs.writeFile(cachePath, buffer);

      log.info('[HttpIndexSource] Package downloaded successfully');
    } catch (error) {
      log.error('[HttpIndexSource] Failed to download package:', error);
      throw error;
    }
  }

  /**
   * Validate the HTTP index configuration
   */
  async validateConfig(): Promise<PackageSourceValidationResult> {
    try {
      // Check if required fields are provided
      if (!this.config.indexUrl || this.config.indexUrl.trim() === '') {
        return {
          valid: false,
          error: 'Index URL is required',
        };
      }

      // Validate URL format
      try {
        new URL(this.config.indexUrl);
      } catch {
        return {
          valid: false,
          error: 'Invalid index URL format',
        };
      }

      // Test index file access
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };

      try {
        const response = await axios.get<HttpIndexFile>(this.config.indexUrl, {
          headers,
          timeout: 10000, // 10 second timeout for validation
          validateStatus: (status) => status < 500,
        });

        if (response.status === 404) {
          return {
            valid: false,
            error: 'Index file not found',
          };
        }

        if (response.status === 401 || response.status === 403) {
          return {
            valid: false,
            error: 'Authentication failed',
          };
        }

        if (response.status !== 200) {
          return {
            valid: false,
            error: `Server returned status ${response.status}`,
          };
        }

        // Validate index structure
        const indexData = response.data;
        if (!indexData || !Array.isArray(indexData.versions)) {
          return {
            valid: false,
            error: 'Invalid index file format',
          };
        }

        // Validate channels structure if present
        if (indexData.channels) {
          for (const [channelName, channelInfo] of Object.entries(indexData.channels)) {
            if (!channelInfo.latest || !Array.isArray(channelInfo.versions)) {
              return {
                valid: false,
                error: `Invalid channel structure for '${channelName}'`,
              };
            }
          }
        }

        return { valid: true };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return {
              valid: false,
              error: 'Failed to connect to server',
            };
          }
          if (error.code === 'ETIMEDOUT') {
            return {
              valid: false,
              error: 'Connection timed out',
            };
          }
        }
        throw error;
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Clear cached version data
   */
  clearCache(): void {
    const cacheKey = this.getCacheKey();
    this.cache.delete(cacheKey);
    log.info('[HttpIndexSource] Cache cleared');
  }

  /**
   * Get cache key for this configuration
   */
  private getCacheKey(): string {
    return this.config.indexUrl;
  }

  /**
   * Resolve the full download URL for an asset
   * Constructs URL based on the index URL location
   */
  private resolveAssetUrl(asset: HttpIndexAsset): string {
    // Construct URL from index URL and asset path
    if (asset.path) {
      const indexUrl = new URL(this.config.indexUrl);
      const baseUrl = `${indexUrl.protocol}//${indexUrl.host}`;
      const pathPrefix = indexUrl.pathname.substring(0, indexUrl.pathname.lastIndexOf('/') + 1);
      const assetPath = asset.path.startsWith('/') ? asset.path.slice(1) : asset.path;
      return `${baseUrl}${pathPrefix}${assetPath}`;
    }

    throw new Error(`Cannot resolve download URL for asset: ${asset.name}`);
  }

  /**
   * Extract platform from asset filename
   * Supports formats: hagicode-{version}-{platform}-nort.zip or hagicode-{version}-{platform}.zip
   */
  private extractPlatformFromFilename(filename: string): string | null {
    // Match both formats: with and without -nort suffix
    // Examples:
    // - hagicode-0.1.0-beta.1-linux-x64-nort.zip
    // - hagicode-0.1.0-linux-x64.zip
    const match = filename.match(/^hagicode-([0-9]\.[0-9](?:\.[0-9])?(?:-[a-zA-Z0-9\.]+)?)-(linux|osx|windows|win)-x64(-nort)?\.zip$/);
    if (match) {
      const platform = match[2];
      // Normalize 'win' to 'windows'
      return platform === 'win' ? 'windows' : platform;
    }
    return null;
  }

  /**
   * Get the current platform name for filtering
   */
  private getCurrentPlatform(): string {
    const currentPlatform = process.platform;
    switch (currentPlatform) {
      case 'win32':
        return 'windows';
      case 'darwin':
        return 'osx';
      case 'linux':
        return 'linux';
      default:
        return 'unknown';
    }
  }

  /**
   * Compare two version strings
   * Returns positive if v1 > v2, negative if v1 < v2, 0 if equal
   * Handles semantic versioning with pre-release tags (e.g., 0.1.0-beta.1)
   */
  private compareVersions(v1: string, v2: string): number {
    const parseVersion = (v: string) => {
      const [versionPart, prereleasePart] = v.split('-');
      const parts = versionPart.split('.').map(Number);
      let prerelease: string[] = [];
      if (prereleasePart) {
        // Parse prerelease identifiers (e.g., "beta.1" -> ["beta", "1"])
        prerelease = prereleasePart.split('.');
      }
      return { parts, prerelease };
    };

    const p1 = parseVersion(v1);
    const p2 = parseVersion(v2);

    // Compare main version parts
    for (let i = 0; i < Math.max(p1.parts.length, p2.parts.length); i++) {
      const n1 = p1.parts[i] || 0;
      const n2 = p2.parts[i] || 0;

      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }

    // Main versions are equal, compare prerelease identifiers
    // Versions without prerelease are greater than those with prerelease
    if (p1.prerelease.length === 0 && p2.prerelease.length > 0) return 1;
    if (p1.prerelease.length > 0 && p2.prerelease.length === 0) return -1;
    if (p1.prerelease.length === 0 && p2.prerelease.length === 0) return 0;

    // Both have prerelease identifiers, compare them
    const maxLength = Math.max(p1.prerelease.length, p2.prerelease.length);
    for (let i = 0; i < maxLength; i++) {
      const id1 = p1.prerelease[i] || '';
      const id2 = p2.prerelease[i] || '';

      // Empty identifier is less than any non-empty identifier
      if (id1 === '' && id2 !== '') return -1;
      if (id1 !== '' && id2 === '') return 1;
      if (id1 === '' && id2 === '') return 0;

      // Try to compare as numbers
      const num1 = parseInt(id1, 10);
      const num2 = parseInt(id2, 10);

      if (!isNaN(num1) && !isNaN(num2)) {
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
      } else {
        // At least one is not a number, compare as strings
        if (id1 > id2) return 1;
        if (id1 < id2) return -1;
      }
    }

    return 0;
  }
}
