export type VersionAssetKind = 'desktop-package' | 'desktop-latest' | 'web-package' | 'web-latest' | 'generic';

export type VersionDownloadMode = 'http-direct' | 'shared-acceleration' | 'source-fallback';

export type VersionInstallStage =
  | 'queued'
  | 'downloading'
  | 'backfilling'
  | 'verifying'
  | 'extracting'
  | 'completed'
  | 'error';

export interface HybridDistributionMetadata {
  torrentUrl?: string;
  infoHash?: string;
  webSeeds: string[];
  sha256?: string;
  directUrl?: string;
  eligible: boolean;
  legacyHttpFallback: boolean;
  thresholdBytes: number;
  assetKind: VersionAssetKind;
  isLatestDesktopAsset: boolean;
  isLatestWebAsset: boolean;
}

export interface SharingAccelerationSettings {
  enabled: boolean;
  uploadLimitMbps: number;
  cacheLimitGb: number;
  retentionDays: number;
  hybridThresholdMb: number;
  onboardingChoiceRecorded: boolean;
}

export interface SharingAccelerationSettingsInput {
  enabled: boolean;
  uploadLimitMbps: number;
  cacheLimitGb: number;
  retentionDays: number;
}

export interface SharingAccelerationSettingsUpdate extends Partial<SharingAccelerationSettingsInput> {
  enabled?: boolean;
  onboardingChoiceRecorded?: boolean;
}

export interface VersionDownloadProgress {
  current: number;
  total: number;
  percentage: number;
  stage: VersionInstallStage;
  mode: VersionDownloadMode;
  message?: string;
  peers?: number;
  p2pBytes?: number;
  fallbackBytes?: number;
  verified?: boolean;
}

export interface HybridDownloadPolicy {
  useHybrid: boolean;
  reason:
    | 'shared-enabled'
    | 'shared-disabled'
    | 'portable-mode'
    | 'not-http-index'
    | 'not-eligible'
    | 'legacy-http'
    | 'latest-only';
  thresholdBytes: number;
}

export interface CacheRetentionSummary {
  totalBytes: number;
  removedEntries: string[];
  retainedEntries: string[];
}

export interface TrustedCacheRecord {
  versionId: string;
  cachePath: string;
  cacheSize: number;
  verifiedAt: string;
  lastUsedAt: string;
  expiresAt: string;
  seeding: boolean;
}
