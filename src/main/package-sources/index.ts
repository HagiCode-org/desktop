import type {
  PackageSource,
  PackageSourceConfig,
  PackageSourceType,
  LocalFolderConfig,
  HttpIndexConfig,
  PackageSourceValidationResult,
  DownloadProgressCallback,
  SharingAccelerationSettings,
  SharingAccelerationSettingsInput,
  SharingAccelerationSettingsUpdate,
} from './package-source.js';
import { LocalFolderPackageSource } from './local-folder-source.js';
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

    case 'http-index':
      return new HttpIndexPackageSource(config as HttpIndexConfig);

    default:
      throw new Error(`Unknown package source type: ${(config as { type?: string }).type ?? 'undefined'}`);
  }
}

/**
 * Export all package source types and utilities
 */
export {
  PackageSource,
  LocalFolderPackageSource,
  HttpIndexPackageSource,
};

export type {
  PackageSourceConfig,
  PackageSourceType,
  LocalFolderConfig,
  HttpIndexConfig,
  PackageSourceValidationResult,
  DownloadProgressCallback,
  SharingAccelerationSettings,
  SharingAccelerationSettingsInput,
  SharingAccelerationSettingsUpdate,
};
