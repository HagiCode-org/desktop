import axios from 'axios';
import fs from 'node:fs/promises';
import log from 'electron-log';
import type { HybridDistributionMetadata, VersionAssetKind } from '../../types/sharing-acceleration.js';
import type { Version } from '../version-manager.js';
import type {
  PackageSource,
  HttpIndexConfig,
  PackageSourceValidationResult,
  DownloadProgressCallback,
} from './package-source.js';

const HYBRID_THRESHOLD_BYTES = 0;

export interface HttpIndexAsset {
  name: string;
  path?: string;
  size?: number;
  lastModified?: string;
  directUrl?: string;
  torrentUrl?: string;
  infoHash?: string;
  webSeeds?: string[];
  sha256?: string;
}

export interface HttpIndexLegacyFile {
  name?: string;
  path?: string;
  size?: number;
  lastModified?: string;
  directUrl?: string;
}

export interface HttpIndexVersion {
  version: string;
  files?: Array<string | HttpIndexLegacyFile>;
  assets?: HttpIndexAsset[];
}

export interface ChannelInfo {
  latest: string;
  versions: string[];
}

export interface HttpIndexFile {
  versions: HttpIndexVersion[];
  channels?: Record<string, ChannelInfo>;
}

interface VersionCacheEntry {
  versions: Version[];
  timestamp: number;
}

export class HttpIndexPackageSource implements PackageSource {
  readonly type = 'http-index' as const;
  private config: HttpIndexConfig;
  private cache: Map<string, VersionCacheEntry>;
  private readonly cacheTtl = 60 * 60 * 1000;

  constructor(config: HttpIndexConfig) {
    this.config = config;
    this.cache = new Map();
  }

