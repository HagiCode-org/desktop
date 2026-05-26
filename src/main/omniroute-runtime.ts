import { getOmniRouteRuntimeConfigPath } from './omniroute-runtime-config-path.js';
import { readRuntimeManifestSection } from './runtime-manifest-store.js';
import type { PathManager } from './path-manager.js';
import {
  detectSupportedVendoredRuntimePlatform,
  inspectVendoredRuntime,
  resolveVendoredRuntimeTarget,
  resolveVendoredRuntimeWrapperPath,
  type ValidatedVendoredRuntime,
  type VendoredRuntimeConfig,
  type ValidateVendoredRuntimeOptions,
  validateVendoredRuntime,
} from './vendored-runtime-inspector.js';
import type {
  VendoredRuntimeActivationProgress,
  VendoredRuntimeHealthSnapshot,
  VendoredRuntimeStatusSnapshot,
} from '../types/dependency-management.js';

interface OmniRouteRuntimePlatformTarget {
  platform: string;
  arch: string;
  archiveExtension: string;
}

interface OmniRouteRuntimeConfig extends VendoredRuntimeConfig {
  runtime: 'omniroute';
  packageId: 'omniroute';
  source: {
    generatedRootSubdir?: string | null;
    localArtifactDir?: string | null;
    indexUrl?: string | null;
    releaseUrls?: string[];
    releaseUrlsByPlatform?: Record<string, string[]>;
    allowedDownloadHosts?: string[];
  };
  platforms: Record<string, OmniRouteRuntimePlatformTarget>;
}

export interface ValidateOmniRouteRuntimeOptions {
  runtimeRoot: string;
  pathManager: PathManager;
  platform?: NodeJS.Platform;
  arch?: string;
  existsSync?: (targetPath: string) => boolean;
  health?: VendoredRuntimeHealthSnapshot;
  activation?: VendoredRuntimeActivationProgress | null;
}

export type ValidatedOmniRouteRuntime = ValidatedVendoredRuntime;

export function readOmniRouteRuntimeConfig(): OmniRouteRuntimeConfig {
  return readRuntimeManifestSection<OmniRouteRuntimeConfig>('omniRouteRuntime', {
    manifestPath: getOmniRouteRuntimeConfigPath(),
  });
}

export function detectOmniRouteRuntimePlatform(
  runtimePlatform: NodeJS.Platform = process.platform,
  runtimeArch: string = process.arch,
): keyof OmniRouteRuntimeConfig['platforms'] {
  return detectSupportedVendoredRuntimePlatform(
    runtimePlatform,
    runtimeArch,
  ) as keyof OmniRouteRuntimeConfig['platforms'];
}

export function resolveOmniRouteRuntimeTarget(
  platform = detectOmniRouteRuntimePlatform(),
  config = readOmniRouteRuntimeConfig(),
): OmniRouteRuntimePlatformTarget {
  return resolveVendoredRuntimeTarget(platform, config) as OmniRouteRuntimePlatformTarget;
}

export function resolveOmniRouteWrapperPath(
  runtimeRoot: string,
  config: Pick<OmniRouteRuntimeConfig, 'expectedLayout'> = readOmniRouteRuntimeConfig(),
  platform: NodeJS.Platform = process.platform,
  existsSync?: (targetPath: string) => boolean,
): string | null {
  return resolveVendoredRuntimeWrapperPath(
    runtimeRoot,
    config as VendoredRuntimeConfig,
    platform,
    existsSync,
  );
}

export async function validateOmniRouteRuntime(
  options: ValidateOmniRouteRuntimeOptions,
): Promise<ValidatedOmniRouteRuntime> {
  const config = readOmniRouteRuntimeConfig();
  return validateVendoredRuntime({
    runtimeId: 'omniroute',
    runtimeRoot: options.runtimeRoot,
    packagedRoot: options.pathManager.getOmniRoutePackagedRuntimeRoot(),
    stagedRoot: options.pathManager.getOmniRouteRuntimeStagingRoot(),
    pathManager: options.pathManager,
    config,
    expectedBundledNodeRuntime: true,
    versionOverrideEnvVar: 'HAGICODE_OMNIROUTE_RUNTIME_VERSION',
    platform: options.platform,
    arch: options.arch,
    existsSync: options.existsSync,
    health: options.health,
    activation: options.activation,
  } satisfies ValidateVendoredRuntimeOptions);
}

export async function inspectVendoredOmniRouteRuntime(
  pathManager: PathManager,
  options: {
    health?: VendoredRuntimeHealthSnapshot;
    runtimeRoot?: string;
    existsSync?: (targetPath: string) => boolean;
  } = {},
): Promise<VendoredRuntimeStatusSnapshot> {
  const config = readOmniRouteRuntimeConfig();
  return inspectVendoredRuntime({
    runtimeId: 'omniroute',
    runtimeRoot: options.runtimeRoot ?? pathManager.getOmniRouteRuntimeRoot(),
    packagedRoot: pathManager.getOmniRoutePackagedRuntimeRoot(),
    stagedRoot: pathManager.getOmniRouteRuntimeStagingRoot(),
    pathManager,
    config,
    expectedBundledNodeRuntime: true,
    versionOverrideEnvVar: 'HAGICODE_OMNIROUTE_RUNTIME_VERSION',
    existsSync: options.existsSync,
    health: options.health,
  } satisfies ValidateVendoredRuntimeOptions);
}
