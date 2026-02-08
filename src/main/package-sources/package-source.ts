import type { Version } from '../version-manager.js';

/**
 * Package source configuration types
 */
export type PackageSourceType = 'local-folder' | 'github-release' | 'http-index';

/**
 * Base interface for package source configuration
 */
export interface PackageSourceConfig {
  type: PackageSourceType;
}

/**
 * Local folder source configuration
 */
export interface LocalFolderConfig extends PackageSourceConfig {
  type: 'local-folder';
  path: string;
}

/**
 * GitHub Releases source configuration
 */
export interface GitHubReleaseConfig extends PackageSourceConfig {
  type: 'github-release';
  owner: string;
  repo: string;
  token?: string;
}

/**
 * HTTP Index source configuration
 */
export interface HttpIndexConfig extends PackageSourceConfig {
  type: 'http-index';
  indexUrl: string;
}

/**
 * Validation result for package source configuration
 */
export interface PackageSourceValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Download progress callback type
 */
export type DownloadProgressCallback = (progress: {
  current: number;
  total: number;
  percentage: number;
}) => void;

/**
 * Abstract interface for package sources
 * All package source implementations must implement this interface
 */
export interface PackageSource {
  /**
   * Get the type identifier for this package source
   */
  readonly type: PackageSourceType;

  /**
   * List all available versions from this source
   * Returns a filtered list of versions compatible with the current platform
   */
  listAvailableVersions(): Promise<Version[]>;

  /**
   * Download a package to the specified cache path
   * @param version - The version to download
   * @param cachePath - The destination path for the cached package
   * @param onProgress - Optional callback for download progress updates
   */
  downloadPackage(
    version: Version,
    cachePath: string,
    onProgress?: DownloadProgressCallback
  ): Promise<void>;

  /**
   * Validate the current configuration
   * @returns Validation result with optional error message
   */
  validateConfig?(): Promise<PackageSourceValidationResult>;
}
