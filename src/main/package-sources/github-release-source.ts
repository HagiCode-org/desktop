import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import log from 'electron-log';
import type { Version } from '../version-manager.js';
import type {
  PackageSource,
  GitHubReleaseConfig,
  PackageSourceValidationResult,
  DownloadProgressCallback,
} from './package-source.js';

/**
 * GitHub API Release asset interface
 */
interface GitHubReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
  created_at: string;
  published_at?: string;
}

/**
 * GitHub API Release interface
 */
interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  created_at: string;
  assets: GitHubReleaseAsset[];
}

/**
 * Cache entry for version list
 */
interface VersionCacheEntry {
  versions: Version[];
  timestamp: number;
}

/**
 * GitHub Releases package source implementation
 * Fetches release information from GitHub API
 */
export class GitHubReleasePackageSource implements PackageSource {
  readonly type = 'github-release' as const;
  private config: GitHubReleaseConfig;
  private cache: Map<string, VersionCacheEntry>;
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

  constructor(config: GitHubReleaseConfig) {
    this.config = config;
    this.cache = new Map();
  }

  /**
   * List all available versions from GitHub Releases
   */
  async listAvailableVersions(): Promise<Version[]> {
    try {
      log.info('[GitHubSource] Fetching releases from:', `${this.config.owner}/${this.config.repo}`);

      // Check cache first
      const cacheKey = this.getCacheKey();
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        log.info('[GitHubSource] Using cached versions');
        return cached.versions;
      }

      // Prepare request headers
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
      };

      if (this.config.token) {
        headers['Authorization'] = `token ${this.config.token}`;
      }

      // Fetch releases from GitHub API
      const response = await axios.get<GitHubRelease[]>(
        `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/releases`,
        {
          headers,
          params: {
            // Get all releases including drafts and pre-releases
            per_page: 100, // Maximum per page
          }
        }
      );

      if (response.status !== 200) {
        throw new Error(`GitHub API returned status ${response.status}`);
      }

      const releases = response.data;
      log.info('[GitHubSource] Found', releases.length, 'releases');

      // Get current platform for filtering
      const currentPlatform = this.getCurrentPlatform();
      log.info('[GitHubSource] Current platform:', currentPlatform);

      // Sort by release date (newest first) and take top 10
      const sortedReleases = releases
        .sort((a, b) => {
          const dateA = new Date(a.published_at || a.created_at).getTime();
          const dateB = new Date(b.published_at || b.created_at).getTime();
          return dateB - dateA; // Newest first
        })
        .slice(0, 10); // Only take top 10

      log.info('[GitHubSource] Processing top', sortedReleases.length, 'releases');

      // Parse version information from releases
      const versions: Version[] = [];
      for (const release of sortedReleases) {
        // Include all releases (drafts, pre-releases, published)
        // Filter assets for nort packages (hagicode-*)
        const nortAssets = release.assets.filter(asset =>
          asset.name.startsWith('hagicode-') && asset.name.endsWith('.zip')
        );

        for (const asset of nortAssets) {
          const version = this.extractVersionFromFilename(asset.name);
          const platform = this.extractPlatformFromFilename(asset.name);
          const id = asset.name.replace(/\.zip$/, '');

          // Only include versions compatible with current platform
          if (platform === currentPlatform) {
            versions.push({
              id,
              version,
              platform,
              packageFilename: asset.name,
              releasedAt: release.published_at || release.created_at,
              size: asset.size,
              downloadUrl: asset.browser_download_url,
            });
          }
        }
      }

      // Sort by version (newest first)
      versions.sort((a, b) => this.compareVersions(b.version, a.version));

      log.info('[GitHubSource] Found', versions.length, 'versions for platform:', currentPlatform);

      // Cache the results
      this.cache.set(cacheKey, {
        versions,
        timestamp: Date.now(),
      });

