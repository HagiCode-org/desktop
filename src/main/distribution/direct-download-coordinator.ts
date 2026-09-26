import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import log from 'electron-log';
import type { DownloadProgressCallback, PackageSource } from '../package-sources/package-source.js';
import type { DetectionResult, RegionDetector } from '../region-detector.js';
import type { DownloadSource, DownloadSourceKind, VersionDownloadMode } from '../../types/version-download.js';
import type { ServiceRegion } from '../../types/service-region.js';
import type { Version } from '../version-manager.js';

type RegionBucket = 'CN' | 'INTERNATIONAL' | 'UNKNOWN';
type AttemptKind = DownloadSourceKind | 'legacy-direct';

interface SourceAttempt {
  kind: AttemptKind;
  label: string;
  url: string;
}

interface SourcePlan {
  attempts: SourceAttempt[];
  regionBucket: RegionBucket;
  detectionMethod: DetectionResult['method'] | 'service-region' | 'unavailable';
  matchedRule: DetectionResult['matchedRule'] | 'service-region' | 'unavailable';
}

export interface DirectDownloadResult {
  cachePath: string;
  verified: boolean;
  finalMode: VersionDownloadMode;
}

export class DirectDownloadCoordinator {
  private readonly regionDetector?: Pick<RegionDetector, 'detectWithCache'>;
  private readonly serviceRegionProvider?: () => ServiceRegion | undefined;

  constructor(options?: {
    regionDetector?: Pick<RegionDetector, 'detectWithCache'>;
    serviceRegionProvider?: () => ServiceRegion | undefined;
  }) {
    this.regionDetector = options?.regionDetector;
    this.serviceRegionProvider = options?.serviceRegionProvider;
  }

  async download(
    version: Version,
    cachePath: string,
    packageSource: PackageSource,
    onProgress?: DownloadProgressCallback,
  ): Promise<DirectDownloadResult> {
    let finalMode: VersionDownloadMode = 'http-direct';
    if (packageSource.type === 'http-index') {
      finalMode = await this.downloadFromHttpSources(version, cachePath, packageSource, onProgress);
    } else {
      await packageSource.downloadPackage(version, cachePath, onProgress);
    }

    const verified = await this.verify(version, cachePath, onProgress);
    return { cachePath, verified, finalMode };
  }

  async verify(version: Version, cachePath: string, onProgress?: DownloadProgressCallback): Promise<boolean> {
    if (!version.sha256) {
      onProgress?.({
        current: 0,
        total: 0,
        percentage: 100,
        stage: 'verifying',
        mode: 'http-direct',
        verified: true,
        message: 'no-sha256-required',
      });
      return true;
    }

    onProgress?.({
      current: 0,
      total: 0,
      percentage: 0,
      stage: 'verifying',
      mode: 'http-direct',
      verified: false,
      message: 'sha256-verifying',
    });

    const computedHash = await this.computeSha256(cachePath);
    if (computedHash !== version.sha256.toLowerCase()) {
      await fsPromises.rm(cachePath, { force: true });
      throw new Error(`sha256 verification failed for ${version.id}`);
    }

    onProgress?.({
      current: 0,
      total: 0,
      percentage: 100,
      stage: 'verifying',
      mode: 'http-direct',
      verified: true,
      message: 'sha256-verified',
    });
    return true;
  }

  private async downloadFromHttpSources(
    version: Version,
    cachePath: string,
    packageSource: PackageSource,
    onProgress?: DownloadProgressCallback,
  ): Promise<VersionDownloadMode> {
    const plan = this.buildSourcePlan(version);
    if (plan.attempts.length === 0) {
      throw new Error(`No direct download URL available for version: ${version.id}`);
    }

    log.info('[DirectDownloadCoordinator] Source plan prepared:', {
      versionId: version.id,
      regionBucket: plan.regionBucket,
      detectionMethod: plan.detectionMethod,
      matchedRule: plan.matchedRule,
      sources: plan.attempts.map(({ kind, url }) => ({ kind, url })),
    });

    const failures: Array<{ source: SourceAttempt; reason: string }> = [];
    for (const [index, source] of plan.attempts.entries()) {
      await fsPromises.rm(cachePath, { force: true });
      try {
        const useFallbackProgress = index > 0;
        await packageSource.downloadPackage(
          { ...version, downloadUrl: source.url },
          cachePath,
          useFallbackProgress
            ? (progress) => onProgress?.({
                ...progress,
                mode: 'source-fallback',
                message: 'source-fallback-active',
                total: progress.total || version.size || 0,
              })
            : onProgress,
        );
        return index > 0 ? 'source-fallback' : 'http-direct';
      } catch (error) {
        await fsPromises.rm(cachePath, { force: true });
        const reason = error instanceof Error ? error.message : String(error);
        failures.push({ source, reason });
        log.warn('[DirectDownloadCoordinator] Direct source failed:', {
          versionId: version.id,
          attempt: index + 1,
          totalAttempts: plan.attempts.length,
          sourceKind: source.kind,
          url: source.url,
          error: reason,
        });
      }
    }

    const details = failures.map(({ source, reason }) => `${source.label} (${source.url}): ${reason}`).join('; ');
    throw new Error(`All direct download sources failed for ${version.id}. ${details}`);
  }