  async listAvailableVersions(): Promise<Version[]> {
    try {
      log.info('[HttpIndexSource] Fetching index from:', this.config.indexUrl);

      const cacheKey = this.getCacheKey();
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
        log.info('[HttpIndexSource] Using cached versions');
        return cached.versions;
      }

      const response = await axios.get<HttpIndexFile>(this.config.indexUrl, {
        headers: { Accept: 'application/json' },
        timeout: 30000,
      });

      if (response.status !== 200) {
        throw new Error(`HTTP server returned status ${response.status}`);
      }

      const indexData = response.data;
      this.assertIndexShape(indexData);

      const currentPlatform = this.getCurrentPlatform();
      const latestVersionSet = this.buildLatestVersionSet(indexData.channels);
      const versions: Version[] = [];

      for (const versionEntry of indexData.versions) {
        for (const asset of this.normalizeVersionAssets(versionEntry)) {
          if (!this.isInstallablePackageAsset(asset.name)) {
            continue;
          }

          const platform = this.extractPlatformFromFilename(asset.name);
          if (!platform || platform !== currentPlatform) {
            continue;
          }

          const directUrl = this.resolveAssetUrl(asset);
          const assetKind = this.detectAssetKind(asset.name, versionEntry.version, latestVersionSet);
          const hybrid = this.buildHybridMetadata(asset, directUrl, assetKind);

          versions.push({
            id: asset.name.replace(/\.zip$/, ''),
            version: versionEntry.version,
            platform,
            packageFilename: asset.name,
            releasedAt: asset.lastModified || new Date().toISOString(),
            size: asset.size,
            downloadUrl: directUrl,
            sourceType: 'http-index',
            assetKind,
            hybrid,
          });
        }
      }

      if (indexData.channels) {
        for (const [channelName, channelInfo] of Object.entries(indexData.channels)) {
          for (const versionStr of channelInfo.versions) {
            versions.filter((version) => version.version === versionStr).forEach((version) => {
              version.channel = channelName;
            });
          }
        }
      } else {
        versions.forEach((version) => {
          version.channel = 'beta';
        });
      }

      versions.sort((a, b) => this.compareVersions(b.version, a.version));

      this.cache.set(cacheKey, {
        versions,
        timestamp: Date.now(),
      });

      return versions;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 404) {
          throw new Error(`Index file not found at ${this.config.indexUrl}. Please check the URL is correct and accessible.`);
        }
        if (status === 401 || status === 403) {
          throw new Error('Authentication failed. Please check your authentication token.');
        }
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          throw new Error('Failed to connect to the server. Please check your internet connection.');
        }
      }

      log.error('[HttpIndexSource] Failed to fetch index:', error);
      throw error;
    }
  }

  async downloadPackage(version: Version, cachePath: string, onProgress?: DownloadProgressCallback): Promise<void> {
    try {
      if (!version.downloadUrl) {
        throw new Error(`No download URL available for version: ${version.id}`);
      }

      const response = await axios.get<ArrayBuffer>(version.downloadUrl, {
        responseType: 'arraybuffer',
        onDownloadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const current = progressEvent.loaded;
            const total = progressEvent.total;
            const percentage = Math.round((current / total) * 100);
            onProgress({
              current,
              total,
              percentage,
              stage: 'downloading',
              mode: 'http-direct',
              p2pBytes: 0,
              fallbackBytes: current,
              peers: 0,
              message: version.hybrid?.legacyHttpFallback ? 'legacy-http-fallback' : 'direct-http',
            });
          }
        },
      });

      await fs.writeFile(cachePath, Buffer.from(response.data));
    } catch (error) {
      log.error('[HttpIndexSource] Failed to download package:', error);
      throw error;
    }
  }

  async validateConfig(): Promise<PackageSourceValidationResult> {
    try {
      if (!this.config.indexUrl || this.config.indexUrl.trim() === '') {
        return { valid: false, error: 'Index URL is required' };
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(this.config.indexUrl);
      } catch {
        return { valid: false, error: 'Invalid index URL format' };
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return { valid: false, error: 'Index URL must use http or https' };
      }

      const response = await axios.get<HttpIndexFile>(this.config.indexUrl, {
        headers: { Accept: 'application/json' },
        timeout: 10000,
        validateStatus: (status) => status < 500,
      });

      if (response.status === 404) {
        return { valid: false, error: 'Index file not found' };
      }
      if (response.status === 401 || response.status === 403) {
        return { valid: false, error: 'Authentication failed' };
      }
      if (response.status !== 200) {
        return { valid: false, error: `Server returned status ${response.status}` };
      }

      this.assertIndexShape(response.data);
      return { valid: true };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          return { valid: false, error: 'Failed to connect to server' };
        }
        if (error.code === 'ETIMEDOUT') {
          return { valid: false, error: 'Connection timed out' };
        }
      }

      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  clearCache(): void {
    this.cache.delete(this.getCacheKey());
  }

  private getCacheKey(): string {
    return this.config.indexUrl;
  }

  private assertIndexShape(indexData: HttpIndexFile | undefined): asserts indexData is HttpIndexFile {
    if (!indexData || !Array.isArray(indexData.versions)) {
      throw new Error('Invalid index file format: missing or invalid versions array');
    }

    for (const versionEntry of indexData.versions) {
      const hasAssets = Array.isArray(versionEntry?.assets);
      const hasFiles = Array.isArray(versionEntry?.files);
      if (!versionEntry || typeof versionEntry.version !== 'string' || (!hasAssets && !hasFiles)) {
        throw new Error('Invalid index file format');
      }
      for (const asset of this.normalizeVersionAssets(versionEntry)) {
        if (!asset || typeof asset.name !== 'string') {
          throw new Error('Invalid index file format');
        }
        if (asset.webSeeds && !Array.isArray(asset.webSeeds)) {
          throw new Error('Invalid index file format');
        }
      }
    }

    if (!indexData.channels) {
      return;
    }

    for (const [channelName, channelInfo] of Object.entries(indexData.channels)) {
      if (!channelInfo.latest || !Array.isArray(channelInfo.versions)) {
        throw new Error(`Invalid channel structure for '${channelName}'`);
      }
    }
  }

  private buildLatestVersionSet(channels?: Record<string, ChannelInfo>): Set<string> {
    const latestVersions = new Set<string>();
    if (!channels) {
      return latestVersions;
    }

    Object.values(channels).forEach((channelInfo) => {
      if (channelInfo.latest) {
        latestVersions.add(channelInfo.latest);
      }
    });

    return latestVersions;
  }

  private resolveAssetUrl(asset: HttpIndexAsset): string {
    if (asset.directUrl) {
      return new URL(asset.directUrl, this.config.indexUrl).toString();
    }

    if (asset.path) {
      return new URL(asset.path, this.config.indexUrl).toString();
    }

    throw new Error(`Cannot resolve download URL for asset: ${asset.name}`);
  }

  private resolveOptionalUrl(urlValue?: string): string | undefined {
    if (!urlValue) {
      return undefined;
    }

    return new URL(urlValue, this.config.indexUrl).toString();
  }

  private normalizeVersionAssets(versionEntry: HttpIndexVersion): HttpIndexAsset[] {
    if (Array.isArray(versionEntry.assets) && versionEntry.assets.length > 0) {
      return versionEntry.assets;
    }

    if (!Array.isArray(versionEntry.files)) {
      return [];
    }

    return versionEntry.files.map((fileEntry) => this.normalizeLegacyFile(fileEntry));
  }

  private normalizeLegacyFile(fileEntry: string | HttpIndexLegacyFile): HttpIndexAsset {
    if (typeof fileEntry === 'string') {
      return {
        name: this.extractNameFromPath(fileEntry),
        path: fileEntry,
      };
    }

    const fallbackPath = fileEntry.path ?? fileEntry.directUrl;
    return {
      name: fileEntry.name ?? this.extractNameFromPath(fallbackPath),
      path: fileEntry.path,
      size: fileEntry.size,
      lastModified: fileEntry.lastModified,
      directUrl: fileEntry.directUrl,
    };
  }

  private extractNameFromPath(pathValue?: string): string {
    if (!pathValue) {
      throw new Error('Invalid index file format');
    }

    try {
      const url = new URL(pathValue, this.config.indexUrl);
      const segments = url.pathname.split('/').filter(Boolean);
      const name = segments.at(-1);
      if (name) {
        return name;
      }
    } catch {
      const segments = pathValue.split('/').filter(Boolean);
      const name = segments.at(-1);
      if (name) {
        return name;
      }
    }

    throw new Error('Invalid index file format');
  }

  private isInstallablePackageAsset(filename: string): boolean {
    return filename.toLowerCase().endsWith('.zip');
  }

  private buildHybridMetadata(asset: HttpIndexAsset, directUrl: string, assetKind: VersionAssetKind): HybridDistributionMetadata {
    const webSeeds = Array.isArray(asset.webSeeds)
      ? asset.webSeeds
        .map((seed) => this.resolveOptionalUrl(seed))
        .filter((seed): seed is string => Boolean(seed))
      : [];

    if (directUrl && !webSeeds.includes(directUrl)) {
      webSeeds.push(directUrl);
    }

    const torrentUrl = this.resolveOptionalUrl(asset.torrentUrl);
    const hasTorrentMetadata = Boolean(torrentUrl || asset.infoHash);
    const isLatestDesktopAsset = assetKind === 'desktop-latest';
    const isLatestWebAsset = assetKind === 'web-latest';
    const serviceScope = isLatestDesktopAsset
      ? 'latest-desktop'
      : isLatestWebAsset
        ? 'latest-server'
        : 'local-cache';

    return {
      torrentUrl,
      infoHash: asset.infoHash,
      webSeeds,
      sha256: asset.sha256,
      directUrl,
      hasTorrentMetadata,
      torrentFirst: hasTorrentMetadata,
      eligible: hasTorrentMetadata,
      legacyHttpFallback: !hasTorrentMetadata,
      thresholdBytes: HYBRID_THRESHOLD_BYTES,
      assetKind,
      isLatestDesktopAsset,
      isLatestWebAsset,
      serviceScope,
    };
  }

  private detectAssetKind(filename: string, version: string, latestVersionSet: Set<string>): VersionAssetKind {
    const lower = filename.toLowerCase();
    const isLatest = latestVersionSet.has(version);
    const isWebAsset = lower.includes('web') || lower.includes('deploy');
    const isDesktopAsset = lower.startsWith('hagicode-') || lower.includes('portable') || lower.includes('-nort');

    if (isWebAsset && isLatest) {
      return 'web-latest';
    }
    if (isDesktopAsset && isLatest) {
      return 'desktop-latest';
    }
    if (isWebAsset) {
      return 'web-package';
    }
    if (isDesktopAsset) {
      return 'desktop-package';
    }
    return 'generic';
  }

  private extractPlatformFromFilename(filename: string): string | null {
    const newFormatMatch = filename.match(/^hagicode-([0-9]\.[0-9](?:\.[0-9])?(?:-[a-zA-Z0-9\.]+)?)-(linux-x64|linux-arm64|win-x64|osx-x64|osx-arm64)-nort\.zip$/);
    if (newFormatMatch) {
      return newFormatMatch[2];
    }

    const oldFormatMatch = filename.match(/^hagicode-([0-9]\.[0-9](?:\.[0-9])?(?:-[a-zA-Z0-9\.]+)?)-(linux|osx|windows|win)-x64(-nort)?\.zip$/);
    if (oldFormatMatch) {
      const platform = oldFormatMatch[2];
      if (platform === 'win') return 'win-x64';
      if (platform === 'linux') return 'linux-x64';
      if (platform === 'osx') return 'osx-x64';
      return platform;
    }

    const webArchiveMatch = filename.match(/(linux-x64|linux-arm64|win-x64|osx-x64|osx-arm64)/);
    if (webArchiveMatch) {
      return webArchiveMatch[1];
    }

    return null;
  }

  private getCurrentPlatform(): string {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'linux') {
      return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
    }
    if (platform === 'win32') {
      return 'win-x64';
    }
    if (platform === 'darwin') {
      return arch === 'arm64' ? 'osx-arm64' : 'osx-x64';
    }

    return 'unknown';
  }

  private compareVersions(v1: string, v2: string): number {
    const parseVersion = (version: string) => {
      const [versionPart, prereleasePart] = version.split('-');
      return {
        parts: versionPart.split('.').map(Number),
        prerelease: prereleasePart ? prereleasePart.split('.') : [],
      };
    };

    const left = parseVersion(v1);
    const right = parseVersion(v2);

    for (let index = 0; index < Math.max(left.parts.length, right.parts.length); index += 1) {
      const leftValue = left.parts[index] || 0;
      const rightValue = right.parts[index] || 0;
      if (leftValue !== rightValue) {
        return leftValue > rightValue ? 1 : -1;
      }
    }

    if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1;
    if (left.prerelease.length > 0 && right.prerelease.length === 0) return -1;

    for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index += 1) {
      const leftId = left.prerelease[index] || '';
      const rightId = right.prerelease[index] || '';
      if (leftId === rightId) {
        continue;
      }
      const leftNumeric = Number.parseInt(leftId, 10);
      const rightNumeric = Number.parseInt(rightId, 10);
      if (!Number.isNaN(leftNumeric) && !Number.isNaN(rightNumeric)) {
        return leftNumeric > rightNumeric ? 1 : -1;
      }
      return leftId > rightId ? 1 : -1;
    }

    return 0;
  }
}
