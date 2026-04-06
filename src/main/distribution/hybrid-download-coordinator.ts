import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import log from 'electron-log';
import type { DownloadProgressCallback, PackageSource } from '../package-sources/package-source.js';
import type { DetectionResult, RegionDetector } from '../region-detector.js';
import type { Version } from '../version-manager.js';
import type {
  HybridDownloadPolicy,
  SharingAccelerationSettings,
  StructuredFallbackSource,
  StructuredFallbackSourceKind,
  VersionDownloadMode,
} from '../../types/sharing-acceleration.js';
import type { DistributionMode } from '../../types/distribution-mode.js';
import { CacheRetentionManager } from './cache-retention-manager.js';
import type { DownloadEngineAdapter } from './download-engine-adapter.js';
import { DistributionPolicyEvaluator } from './distribution-policy-evaluator.js';
import { InProcessTorrentEngineAdapter } from './in-process-torrent-engine-adapter.js';
import { SharingAccelerationSettingsStore } from './sharing-acceleration-store.js';

export interface HybridDownloadResult {
  cachePath: string;
  policy: HybridDownloadPolicy;
  verified: boolean;
  finalMode: VersionDownloadMode;
}

type FallbackRegionBucket = 'CN' | 'INTERNATIONAL' | 'UNKNOWN';
type FallbackSourceKind = StructuredFallbackSourceKind | 'legacy-direct';

interface FallbackSourceAttempt {
  kind: FallbackSourceKind;
  label: string;
  url: string;
}

interface FallbackPlan {
  attempts: FallbackSourceAttempt[];
  regionBucket: FallbackRegionBucket;
  detectionMethod: DetectionResult['method'] | 'unavailable';
  matchedRule: DetectionResult['matchedRule'] | 'unavailable';
}

export class HybridDownloadCoordinator {
  private readonly policyEvaluator: DistributionPolicyEvaluator;
  private readonly settingsStore: SharingAccelerationSettingsStore;
  private readonly engine: DownloadEngineAdapter;
  private readonly cacheRetentionManager: CacheRetentionManager;
  private readonly regionDetector?: Pick<RegionDetector, 'detectWithCache'>;

  constructor(options?: {
    policyEvaluator?: DistributionPolicyEvaluator;
    settingsStore?: SharingAccelerationSettingsStore;
    engine?: DownloadEngineAdapter;
    cacheRetentionManager?: CacheRetentionManager;
    regionDetector?: Pick<RegionDetector, 'detectWithCache'>;
  }) {
    this.policyEvaluator = options?.policyEvaluator ?? new DistributionPolicyEvaluator();
    this.settingsStore = options?.settingsStore ?? new SharingAccelerationSettingsStore();
    // V1 uses an in-process adapter and keeps the helper-process boundary behind DownloadEngineAdapter.
    this.engine = options?.engine ?? new InProcessTorrentEngineAdapter();
    this.cacheRetentionManager = options?.cacheRetentionManager ?? new CacheRetentionManager();
    this.regionDetector = options?.regionDetector;
  }

  getSettingsStore(): SharingAccelerationSettingsStore {
    return this.settingsStore;
  }

  getCacheRetentionManager(): CacheRetentionManager {
    return this.cacheRetentionManager;
  }

  async prepare(settings: SharingAccelerationSettings, distributionMode?: DistributionMode): Promise<void> {
    if (!settings.enabled || distributionMode === 'steam') {
      await this.cacheRetentionManager.stopAllSeeding();
      await this.engine.stopAll();
    }
    await this.cacheRetentionManager.prune(settings);
  }