  private buildSourcePlan(version: Version): SourcePlan {
    const region = this.detectRegion();
    const sources = this.uniqueSources(version.downloadSources ?? []);
    const official = sources.find((source) => source.kind === 'official');
    const regionalUrl = region.regionBucket === 'CN'
      ? official?.urls?.china
      : region.regionBucket === 'INTERNATIONAL'
        ? official?.urls?.international
        : undefined;
    const selected = regionalUrl
      ? sources.map((source) => source.kind === 'official' ? { ...source, url: regionalUrl } : source)
      : sources;
    const preferredKinds: Array<DownloadSourceKind | 'legacy-direct'> = region.regionBucket === 'INTERNATIONAL'
      ? ['github-release', 'official', 'legacy-direct', 'cloudflare']
      : ['official', 'legacy-direct', 'github-release', 'cloudflare'];
    const knownUrls = new Set(sources.map((source) => source.url.toLowerCase()));
    const includeLegacyDirect = Boolean(version.downloadUrl && !knownUrls.has(version.downloadUrl.toLowerCase()));
    const attemptedUrls = new Set<string>();
    const attempts: SourceAttempt[] = [];
    for (const kind of preferredKinds) {
      const candidates = kind === 'legacy-direct'
        ? includeLegacyDirect && version.downloadUrl
          ? [{ kind, label: 'Direct download', url: version.downloadUrl }]
          : []
        : selected
          .filter((source) => source.kind === kind)
          .sort((left, right) => Number(right.primary) - Number(left.primary));
      for (const source of candidates) {
        const key = source.url.toLowerCase();
        if (!attemptedUrls.has(key)) {
          attemptedUrls.add(key);
          attempts.push({ kind: source.kind, label: source.label, url: source.url });
        }
      }
    }

    return { ...region, attempts };
  }

  private uniqueSources(sources: DownloadSource[]): DownloadSource[] {
    const seenUrls = new Set<string>();
    return sources.filter((source) => {
      const key = source.url.toLowerCase();
      if (seenUrls.has(key)) {
        return false;
      }
      seenUrls.add(key);
      return true;
    });
  }

  private detectRegion(): Omit<SourcePlan, 'attempts'> {
    try {
      const serviceRegion = this.serviceRegionProvider?.();
      if (serviceRegion) {
        return {
          regionBucket: serviceRegion,
          detectionMethod: 'service-region',
          matchedRule: 'service-region',
        };
      }
    } catch (error) {
      log.warn('[DirectDownloadCoordinator] Effective service-region lookup failed; using locale fallback:', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (!this.regionDetector) {
      return {
        regionBucket: 'UNKNOWN',
        detectionMethod: 'unavailable',
        matchedRule: 'unavailable',
      };
    }

    try {
      const detection = this.regionDetector.detectWithCache();
      if (detection.matchedRule === 'error-fallback') {
        return {
          regionBucket: 'UNKNOWN',
          detectionMethod: detection.method,
          matchedRule: detection.matchedRule,
        };
      }
      return {
        regionBucket: detection.region,
        detectionMethod: detection.method,
        matchedRule: detection.matchedRule,
      };
    } catch (error) {
      log.warn('[DirectDownloadCoordinator] Region detection failed; using official-first ordering:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        regionBucket: 'UNKNOWN',
        detectionMethod: 'unavailable',
        matchedRule: 'unavailable',
      };
    }
  }

  private async computeSha256(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    return hash.digest('hex').toLowerCase();
  }
}
