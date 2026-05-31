import type { StorePackageConfig } from './store-package-config.js';

export interface EffectiveStoreConfig {
  storeConfig: StorePackageConfig;
  storeConfigPath: string;
  overlayConfig: Record<string, unknown> | null;
  overlayPath: string | null;
}

export interface MsixPaths {
  manifestTemplatePath: string;
  manifestOutputPath: string;
  defaultAssetsPath: string;
  customAssetsPath: string;
  generatedAssetsPath: string;
}

export interface MsixSigningConfig {
  sign: boolean;
  windowsSignOptions?: {
    certificateFile: string;
    certificatePassword: string;
  };
}

export interface MsixManifestConfig {
  packageIdentity: string;
  packageDisplayName: string;
  packageDescription: string;
  packageVersion: string;
  publisher: string;
  publisherDisplayName: string;
  packageBackgroundColor: string;
  packageMinOsVersion: string;
  packageMaxOsVersionTested: string;
  processorArchitecture: string;
  appExecutable: string;
  appDisplayName: string;
  languages: string[];
  capabilities: string[];
}

export function loadEffectiveStoreConfig(projectRoot?: string): EffectiveStoreConfig;
export function normalizeWindowsVersion(version: string): string;
export function mapNodeArchToMsixArch(arch: string): string;
export function getMsixPaths(projectRoot?: string): MsixPaths;
export function resolveMsixSigningConfig(projectRoot?: string): MsixSigningConfig;
export function resolveMsixManifestConfig(options: {
  projectRoot?: string;
  productName: string;
  description: string;
  version: string;
  arch: string;
}): MsixManifestConfig;
