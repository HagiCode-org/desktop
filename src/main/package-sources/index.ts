import type { PackageSource, PackageSourceConfig, LocalFolderConfig, GitHubReleaseConfig, HttpIndexConfig, PackageSourceValidationResult, DownloadProgressCallback } from './package-source.js';
import { LocalFolderPackageSource } from './local-folder-source.js';
import { GitHubReleasePackageSource } from './github-release-source.js';
import { HttpIndexPackageSource } from './http-index-source.js';

/**
 * Factory function to create package source instances
 * @param config - Package source configuration
 * @returns Package source instance
 */
export function createPackageSource(config: PackageSourceConfig): PackageSource {
  switch (config.type) {
    case 'local-folder':
      return new LocalFolderPackageSource(config as LocalFolderConfig);

    case 'github-release':
      return new GitHubReleasePackageSource(config as GitHubReleaseConfig);

    case 'http-index':
      return new HttpIndexPackageSource(config as HttpIndexConfig);

    default:
      throw new Error(`Unknown package source type: ${(config as any).type}`);
  }
}

/**
 * Export all package source types and utilities
 */
export {
  PackageSource,
  LocalFolderPackageSource,
  GitHubReleasePackageSource,
  HttpIndexPackageSource,
};

export type {
  PackageSourceConfig,
  LocalFolderConfig,
  GitHubReleaseConfig,
  HttpIndexConfig,
  PackageSourceValidationResult,
  DownloadProgressCallback,
};
