import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import log from 'electron-log';
import type { DownloadProgressCallback, PackageSource } from '../package-sources/package-source.js';
import type { Version } from '../version-manager.js';
import type { HybridDownloadPolicy, SharingAccelerationSettings } from '../../types/sharing-acceleration.js';
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

  async prepare(settings: SharingAccelerationSettings): Promise<void> {
    if (!settings.enabled) {
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
    const policy = this.policyEvaluator.evaluate(version, settings, {
      distributionMode: options?.distributionMode,
    });
    await this.prepare(settings);

    if (policy.useHybrid) {
      await this.engine.download(version, cachePath, settings, onProgress);
    } else {
      await packageSource.downloadPackage(version, cachePath, onProgress);
    }

    const verified = await this.verify(version, cachePath, onProgress);
    const cacheSize = (await fsPromises.stat(cachePath)).size;
    await this.cacheRetentionManager.markTrusted({
      versionId: version.id,
      cachePath,
      cacheSize,
    }, settings);

    return {
      cachePath,
      policy,
      verified,
    };
  }

  async verify(version: Version, cachePath: string, onProgress?: DownloadProgressCallback): Promise<boolean> {
    if (!version.hybrid?.sha256) {
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
      mode: 'source-fallback',
      verified: false,
      message: 'sha256-verifying',
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
      mode: 'source-fallback',
      verified: true,
      message: 'sha256-verified',
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