  async download(
    version: Version,
    cachePath: string,
    packageSource: PackageSource,
    onProgress?: DownloadProgressCallback,
    options?: {
      settings?: SharingAccelerationSettings;
      distributionMode?: DistributionMode;
    },
  ): Promise<HybridDownloadResult> {
    const settings = options?.settings ?? this.settingsStore.getSettings();
    const distributionMode = options?.distributionMode;
    const policy = this.policyEvaluator.evaluate(version, settings, {
      distributionMode,
    });
    await this.prepare(settings, distributionMode);
    let finalMode: VersionDownloadMode = policy.useHybrid ? 'shared-acceleration' : 'http-direct';

    if (policy.useHybrid) {
      try {
        await this.engine.download(version, cachePath, settings, onProgress);
      } catch (error) {
        log.warn('[HybridDownloadCoordinator] Torrent-first failed, falling back to HTTP/WebSeed:', {
          versionId: version.id,
          error: error instanceof Error ? error.message : String(error),
        });
        finalMode = 'source-fallback';
        onProgress?.({
          current: 0,
          total: version.size ?? 0,
          percentage: 0,
          stage: 'backfilling',
          mode: 'source-fallback',
          message: 'torrent-unavailable-fallback',
          serviceScope: policy.serviceScope,
        });
        await this.downloadViaHttpSources(
          version,
          cachePath,
          packageSource,
          policy,
          this.createSourceFallbackProgress(version, policy.serviceScope, onProgress),
          'torrent-first failed',
        );
      }
    } else {
      if (distributionMode === 'steam') {
        onProgress?.({
          current: 0,
          total: version.size ?? 0,
          percentage: 0,
          stage: 'backfilling',
          mode: 'source-fallback',
          message: 'portable-mode-http-fallback',
          serviceScope: policy.serviceScope,
        });
      }
      const hasStructuredFallbackSources = this.hasStructuredFallbackSources(version);
      const preferStructuredFallback = this.hasMultipleStructuredFallbackSources(version);
      const useSourceFallbackMode = distributionMode === 'steam' || preferStructuredFallback;
      if (hasStructuredFallbackSources || useSourceFallbackMode) {
        await this.downloadViaHttpSources(
          version,
          cachePath,
          packageSource,
          policy,
          useSourceFallbackMode
            ? this.createSourceFallbackProgress(version, policy.serviceScope, onProgress)
            : onProgress,
          distributionMode === 'steam'
            ? 'portable mode skipped torrent'
            : preferStructuredFallback
              ? `policy ${policy.reason}`
              : 'single structured source',
        );
      } else {
        await packageSource.downloadPackage(version, cachePath, onProgress);
      }
      finalMode = useSourceFallbackMode ? 'source-fallback' : finalMode;
    }

    const verified = await this.verify(version, cachePath, finalMode, policy.serviceScope, onProgress);
    const shouldTrackTrustedCache = Boolean(version.hybrid?.hasTorrentMetadata);
    if (shouldTrackTrustedCache) {
      const cacheSize = (await fsPromises.stat(cachePath)).size;
      await this.cacheRetentionManager.markTrusted({
        versionId: version.id,
        cachePath,
        cacheSize,
        assetKind: version.hybrid?.assetKind ?? version.assetKind ?? 'generic',
        serviceScope: policy.serviceScope,
        seedEligible: policy.seedEligible,
      }, settings);
    }

    return {
      cachePath,
      policy,
      verified,
      finalMode,
    };
  }

  async verify(
    version: Version,
    cachePath: string,
    mode: VersionDownloadMode,
    serviceScope: HybridDownloadPolicy['serviceScope'],
    onProgress?: DownloadProgressCallback,
  ): Promise<boolean> {
    if (!version.hybrid?.sha256) {
      onProgress?.({
        current: 0,
        total: 0,
        percentage: 100,
        stage: 'verifying',
        mode,
        verified: true,
        message: 'no-sha256-required',
        serviceScope,
      });
      return true;
    }

    onProgress?.({
      current: 0,
      total: 0,
      percentage: 0,
      stage: 'verifying',
      mode,
      verified: false,
      message: 'sha256-verifying',
      serviceScope,
    });

    const computedHash = await this.computeSha256(cachePath);
    if (computedHash !== version.hybrid.sha256.toLowerCase()) {
      await this.cacheRetentionManager.discard(version.id, cachePath);
      throw new Error(`sha256 verification failed for ${version.id}`);
    }

    onProgress?.({
      current: 0,
      total: 0,
      percentage: 100,
      stage: 'verifying',
      mode,
      verified: true,
      message: 'sha256-verified',
      serviceScope,
    });

    return true;
  }

  async disableSharingAcceleration(): Promise<void> {
    this.settingsStore.updateSettings({ enabled: false });
    await this.stopSharingActivity();
  }

  async stopSharingActivity(): Promise<void> {
    await this.cacheRetentionManager.stopAllSeeding();
    await this.engine.stopAll();
  }

  private createSourceFallbackProgress(
    version: Version,
    serviceScope: HybridDownloadPolicy['serviceScope'],
    onProgress?: DownloadProgressCallback,
  ): DownloadProgressCallback {
    return (progress) => {
      onProgress?.({
        ...progress,
        stage: 'backfilling',
        mode: 'source-fallback',
        message: progress.message === 'direct-http' ? 'source-fallback-active' : progress.message,
        serviceScope,
        total: progress.total || version.size || 0,
      });
    };
  }

