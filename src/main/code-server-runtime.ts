import { getCodeServerRuntimeConfigPath } from './code-server-runtime-config-path.js';
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

interface CodeServerRuntimePlatformTarget {
  platform: string;
  arch: string;
  archiveExtension: string;
}

interface CodeServerRuntimeConfig extends VendoredRuntimeConfig {
  runtime: 'code-server';
  packageId: 'code-server';
  defaultPort: number;
  source: {
    generatedRootSubdir?: string | null;
    localArtifactDir?: string | null;
    indexUrl?: string | null;
    releaseUrls?: string[];
    releaseUrlsByPlatform?: Record<string, string[]>;
    allowedDownloadHosts?: string[];
  };
  platforms: Record<string, CodeServerRuntimePlatformTarget>;
}

export interface ValidateCodeServerRuntimeOptions {
  runtimeRoot: string;
  pathManager: PathManager;
  platform?: NodeJS.Platform;
  arch?: string;
  existsSync?: (targetPath: string) => boolean;
  health?: VendoredRuntimeHealthSnapshot;
  activation?: VendoredRuntimeActivationProgress | null;
}

export type ValidatedCodeServerRuntime = ValidatedVendoredRuntime;

export function readCodeServerRuntimeConfig(): CodeServerRuntimeConfig {
  return readRuntimeManifestSection<CodeServerRuntimeConfig>('codeServerRuntime', {
    manifestPath: getCodeServerRuntimeConfigPath(),
  });
}

export function detectCodeServerRuntimePlatform(
  runtimePlatform: NodeJS.Platform = process.platform,
  runtimeArch: string = process.arch,
): keyof CodeServerRuntimeConfig['platforms'] {
  return detectSupportedVendoredRuntimePlatform(
    runtimePlatform,
    runtimeArch,
  ) as keyof CodeServerRuntimeConfig['platforms'];
}

export function resolveCodeServerRuntimeTarget(
  platform = detectCodeServerRuntimePlatform(),
  config = readCodeServerRuntimeConfig(),
): CodeServerRuntimePlatformTarget {
  return resolveVendoredRuntimeTarget(platform, config) as CodeServerRuntimePlatformTarget;
}

export function resolveCodeServerWrapperPath(
  runtimeRoot: string,
  config: Pick<CodeServerRuntimeConfig, 'expectedLayout'> = readCodeServerRuntimeConfig(),
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

export async function validateCodeServerRuntime(
  options: ValidateCodeServerRuntimeOptions,
): Promise<ValidatedCodeServerRuntime> {
  const config = readCodeServerRuntimeConfig();
  return validateVendoredRuntime({
    runtimeId: 'code-server',
    runtimeRoot: options.runtimeRoot,
    packagedRoot: options.pathManager.getCodeServerPackagedRuntimeRoot(),
    stagedRoot: options.pathManager.getCodeServerRuntimeStagingRoot(),
    pathManager: options.pathManager,
    config,
    expectedBundledNodeRuntime: false,
    versionOverrideEnvVar: 'HAGICODE_CODE_SERVER_RUNTIME_VERSION',
    platform: options.platform,
    arch: options.arch,
    existsSync: options.existsSync,
    health: options.health,
    activation: options.activation,
  } satisfies ValidateVendoredRuntimeOptions);
}

export async function inspectVendoredCodeServerRuntime(
  pathManager: PathManager,
  options: {
    health?: VendoredRuntimeHealthSnapshot;
    runtimeRoot?: string;
    existsSync?: (targetPath: string) => boolean;
  } = {},
): Promise<VendoredRuntimeStatusSnapshot> {
  const config = readCodeServerRuntimeConfig();
  return inspectVendoredRuntime({
    runtimeId: 'code-server',
    runtimeRoot: options.runtimeRoot ?? pathManager.getCodeServerRuntimeRoot(),
    packagedRoot: pathManager.getCodeServerPackagedRuntimeRoot(),
    stagedRoot: pathManager.getCodeServerRuntimeStagingRoot(),
    pathManager,
    config,
    expectedBundledNodeRuntime: false,
    versionOverrideEnvVar: 'HAGICODE_CODE_SERVER_RUNTIME_VERSION',
    existsSync: options.existsSync,
    health: options.health,
  } satisfies ValidateVendoredRuntimeOptions);
}
