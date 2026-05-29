export interface StorePackageConfig {
  schemaVersion: number;
  sourceElectronBuilderConfigPath: string;
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
  appx: {
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

export type StoreElectronBuilderRenderConfig = Pick<StorePackageConfig, 'packageIdentity' | 'appx'>;

export const projectRoot: string;
export const DEFAULT_STORE_CONFIG_PATH: string;
export const REQUIRED_SERVER_PAYLOAD_PATHS: string[];

export function toWindowsPackageVersion(version: string): string;
export function validateStorePackageConfig(config: unknown): StorePackageConfig;
export function loadStorePackageConfig(storeConfigPath?: string): Promise<LoadedStorePackageConfig>;
export function renderStoreElectronBuilderConfig(options: {
  sourceConfigPath: string;
  storeConfig: StoreElectronBuilderRenderConfig;
  buildVersion: string;
  publisherOverride?: string | null;
}): string;
export function writeStoreElectronBuilderConfig(options: {
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