  private async downloadViaHttpSources(
    version: Version,
    cachePath: string,
    packageSource: PackageSource,
    policy: HybridDownloadPolicy,
    onProgress: DownloadProgressCallback | undefined,
    trigger: string,
  ): Promise<void> {
    const fallbackPlan = this.buildFallbackPlan(version);
    if (!fallbackPlan || fallbackPlan.attempts.length === 0) {
      await packageSource.downloadPackage(version, cachePath, onProgress);
      return;
    }

    log.info('[HybridDownloadCoordinator] HTTP fallback plan prepared:', {
      versionId: version.id,
      trigger,
      policyReason: policy.reason,
      regionBucket: fallbackPlan.regionBucket,
      detectionMethod: fallbackPlan.detectionMethod,
      matchedRule: fallbackPlan.matchedRule,
      attemptedSources: fallbackPlan.attempts.map((attempt) => ({
        kind: attempt.kind,
        url: attempt.url,
      })),
    });

    let lastError: unknown = null;
    for (const [index, attempt] of fallbackPlan.attempts.entries()) {
      try {
        log.info('[HybridDownloadCoordinator] Attempting HTTP fallback source:', {
          versionId: version.id,
          trigger,
          attempt: index + 1,
          totalAttempts: fallbackPlan.attempts.length,
          sourceKind: attempt.kind,
          url: attempt.url,
        });
        await packageSource.downloadPackage(
          this.withDownloadUrl(version, attempt.url),
          cachePath,
          onProgress,
        );
        return;
      } catch (error) {
        lastError = error;
        log.warn('[HybridDownloadCoordinator] HTTP fallback source failed:', {
          versionId: version.id,
          trigger,
          attempt: index + 1,
          totalAttempts: fallbackPlan.attempts.length,
          sourceKind: attempt.kind,
          url: attempt.url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error(this.formatFallbackFailure(version.id, fallbackPlan, lastError));
  }

  private buildFallbackPlan(version: Version): FallbackPlan | null {
    const explicitSources = this.resolveStructuredFallbackSources(version.hybrid?.downloadSources);
    if (explicitSources.length === 0) {
      return version.downloadUrl
        ? {
            attempts: [{ kind: 'legacy-direct', label: 'legacy-direct', url: version.downloadUrl }],
            regionBucket: 'UNKNOWN',
            detectionMethod: 'unavailable',
            matchedRule: 'unavailable',
          }
        : null;
    }

    if (explicitSources.length === 1) {
      return {
        attempts: explicitSources,
        regionBucket: 'UNKNOWN',
        detectionMethod: 'unavailable',
        matchedRule: 'unavailable',
      };
    }

    const region = this.detectFallbackRegion();
    const preferredKinds: StructuredFallbackSourceKind[] = region.regionBucket === 'INTERNATIONAL'
      ? ['github-release', 'official']
      : ['official', 'github-release'];
    const attempts = preferredKinds
      .map((kind) => explicitSources.find((source) => source.kind === kind))
      .filter((source): source is FallbackSourceAttempt => Boolean(source));

    return {
      attempts,
      regionBucket: region.regionBucket,
      detectionMethod: region.detectionMethod,
      matchedRule: region.matchedRule,
    };
  }

  private resolveStructuredFallbackSources(downloadSources?: StructuredFallbackSource[]): FallbackSourceAttempt[] {
    if (!Array.isArray(downloadSources) || downloadSources.length === 0) {
      return [];
    }

    const selectedByKind = new Map<StructuredFallbackSourceKind, StructuredFallbackSource>();
    for (const source of downloadSources) {
      const current = selectedByKind.get(source.kind);
      if (!current || (!current.primary && source.primary)) {
        selectedByKind.set(source.kind, source);
      }
    }

    return Array.from(selectedByKind.values()).map((source) => ({
      kind: source.kind,
      label: source.label,
      url: source.url,
    }));
  }

  private hasMultipleStructuredFallbackSources(version: Version): boolean {
    return this.resolveStructuredFallbackSources(version.hybrid?.downloadSources).length > 1;
  }

  private hasStructuredFallbackSources(version: Version): boolean {
    return this.resolveStructuredFallbackSources(version.hybrid?.downloadSources).length > 0;
  }

  private detectFallbackRegion(): Pick<FallbackPlan, 'regionBucket' | 'detectionMethod' | 'matchedRule'> {
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
      log.warn('[HybridDownloadCoordinator] Region detection failed during HTTP fallback, defaulting to official-first:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        regionBucket: 'UNKNOWN',
        detectionMethod: 'unavailable',
        matchedRule: 'unavailable',
      };
    }
  }

  private withDownloadUrl(version: Version, downloadUrl: string): Version {
    return {
      ...version,
      downloadUrl,
    };
  }

  private formatFallbackFailure(versionId: string, fallbackPlan: FallbackPlan, lastError: unknown): string {
    const attemptedOrder = fallbackPlan.attempts.map((attempt) => attempt.kind).join(' -> ');
    const terminalReason = lastError instanceof Error ? lastError.message : String(lastError);

    return `All HTTP fallback sources failed for ${versionId}. Attempted order: ${attemptedOrder}. Terminal failure: ${terminalReason}`;
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