      return versions;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 403) {
          const rateLimitReset = error.response?.headers['x-ratelimit-reset'];
          const resetTime = rateLimitReset
            ? new Date(parseInt(rateLimitReset) * 1000).toLocaleString()
            : 'unknown';

          log.error('[GitHubSource] API rate limit exceeded. Resets at:', resetTime);
          throw new Error(
            `GitHub API rate limit exceeded. Resets at ${resetTime}. ` +
            'Please provide an auth token to increase the limit to 5000 requests/hour.'
          );
        } else if (status === 404) {
          log.error('[GitHubSource] Repository not found:', `${this.config.owner}/${this.config.repo}`);
          throw new Error(
            `Repository not found: ${this.config.owner}/${this.config.repo}. ` +
            'Please check the owner and repository name.'
          );
        } else if (status === 401) {
          log.error('[GitHubSource] Invalid authentication token');
          throw new Error('Invalid GitHub token. Please check your authentication token.');
        }
      }

      log.error('[GitHubSource] Failed to fetch releases:', error);
      throw error;
    }
  }

  /**
   * Download package from GitHub Releases
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

      log.info('[GitHubSource] Downloading package:', version.id);

      // Prepare request headers
      const headers: Record<string, string> = {};
      if (this.config.token) {
        headers['Authorization'] = `token ${this.config.token}`;
      }

      // Download with progress tracking
      const response = await axios.get<ArrayBuffer>(version.downloadUrl, {
        headers,
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

      log.info('[GitHubSource] Package downloaded successfully');
    } catch (error) {
      log.error('[GitHubSource] Failed to download package:', error);
      throw error;
    }
  }

  /**
   * Validate the GitHub repository configuration
   */
  async validateConfig(): Promise<PackageSourceValidationResult> {
    try {
      // Check if required fields are provided
      if (!this.config.owner || this.config.owner.trim() === '') {
        return {
          valid: false,
          error: 'Repository owner is required',
        };
      }

      if (!this.config.repo || this.config.repo.trim() === '') {
        return {
          valid: false,
          error: 'Repository name is required',
        };
      }

      // Test API access
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
      };

      if (this.config.token) {
        headers['Authorization'] = `token ${this.config.token}`;
      }

      try {
        const response = await axios.get(
          `https://api.github.com/repos/${this.config.owner}/${this.config.repo}`,
          { headers, validateStatus: (status) => status < 500 }
        );

        if (response.status === 404) {
          return {
            valid: false,
            error: 'Repository not found',
          };
        }

        if (response.status === 401) {
          return {
            valid: false,
            error: 'Invalid authentication token',
          };
        }

        if (response.status !== 200) {
          return {
            valid: false,
            error: `GitHub API returned status ${response.status}`,
          };
        }

        return { valid: true };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return {
              valid: false,
              error: 'Failed to connect to GitHub. Please check your internet connection.',
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
    log.info('[GitHubSource] Cache cleared');
  }

  /**
   * Get cache key for this configuration
   */
  private getCacheKey(): string {
    return `${this.config.owner}/${this.config.repo}`;
  }

  /**
   * Extract version from release tag or asset filename
   */
  private extractVersionFromFilename(filename: string): string {
    // Try to extract from tag name (remove 'v' prefix if present)
    // Format: hagicode-{version}-{platform}.zip
    const match = filename.match(/^hagicode-([0-9]\.[0-9]\.[0-9](?:-[a-zA-Z0-9\.]+)?)-(linux|windows|osx)\.zip$/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Extract platform from asset filename
   */
  private extractPlatformFromFilename(filename: string): string {
    // Try simplified format: hagicode-{version}-{platform}.zip
    let match = filename.match(/^hagicode-([0-9]\.[0-9]\.[0-9](?:-[a-zA-Z0-9\.]+)?)-(linux|windows|osx)\.zip$/);
    if (match) {
      return match[2];
    }

    // Fallback: try to match old format for backwards compatibility
    match = filename.match(/^hagicode-([0-9]\.[0-9]\.[0-9](?:-[a-zA-Z0-9\.]+)?)-([a-zA-Z]+)-x64\.zip$/);
    if (match) {
      const oldPlatform = match[2].toLowerCase();
      // Map old platform names to new simplified names
      if (oldPlatform.includes('linux') || oldPlatform.includes('ubuntu')) {
        return 'linux';
      }
      if (oldPlatform.includes('win')) {
        return 'windows';
      }
      if (oldPlatform.includes('darwin') || oldPlatform.includes('mac') || oldPlatform.includes('osx')) {
        return 'osx';
      }
      return oldPlatform;
    }

    // If no match, default to unknown
    return 'unknown';
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
   */
  private compareVersions(v1: string, v2: string): number {
    const parseVersion = (v: string) => {
      const parts = v.split('-')[0].split('.').map(Number);
      return parts;
    };

    const p1 = parseVersion(v1);
    const p2 = parseVersion(v2);

    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;

      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }

    return 0;
  }
}
