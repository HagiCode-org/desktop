import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { PathManager } from './path-manager.js';
import { getOmniRouteRuntimeConfigPath } from './omniroute-runtime-config-path.js';
import { findVendoredRuntime } from '../shared/vendored-runtimes.js';
import type {
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
  wrapperPath: string | null;
  entryScriptPath: string | null;
  missingEntries: string[];
  diagnostics: string[];
  status: VendoredRuntimeStatus;
}

export function readOmniRouteRuntimeConfig(): OmniRouteRuntimeConfig {
  return JSON.parse(fsSync.readFileSync(getOmniRouteRuntimeConfigPath(), 'utf8')) as OmniRouteRuntimeConfig;
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

export async function readOmniRouteRuntimeMetadata(runtimeRoot: string): Promise<VendoredRuntimeMetadata | null> {
  const metadataPath = path.join(runtimeRoot, 'metadata.json');
  try {
    return JSON.parse(await fs.readFile(metadataPath, 'utf8')) as VendoredRuntimeMetadata;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function resolveOmniRouteWrapperPath(
  runtimeRoot: string,
  config: OmniRouteRuntimeConfig = readOmniRouteRuntimeConfig(),
  existsSync: (targetPath: string) => boolean = fsSync.existsSync,
): string | null {
  for (const relativePath of config.expectedLayout.wrapperCandidates) {
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
  const metadata = await readOmniRouteRuntimeMetadata(options.runtimeRoot);

  try {
    resolveOmniRouteRuntimeTarget(
      detectOmniRouteRuntimePlatform(options.platform ?? process.platform, options.arch ?? process.arch),
      config,
    );
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
    diagnostics.push('Vendored OmniRoute metadata is missing at metadata.json');
  } else {
    if (metadata.schemaVersion !== config.schemaVersion) {
      diagnostics.push(`Metadata schemaVersion expected ${config.schemaVersion} but found ${metadata.schemaVersion ?? 'missing'}`);
    }
    if (metadata.packageId !== config.packageId) {
      diagnostics.push(`Metadata packageId expected ${config.packageId} but found ${metadata.packageId ?? 'missing'}`);
    }
    const expectedVersion = resolveExpectedOmniRouteRuntimeVersion(
      detectOmniRouteRuntimePlatform(options.platform ?? process.platform, options.arch ?? process.arch),
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
  const wrapperPath = resolveOmniRouteWrapperPath(options.runtimeRoot, config, existsSync);
  if (!wrapperPath) {
    diagnostics.push('No runnable OmniRoute wrapper was found in the staged runtime root');
  }

  return {
    config,
    metadata,
    wrapperPath,
    entryScriptPath: existsSync(entryScriptPath) ? entryScriptPath : null,
    missingEntries,
    diagnostics,
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
  const metadataPath = path.join(runtimeRoot, 'metadata.json');
  const health = options.health ?? {
    reachable: false,
    url: null,
    lastCheckedAt: null,
  };
  const primaryAction: VendoredRuntimePrimaryAction = validated.status === 'missing' || validated.status === 'damaged'
    ? (process.env.NODE_ENV === 'development' ? 'repair' : 'reinstall-desktop')
    : validated.status === 'running'
      ? 'stop'
      : 'start';

  return {
    id: definition.id,
    definition,
    status: validated.status,
    version: validated.metadata?.version ?? null,
    runtimeRoot,
    metadataPath,
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
