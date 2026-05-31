export interface StorePackageConfig {
  schemaVersion: number;
  sourceForgeConfigPath: string;
  inputDirectory: string;
  outputDirectory: string;
  stageDirectory: string;
  assetsDirectory: string;
  metadataOutputPath: string;
  runtimeInjectionPath: string;
  packageIdentity: {
    displayName: string;
    publisherDisplayName: string;
    publisher: string;
    identityName: string;
    backgroundColor: string;
    languages: string[];
    addAutoLaunchExtension: boolean;
  };
  msix: {
    minVersion: string;
    maxVersionTested: string;
    capabilities: string[];
  };
}

export interface LoadedStorePackageConfig {
  storeConfig: StorePackageConfig;
  storeConfigPath: string;
  relativeStoreConfigPath: string;
}

export type StoreForgeRenderConfig = Pick<StorePackageConfig, 'packageIdentity' | 'msix'>;

export const projectRoot: string;
export const DEFAULT_STORE_CONFIG_PATH: string;
export const REQUIRED_SERVER_PAYLOAD_PATHS: string[];

export function toWindowsPackageVersion(version: string): string;
export function validateStorePackageConfig(config: unknown): StorePackageConfig;
export function loadStorePackageConfig(storeConfigPath?: string): Promise<LoadedStorePackageConfig>;
export function renderStoreForgeConfigOverlay(options: {
  sourceConfigPath: string;
  storeConfig: StoreForgeRenderConfig;
  buildVersion: string;
  publisherOverride?: string | null;
}): string;
export function writeStoreForgeConfigOverlay(options: {
  storeConfigPath?: string;
  outputPath: string;
  buildVersion: string;
  publisherOverride?: string | null;
}): Promise<{
  outputPath: string;
  sourceConfigPath: string;
  storeConfigPath: string;
  storeConfig: StorePackageConfig;
  buildVersion: string;
}>;
export function resolveRuntimeRoot(payloadPath: string): Promise<string>;
export function validateServerPayloadRoot(runtimeRoot: string, platformId?: string): Promise<{
  runtimeRoot: string;
  requiredPaths: string[];
}>;
export function resolveDesktopSourceRef(cwd?: string): Promise<string | null>;
