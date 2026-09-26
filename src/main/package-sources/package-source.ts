import type { VersionDownloadMode, VersionDownloadProgress } from '../../types/version-download.js';
import type { Version } from '../version-manager.js';

export type PackageSourceType = 'local-folder' | 'http-index';

export interface LocalFolderConfig {
  type: 'local-folder';
  path: string;
}

export interface HttpIndexConfig {
  type: 'http-index';
  indexUrl: string;
}

export type PackageSourceConfig = LocalFolderConfig | HttpIndexConfig;

export interface PackageSourceValidationResult {
  valid: boolean;
  error?: string;
}

export type DownloadProgressCallback = (progress: VersionDownloadProgress) => void;

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
