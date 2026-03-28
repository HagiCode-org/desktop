import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import log from 'electron-log';
import type { DownloadProgressCallback, PackageSource } from '../package-sources/package-source.js';
import type { Version } from '../version-manager.js';
import type {
  HybridDownloadPolicy,
  SharingAccelerationSettings,
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

export class HybridDownloadCoordinator {
  private readonly policyEvaluator: DistributionPolicyEvaluator;
  private readonly settingsStore: SharingAccelerationSettingsStore;
  private readonly engine: DownloadEngineAdapter;
  private readonly cacheRetentionManager: CacheRetentionManager;

  constructor(options?: {
    policyEvaluator?: DistributionPolicyEvaluator;
    settingsStore?: SharingAccelerationSettingsStore;
    engine?: DownloadEngineAdapter;
    cacheRetentionManager?: CacheRetentionManager;
  }) {
    this.policyEvaluator = options?.policyEvaluator ?? new DistributionPolicyEvaluator();
    this.settingsStore = options?.settingsStore ?? new SharingAccelerationSettingsStore();
    // V1 uses an in-process adapter and keeps the helper-process boundary behind DownloadEngineAdapter.
    this.engine = options?.engine ?? new InProcessTorrentEngineAdapter();
    this.cacheRetentionManager = options?.cacheRetentionManager ?? new CacheRetentionManager();
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
        await packageSource.downloadPackage(
          version,
          cachePath,
          this.createSourceFallbackProgress(version, policy.serviceScope, onProgress),
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
      await packageSource.downloadPackage(
        version,
        cachePath,
        policy.preferTorrent
          ? this.createSourceFallbackProgress(version, policy.serviceScope, onProgress)
          : onProgress,
      );
      finalMode = distributionMode === 'steam' ? 'source-fallback' : finalMode;
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
