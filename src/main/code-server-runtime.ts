import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { PathManager } from './path-manager.js';
import { getCodeServerRuntimeConfigPath } from './code-server-runtime-config-path.js';
import { findVendoredRuntime } from '../shared/vendored-runtimes.js';
import type {
  VendoredRuntimeInstallStatus,
  VendoredRuntimeHealthSnapshot,
  VendoredRuntimeMetadata,
  VendoredRuntimePrimaryAction,
  VendoredRuntimeStatus,
  VendoredRuntimeStatusSnapshot,
} from '../types/dependency-management.js';

interface CodeServerRuntimePlatformTarget {
  platform: string;
  arch: string;
  archiveExtension: string;
}

interface CodeServerRuntimeConfig {
  schemaVersion: number;
  runtime: 'code-server';
  packageId: 'code-server';
  releaseVersion?: string;
  releaseVersionByPlatform?: Record<string, string>;
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
  expectedLayout: {
    requiredEntries: string[];
    wrapperCandidates: string[];
    entryScript: string;
  };
}

export interface ValidateCodeServerRuntimeOptions {
  runtimeRoot: string;
  pathManager: PathManager;
  platform?: NodeJS.Platform;
  arch?: string;
  existsSync?: (targetPath: string) => boolean;
  health?: VendoredRuntimeHealthSnapshot;
}

export interface ValidatedCodeServerRuntime {
  config: CodeServerRuntimeConfig;
  metadata: VendoredRuntimeMetadata | null;
  wrapperPath: string | null;
  entryScriptPath: string | null;
  missingEntries: string[];
  diagnostics: string[];
  installStatus: VendoredRuntimeInstallStatus;
  status: VendoredRuntimeStatus;
}

export function readCodeServerRuntimeConfig(): CodeServerRuntimeConfig {
  return JSON.parse(fsSync.readFileSync(getCodeServerRuntimeConfigPath(), 'utf8')) as CodeServerRuntimeConfig;
}

export function detectCodeServerRuntimePlatform(
  runtimePlatform: NodeJS.Platform = process.platform,
  runtimeArch: string = process.arch,
): keyof CodeServerRuntimeConfig['platforms'] {
  if (runtimePlatform === 'win32') {
    return 'win-x64';
  }
  if (runtimePlatform === 'linux') {
    return 'linux-x64';
  }
  if (runtimePlatform === 'darwin') {
    return runtimeArch === 'arm64' ? 'osx-arm64' : 'osx-x64';
  }
  throw new Error(`Unsupported vendored code-server platform: ${runtimePlatform}/${runtimeArch}`);
}

export function resolveCodeServerRuntimeTarget(
  platform = detectCodeServerRuntimePlatform(),
  config = readCodeServerRuntimeConfig(),
): CodeServerRuntimePlatformTarget {
  const target = config.platforms[platform];
  if (!target) {
    throw new Error(`Vendored code-server runtime is not configured for ${platform}`);
  }
  return target;
}

function resolveExpectedCodeServerRuntimeVersion(
  platform = detectCodeServerRuntimePlatform(),
  config = readCodeServerRuntimeConfig(),
): string | null {
  const override = process.env.HAGICODE_CODE_SERVER_RUNTIME_VERSION?.trim();
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

export async function readCodeServerRuntimeMetadata(runtimeRoot: string): Promise<VendoredRuntimeMetadata | null> {
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

export function resolveCodeServerWrapperPath(
  runtimeRoot: string,
  config: CodeServerRuntimeConfig = readCodeServerRuntimeConfig(),
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

export async function validateCodeServerRuntime(
  options: ValidateCodeServerRuntimeOptions,
): Promise<ValidatedCodeServerRuntime> {
  const existsSync = options.existsSync ?? fsSync.existsSync;
  const config = readCodeServerRuntimeConfig();
  const diagnostics: string[] = [];
  const missingEntries: string[] = [];
  const metadata = await readCodeServerRuntimeMetadata(options.runtimeRoot);

  try {
    resolveCodeServerRuntimeTarget(
      detectCodeServerRuntimePlatform(options.platform ?? process.platform, options.arch ?? process.arch),
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
    diagnostics.push('Vendored runtime metadata is missing at metadata.json');
  } else {
    if (metadata.schemaVersion !== config.schemaVersion) {
      diagnostics.push(`Metadata schemaVersion expected ${config.schemaVersion} but found ${metadata.schemaVersion ?? 'missing'}`);
    }
    if (metadata.packageId !== config.packageId) {
      diagnostics.push(`Metadata packageId expected ${config.packageId} but found ${metadata.packageId ?? 'missing'}`);
    }
    const expectedVersion = resolveExpectedCodeServerRuntimeVersion(
      detectCodeServerRuntimePlatform(options.platform ?? process.platform, options.arch ?? process.arch),
      config,
    );
    if (expectedVersion && metadata.version !== expectedVersion) {
      diagnostics.push(`Metadata version expected ${expectedVersion} but found ${metadata.version ?? 'missing'}`);
    }
    if (metadata.extra?.bundledNodeRuntime !== false) {
      diagnostics.push('Vendored code-server metadata must declare extra.bundledNodeRuntime=false');
    }
  }

  const entryScriptPath = path.join(options.runtimeRoot, config.expectedLayout.entryScript);
  const wrapperPath = resolveCodeServerWrapperPath(options.runtimeRoot, config, existsSync);
  if (!wrapperPath) {
    diagnostics.push('No runnable code-server wrapper was found in the staged runtime root');
  }

  return {
    config,
    metadata,
    wrapperPath,
    entryScriptPath: existsSync(entryScriptPath) ? entryScriptPath : null,
    missingEntries,
    diagnostics,
    installStatus: normalizeInstallStatus(missingEntries, diagnostics),
    status: normalizeStatus(missingEntries, diagnostics, options.health),
  };
}

export async function inspectVendoredCodeServerRuntime(
  pathManager: PathManager,
  options: {
    health?: VendoredRuntimeHealthSnapshot;
    runtimeRoot?: string;
    existsSync?: (targetPath: string) => boolean;
  } = {},
): Promise<VendoredRuntimeStatusSnapshot> {
  const definition = findVendoredRuntime('code-server');
  if (!definition) {
    throw new Error('Vendored runtime definition is missing for code-server');
  }

  const runtimeRoot = options.runtimeRoot ?? pathManager.getCodeServerRuntimeRoot();
  const validated = await validateCodeServerRuntime({
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
    metadataPath,
    wrapperPath: validated.wrapperPath,
    entryScriptPath: validated.entryScriptPath,
    packageId: validated.metadata?.packageId ?? 'code-server',
    schemaVersion: validated.metadata?.schemaVersion ?? null,
    bundledNodeRuntime: validated.metadata?.extra?.bundledNodeRuntime === true,
    managedByDesktop: true,
    primaryAction,
    diagnostics: [...validated.missingEntries, ...validated.diagnostics],
    health,
    message: validated.diagnostics[0],
  };
}
