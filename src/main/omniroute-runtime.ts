import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { PathManager } from './path-manager.js';
import { getOmniRouteRuntimeConfigPath } from './omniroute-runtime-config-path.js';
import { readRuntimeManifestSection } from './runtime-manifest-store.js';
import { findVendoredRuntime } from '../shared/vendored-runtimes.js';
import type {
  VendoredRuntimeInstallStatus,
  VendoredRuntimeHealthSnapshot,
  VendoredRuntimeMetadata,
  VendoredRuntimePrimaryAction,
  VendoredRuntimeStatus,
  VendoredRuntimeStatusSnapshot,
} from '../types/dependency-management.js';

interface OmniRouteRuntimePlatformTarget {
  platform: string;
  arch: string;
  archiveExtension: string;
}

interface OmniRouteRuntimeConfig {
  schemaVersion: number;
  runtime: 'omniroute';
  packageId: 'omniroute';
  releaseVersion?: string;
  releaseVersionByPlatform?: Record<string, string>;
  source: {
    generatedRootSubdir?: string | null;
    localArtifactDir?: string | null;
    indexUrl?: string | null;
    releaseUrls?: string[];
    releaseUrlsByPlatform?: Record<string, string[]>;
    allowedDownloadHosts?: string[];
  };
  platforms: Record<string, OmniRouteRuntimePlatformTarget>;
  expectedLayout: {
    requiredEntries: string[];
    wrapperCandidates: string[];
    entryScript: string;
  };
}

export interface ValidateOmniRouteRuntimeOptions {
  runtimeRoot: string;
  pathManager: PathManager;
  platform?: NodeJS.Platform;
  arch?: string;
  existsSync?: (targetPath: string) => boolean;
  health?: VendoredRuntimeHealthSnapshot;
}

export interface ValidatedOmniRouteRuntime {
  config: OmniRouteRuntimeConfig;
  metadata: VendoredRuntimeMetadata | null;
  metadataPath: string | null;
  wrapperPath: string | null;
  entryScriptPath: string | null;
  missingEntries: string[];
  diagnostics: string[];
  installStatus: VendoredRuntimeInstallStatus;
  status: VendoredRuntimeStatus;
}

const LEGACY_METADATA_FILE = 'metadata.json';
const HAGISCRIPT_COMPONENT_MARKER_FILE = '.hagicode-runtime.json';

export function readOmniRouteRuntimeConfig(): OmniRouteRuntimeConfig {
  return readRuntimeManifestSection<OmniRouteRuntimeConfig>('omniRouteRuntime', {
    manifestPath: getOmniRouteRuntimeConfigPath(),
  });
}

export function detectOmniRouteRuntimePlatform(
  runtimePlatform: NodeJS.Platform = process.platform,
  runtimeArch: string = process.arch,
): keyof OmniRouteRuntimeConfig['platforms'] {
  if (runtimePlatform === 'win32') {
    return 'win-x64';
  }
  if (runtimePlatform === 'linux') {
    return 'linux-x64';
  }
  if (runtimePlatform === 'darwin') {
    return runtimeArch === 'arm64' ? 'osx-arm64' : 'osx-x64';
  }
  throw new Error(`Unsupported vendored OmniRoute platform: ${runtimePlatform}/${runtimeArch}`);
}

export function resolveOmniRouteRuntimeTarget(
  platform = detectOmniRouteRuntimePlatform(),
  config = readOmniRouteRuntimeConfig(),
): OmniRouteRuntimePlatformTarget {
  const target = config.platforms[platform];
  if (!target) {
    throw new Error(`Vendored OmniRoute runtime is not configured for ${platform}`);
  }
  return target;
}

function resolveExpectedOmniRouteRuntimeVersion(
  platform = detectOmniRouteRuntimePlatform(),
  config = readOmniRouteRuntimeConfig(),
): string | null {
  const override = process.env.HAGICODE_OMNIROUTE_RUNTIME_VERSION?.trim();
  if (override) {
    return override;
  }

  const perPlatform = config.releaseVersionByPlatform?.[platform];
  if (typeof perPlatform === 'string' && perPlatform.trim().length > 0) {
    return perPlatform.trim();
  }

  if (typeof config.releaseVersion === 'string' && config.releaseVersion.trim().length > 0) {
    return config.releaseVersion.trim();
  }

  return null;
}

