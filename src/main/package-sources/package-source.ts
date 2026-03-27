import type {
  HybridDistributionMetadata,
  SharingAccelerationSettings,
  SharingAccelerationSettingsInput,
  SharingAccelerationSettingsUpdate,
  VersionDownloadMode,
  VersionDownloadProgress,
} from '../../types/sharing-acceleration.js';
import type { Version } from '../version-manager.js';

export type PackageSourceType = 'local-folder' | 'github-release' | 'http-index';

export interface PackageSourceConfig {
  type: PackageSourceType;
}

export interface LocalFolderConfig extends PackageSourceConfig {
  type: 'local-folder';
  path: string;
}

export interface GitHubReleaseConfig extends PackageSourceConfig {
  type: 'github-release';
  owner: string;
  repo: string;
  token?: string;
}

export interface HttpIndexConfig extends PackageSourceConfig {
  type: 'http-index';
  indexUrl: string;
}

export interface PackageSourceValidationResult {
  valid: boolean;
  error?: string;
}

export type DownloadProgressCallback = (progress: VersionDownloadProgress) => void;

export interface DownloadObservation {
  mode: VersionDownloadMode;
  message?: string;
  peers?: number;
  p2pBytes?: number;
  fallbackBytes?: number;
  verified?: boolean;
}

export type DownloadObservationCallback = (observation: DownloadObservation) => void;

export type { HybridDistributionMetadata, SharingAccelerationSettings, SharingAccelerationSettingsInput, SharingAccelerationSettingsUpdate };

export interface PackageSource {
  readonly type: PackageSourceType;

  listAvailableVersions(): Promise<Version[]>;

  downloadPackage(
    version: Version,
    cachePath: string,
    onProgress?: DownloadProgressCallback
  ): Promise<void>;

  validateConfig?(): Promise<PackageSourceValidationResult>;
}
