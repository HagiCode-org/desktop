export type VersionAssetKind = 'desktop-package' | 'desktop-latest' | 'web-package' | 'web-latest' | 'generic';

export type VersionDownloadMode = 'http-direct' | 'shared-acceleration' | 'source-fallback';

export type SharingAccelerationServiceScope = 'latest-desktop' | 'latest-server' | 'local-cache';

export type VersionDownloadMessage =
  | 'direct-http'
  | 'fetching-torrent-metadata'
  | 'torrent-metadata-ready'
  | 'torrent-first-started'
  | 'shared-acceleration-active'
  | 'source-fallback-active'
  | 'torrent-unavailable-fallback'
  | 'portable-mode-http-fallback'
  | 'legacy-http-fallback'
  | 'no-sha256-required'
  | 'sha256-verifying'
  | 'sha256-verified'
  | 'extracting-package'
  | 'installation-complete';

export type VersionInstallStage =
  | 'queued'
  | 'fetching-torrent'
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
  hasTorrentMetadata: boolean;
  torrentFirst: boolean;
  eligible: boolean;
  legacyHttpFallback: boolean;
  thresholdBytes: number;
  assetKind: VersionAssetKind;
  isLatestDesktopAsset: boolean;
  isLatestWebAsset: boolean;
  serviceScope: SharingAccelerationServiceScope;
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
  message?: VersionDownloadMessage | string;
  peers?: number;
  p2pBytes?: number;
  fallbackBytes?: number;
  verified?: boolean;
  serviceScope?: SharingAccelerationServiceScope;
}

export interface HybridDownloadPolicy {
  useHybrid: boolean;
  preferTorrent: boolean;
  reason:
    | 'shared-enabled'
    | 'shared-disabled'
    | 'portable-mode'
    | 'not-http-index'
    | 'not-eligible'
    | 'legacy-http'
    | 'latest-only';
  thresholdBytes: number;
  serviceScope: SharingAccelerationServiceScope;
  seedEligible: boolean;
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
  assetKind: VersionAssetKind;
  serviceScope: SharingAccelerationServiceScope;
  seedEligible: boolean;
  verifiedAt: string;
  lastUsedAt: string;
  expiresAt: string;
  seeding: boolean;
}