async function readOmniRouteRuntimeMetadataRecord(
  runtimeRoot: string,
  {
    platform = detectOmniRouteRuntimePlatform(),
    config = readOmniRouteRuntimeConfig(),
  }: {
    platform?: keyof OmniRouteRuntimeConfig['platforms'];
    config?: OmniRouteRuntimeConfig;
  } = {},
): Promise<{ metadata: VendoredRuntimeMetadata | null; metadataPath: string | null }> {
  const metadataPath = path.join(runtimeRoot, LEGACY_METADATA_FILE);
  try {
    return {
      metadata: JSON.parse(await fs.readFile(metadataPath, 'utf8')) as VendoredRuntimeMetadata,
      metadataPath,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const markerPath = path.join(runtimeRoot, '..', HAGISCRIPT_COMPONENT_MARKER_FILE);
  try {
    const marker = JSON.parse(await fs.readFile(markerPath, 'utf8')) as Record<string, unknown>;
    const target = resolveOmniRouteRuntimeTarget(platform, config);
    return {
      metadata: {
        schemaVersion: config.schemaVersion,
        packageId: config.packageId,
        version: typeof marker.version === 'string' ? marker.version : '',
        platform: target.platform,
        arch: target.arch,
        sourceRevision:
          (typeof marker.vendoredReleaseTag === 'string' && marker.vendoredReleaseTag)
          || (typeof marker.vendoredReleaseName === 'string' && marker.vendoredReleaseName)
          || (typeof marker.generatedAt === 'string' && marker.generatedAt)
          || 'hagiscript-managed',
        extra: {
          bundledNodeRuntime: true,
        },
        artifacts: typeof marker.vendoredAssetName === 'string'
          ? [{
            kind: 'release-asset',
            fileName: marker.vendoredAssetName,
            blobKey: typeof marker.vendoredAssetUrl === 'string' && marker.vendoredAssetUrl
              ? marker.vendoredAssetUrl
              : marker.vendoredAssetName,
            platform: target.platform,
            arch: target.arch,
          }]
          : undefined,
      },
      metadataPath: markerPath,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        metadata: null,
        metadataPath: null,
      };
    }
    throw error;
  }
}

export async function readOmniRouteRuntimeMetadata(runtimeRoot: string): Promise<VendoredRuntimeMetadata | null> {
  return (await readOmniRouteRuntimeMetadataRecord(runtimeRoot)).metadata;
}

export function resolveOmniRouteWrapperPath(
  runtimeRoot: string,
  config: OmniRouteRuntimeConfig = readOmniRouteRuntimeConfig(),
  platform: NodeJS.Platform = process.platform,
  existsSync: (targetPath: string) => boolean = fsSync.existsSync,
): string | null {
  const orderedCandidates = platform === 'win32'
    ? [
        ...config.expectedLayout.wrapperCandidates.filter(candidate => /\.(cmd|bat)$/i.test(candidate)),
        ...config.expectedLayout.wrapperCandidates.filter(candidate => /\.ps1$/i.test(candidate)),
        ...config.expectedLayout.wrapperCandidates.filter(candidate => !/\.(cmd|bat|ps1)$/i.test(candidate)),
      ]
    : config.expectedLayout.wrapperCandidates;

  for (const relativePath of orderedCandidates) {
    const candidate = path.join(runtimeRoot, relativePath);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveRequiredEntry(relativePattern: string, runtimeRoot: string, existsSync: (targetPath: string) => boolean): string | null {
  const candidates = relativePattern.split('|').map((entry) => entry.trim()).filter(Boolean);
  for (const candidate of candidates) {
    const targetPath = path.join(runtimeRoot, candidate);
    if (existsSync(targetPath)) {
      return targetPath;
    }
  }
  return null;
}

function normalizeInstallStatus(
  missingEntries: string[],
  diagnostics: string[],
): VendoredRuntimeInstallStatus {
  if (missingEntries.includes('runtime-root')) {
    return 'not-installed';
  }
  if (missingEntries.length > 0 || diagnostics.length > 0) {
    return 'failed';
  }
  return 'installed';
}

function normalizeStatus(
  missingEntries: string[],
  diagnostics: string[],
  health: VendoredRuntimeHealthSnapshot | undefined,
): VendoredRuntimeStatus {
  if (missingEntries.length > 0) {
    return missingEntries.includes('runtime-root') ? 'missing' : 'damaged';
  }
  if (health?.reachable) {
    return 'running';
  }
  if (health?.message) {
    return 'stopped';
  }
  if (diagnostics.length > 0) {
    return 'damaged';
  }
  return 'ready';
}

export async function validateOmniRouteRuntime(
  options: ValidateOmniRouteRuntimeOptions,
): Promise<ValidatedOmniRouteRuntime> {
  const existsSync = options.existsSync ?? fsSync.existsSync;
  const config = readOmniRouteRuntimeConfig();
  const diagnostics: string[] = [];
  const missingEntries: string[] = [];
  const platform = detectOmniRouteRuntimePlatform(options.platform ?? process.platform, options.arch ?? process.arch);
  const { metadata, metadataPath } = await readOmniRouteRuntimeMetadataRecord(options.runtimeRoot, { platform, config });

  try {
    resolveOmniRouteRuntimeTarget(platform, config);
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : String(error));
  }

  if (!existsSync(options.runtimeRoot)) {
    missingEntries.push('runtime-root');
  }

  for (const relativePattern of config.expectedLayout.requiredEntries) {
    if (!resolveRequiredEntry(relativePattern, options.runtimeRoot, existsSync)) {
      missingEntries.push(relativePattern);
    }
  }

  if (!metadata) {
    diagnostics.push('Vendored OmniRoute metadata is missing (metadata.json or ../.hagicode-runtime.json)');
  } else {
    if (metadata.schemaVersion !== config.schemaVersion) {
      diagnostics.push(`Metadata schemaVersion expected ${config.schemaVersion} but found ${metadata.schemaVersion ?? 'missing'}`);
    }
    if (metadata.packageId !== config.packageId) {
      diagnostics.push(`Metadata packageId expected ${config.packageId} but found ${metadata.packageId ?? 'missing'}`);
    }
    const expectedVersion = resolveExpectedOmniRouteRuntimeVersion(
      platform,
      config,
    );
    if (expectedVersion && metadata.version !== expectedVersion) {
      diagnostics.push(`Metadata version expected ${expectedVersion} but found ${metadata.version ?? 'missing'}`);
    }
    if (metadata.extra?.bundledNodeRuntime !== true) {
      diagnostics.push('Vendored OmniRoute metadata must declare extra.bundledNodeRuntime=true');
    }
  }

  const entryScriptPath = path.join(options.runtimeRoot, config.expectedLayout.entryScript);
  const wrapperPath = resolveOmniRouteWrapperPath(
    options.runtimeRoot,
    config,
    options.platform ?? process.platform,
    existsSync,
  );
  if (!wrapperPath) {
    diagnostics.push('No runnable OmniRoute wrapper was found in the staged runtime root');
  }

  return {
    config,
    metadata,
    metadataPath,
    wrapperPath,
    entryScriptPath: existsSync(entryScriptPath) ? entryScriptPath : null,
    missingEntries,
    diagnostics,
    installStatus: normalizeInstallStatus(missingEntries, diagnostics),
    status: normalizeStatus(missingEntries, diagnostics, options.health),
  };
}

export async function inspectVendoredOmniRouteRuntime(
  pathManager: PathManager,
  options: {
    health?: VendoredRuntimeHealthSnapshot;
    runtimeRoot?: string;
    existsSync?: (targetPath: string) => boolean;
  } = {},
): Promise<VendoredRuntimeStatusSnapshot> {
  const definition = findVendoredRuntime('omniroute');
  if (!definition) {
    throw new Error('Vendored runtime definition is missing for OmniRoute');
  }

  const runtimeRoot = options.runtimeRoot ?? pathManager.getOmniRouteRuntimeRoot();
  const validated = await validateOmniRouteRuntime({
    runtimeRoot,
    pathManager,
    existsSync: options.existsSync,
    health: options.health,
  });
  const health = options.health ?? {
    reachable: false,
    url: null,
    lastCheckedAt: null,
  };
  const primaryAction: VendoredRuntimePrimaryAction = validated.installStatus !== 'installed'
    ? (process.env.NODE_ENV === 'development' ? 'repair' : 'reinstall-desktop')
    : validated.status === 'running'
      ? 'stop'
      : 'start';

  return {
    id: definition.id,
    definition,
    installStatus: validated.installStatus,
    status: validated.status,
    version: validated.metadata?.version ?? null,
    runtimeRoot,
    metadataPath: validated.metadataPath,
    wrapperPath: validated.wrapperPath,
    entryScriptPath: validated.entryScriptPath,
    packageId: validated.metadata?.packageId ?? 'omniroute',
    schemaVersion: validated.metadata?.schemaVersion ?? null,
    bundledNodeRuntime: validated.metadata?.extra?.bundledNodeRuntime === true,
    managedByDesktop: true,
    primaryAction,
    diagnostics: [...validated.missingEntries, ...validated.diagnostics],
    health,
    message: validated.diagnostics[0],
  };
}
