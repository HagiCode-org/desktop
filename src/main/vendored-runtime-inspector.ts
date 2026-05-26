import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getVendoredRuntimeActivationProgress } from './vendored-runtime-activation-state.js';
import type {
  VendoredRuntimeActivationProgress,
  VendoredRuntimeHealthSnapshot,
  VendoredRuntimeInstallStatus,
  VendoredRuntimeMetadata,
  VendoredRuntimePrimaryAction,
  VendoredRuntimeStatus,
  VendoredRuntimeStatusSnapshot,
  VendoredRuntimeSourceStatus,
  VendoredRuntimeId,
} from '../types/dependency-management.js';
import type { PathManager } from './path-manager.js';
import { findVendoredRuntime } from '../shared/vendored-runtimes.js';

const LEGACY_METADATA_FILE = 'metadata.json';

interface VendoredRuntimePlatformTarget {
  platform: string;
  arch: string;
  archiveExtension: string;
}

export interface VendoredRuntimeConfig {
  schemaVersion: number;
  runtime: VendoredRuntimeId;
  packageId: string;
  releaseVersion?: string;
  releaseVersionByPlatform?: Record<string, string>;
  packagedLayout: {
    markerFile: string;
    archiveRelativePath: string;
    installMode: string;
  };
  platforms: Record<string, VendoredRuntimePlatformTarget>;
  expectedLayout: {
    requiredEntries: string[];
    wrapperCandidates: string[];
    entryScript: string;
  };
}

export interface ValidateVendoredRuntimeOptions {
  runtimeId: VendoredRuntimeId;
  runtimeRoot: string;
  packagedRoot: string;
  stagedRoot: string;
  pathManager: PathManager;
  config: VendoredRuntimeConfig;
  expectedBundledNodeRuntime: boolean;
  versionOverrideEnvVar?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  existsSync?: (targetPath: string) => boolean;
  health?: VendoredRuntimeHealthSnapshot;
  activation?: VendoredRuntimeActivationProgress | null;
}

export interface ValidatedVendoredRuntime {
  config: VendoredRuntimeConfig;
  metadata: VendoredRuntimeMetadata | null;
  metadataPath: string | null;
  wrapperPath: string | null;
  entryScriptPath: string | null;
  missingEntries: string[];
  diagnostics: string[];
  installStatus: VendoredRuntimeInstallStatus;
  status: VendoredRuntimeStatus;
  sourceStatus: VendoredRuntimeSourceStatus;
  packagedArchivePath: string | null;
  packagedMarkerPath: string | null;
  packagedDiagnostics: string[];
  activation: VendoredRuntimeActivationProgress | null;
}

interface PackagedSourceValidation {
  status: VendoredRuntimeSourceStatus;
  metadata: VendoredRuntimeMetadata | null;
  markerPath: string | null;
  archivePath: string | null;
  diagnostics: string[];
}

interface ExtractedRuntimeValidation {
  metadata: VendoredRuntimeMetadata | null;
  metadataPath: string | null;
  wrapperPath: string | null;
  entryScriptPath: string | null;
  missingEntries: string[];
  diagnostics: string[];
  exists: boolean;
  valid: boolean;
}

export function detectSupportedVendoredRuntimePlatform(
  runtimePlatform: NodeJS.Platform = process.platform,
  runtimeArch: string = process.arch,
): string {
  if (runtimePlatform === 'win32') {
    return 'win-x64';
  }
  if (runtimePlatform === 'linux') {
    return 'linux-x64';
  }
  if (runtimePlatform === 'darwin') {
    return runtimeArch === 'arm64' ? 'osx-arm64' : 'osx-x64';
  }
  throw new Error(
    `Unsupported vendored runtime platform: ${runtimePlatform}/${runtimeArch}`,
  );
}

export function resolveVendoredRuntimeTarget(
  platform: string,
  config: VendoredRuntimeConfig,
): VendoredRuntimePlatformTarget {
  const target = config.platforms[platform];
  if (!target) {
    throw new Error(
      `Vendored runtime ${config.runtime} is not configured for ${platform}`,
    );
  }
  return target;
}

function resolveExpectedVendoredRuntimeVersion(
  platform: string,
  config: VendoredRuntimeConfig,
  versionOverrideEnvVar?: string,
): string | null {
  const override = versionOverrideEnvVar
    ? process.env[versionOverrideEnvVar]?.trim()
    : null;
  if (override) {
    return override;
  }

  const perPlatform = config.releaseVersionByPlatform?.[platform];
  if (typeof perPlatform === 'string' && perPlatform.trim().length > 0) {
    return perPlatform.trim();
  }

  if (
    typeof config.releaseVersion === 'string'
    && config.releaseVersion.trim().length > 0
  ) {
    return config.releaseVersion.trim();
  }

  return null;
}

function buildMetadataFromMarker(
  marker: Record<string, unknown>,
  config: VendoredRuntimeConfig,
  target: VendoredRuntimePlatformTarget,
  expectedBundledNodeRuntime: boolean,
): VendoredRuntimeMetadata {
  return {
    schemaVersion: config.schemaVersion,
    packageId: config.packageId,
    version: typeof marker.version === 'string' ? marker.version : '',
    platform: target.platform,
    arch: target.arch,
    sourceRevision:
      (typeof marker.vendoredReleaseTag === 'string' && marker.vendoredReleaseTag)
      || (typeof marker.vendoredReleaseName === 'string'
        && marker.vendoredReleaseName)
      || (typeof marker.generatedAt === 'string' && marker.generatedAt)
      || 'hagiscript-managed',
    extra: {
      bundledNodeRuntime: expectedBundledNodeRuntime,
    },
    artifacts:
      typeof marker.vendoredAssetName === 'string'
        ? [
            {
              kind: 'release-asset',
              fileName: marker.vendoredAssetName,
              blobKey:
                typeof marker.vendoredAssetUrl === 'string'
                && marker.vendoredAssetUrl
                  ? marker.vendoredAssetUrl
                  : marker.vendoredAssetName,
              platform: target.platform,
              arch: target.arch,
            },
          ]
        : undefined,
  };
}

async function tryReadJson(targetPath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(targetPath, 'utf8')) as Record<
      string,
      unknown
    >;
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function readPackagedMetadata(
  packagedRoot: string,
  config: VendoredRuntimeConfig,
  target: VendoredRuntimePlatformTarget,
  expectedBundledNodeRuntime: boolean,
): Promise<{ metadata: VendoredRuntimeMetadata | null; markerPath: string }> {
  const markerPath = path.join(packagedRoot, config.packagedLayout.markerFile);
  const marker = await tryReadJson(markerPath);
  return {
    metadata: marker
      ? buildMetadataFromMarker(
          marker,
          config,
          target,
          expectedBundledNodeRuntime,
        )
      : null,
    markerPath,
  };
}

async function readExtractedRuntimeMetadata(
  runtimeRoot: string,
  packagedRoot: string,
  config: VendoredRuntimeConfig,
  target: VendoredRuntimePlatformTarget,
  expectedBundledNodeRuntime: boolean,
): Promise<{ metadata: VendoredRuntimeMetadata | null; metadataPath: string | null }> {
  const metadataPath = path.join(runtimeRoot, LEGACY_METADATA_FILE);
  const metadataRecord = await tryReadJson(metadataPath);
  if (metadataRecord) {
    return {
      metadata: metadataRecord as unknown as VendoredRuntimeMetadata,
      metadataPath,
    };
  }

  const packagedMetadata = await readPackagedMetadata(
    packagedRoot,
    config,
    target,
    expectedBundledNodeRuntime,
  );
  return {
    metadata: packagedMetadata.metadata,
    metadataPath: packagedMetadata.metadata ? packagedMetadata.markerPath : null,
  };
}

function resolveRequiredEntry(
  relativePattern: string,
  runtimeRoot: string,
  existsSync: (targetPath: string) => boolean,
): string | null {
  const candidates = relativePattern
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    const targetPath = path.join(runtimeRoot, candidate);
    if (existsSync(targetPath)) {
      return targetPath;
    }
  }
  return null;
}

export function resolveVendoredRuntimeWrapperPath(
  runtimeRoot: string,
  config: VendoredRuntimeConfig,
  platform: NodeJS.Platform = process.platform,
  existsSync: (targetPath: string) => boolean = fsSync.existsSync,
): string | null {
  const windowsCandidates = config.expectedLayout.wrapperCandidates;
  const orderedCandidates =
    platform === 'win32'
      ? [
          ...windowsCandidates.filter((candidate) => /\.(cmd|bat)$/i.test(candidate)),
          ...windowsCandidates.filter((candidate) => /\.ps1$/i.test(candidate)),
          ...windowsCandidates.filter(
            (candidate) => !/\.(cmd|bat|ps1)$/i.test(candidate),
          ),
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

async function validatePackagedSource(
  options: ValidateVendoredRuntimeOptions,
  platform: string,
  target: VendoredRuntimePlatformTarget,
  existsSync: (targetPath: string) => boolean,
): Promise<PackagedSourceValidation> {
  const diagnostics: string[] = [];
  const packagedRootExists = existsSync(options.packagedRoot);
  const archivePath = path.join(
    options.packagedRoot,
    options.config.packagedLayout.archiveRelativePath,
  );
  const { metadata, markerPath } = await readPackagedMetadata(
    options.packagedRoot,
    options.config,
    target,
    options.expectedBundledNodeRuntime,
  );

  if (!packagedRootExists) {
    return {
      status: 'missing',
      metadata: null,
      markerPath: null,
      archivePath: null,
      diagnostics: ['Packaged vendored runtime root is missing.'],
    };
  }

  if (!existsSync(archivePath)) {
    diagnostics.push(
      `Packaged vendored runtime archive is missing: ${archivePath}`,
    );
  }

  const marker = await tryReadJson(markerPath);
  if (!marker) {
    diagnostics.push(
      `Packaged vendored runtime marker is missing: ${markerPath}`,
    );
  } else {
    if (marker.archiveFormat !== '7z') {
      diagnostics.push(
        `Packaged runtime marker archiveFormat expected 7z but found ${String(
          marker.archiveFormat ?? 'missing',
        )}`,
      );
    }
    if (
      typeof marker.vendoredAssetName !== 'string'
      || !marker.vendoredAssetName.endsWith('.7z')
    ) {
      diagnostics.push(
        'Packaged runtime marker vendoredAssetName must reference a .7z payload.',
      );
    }
  }

  if (!metadata) {
    diagnostics.push('Packaged vendored runtime metadata is missing.');
  } else {
    if (metadata.schemaVersion !== options.config.schemaVersion) {
      diagnostics.push(
        `Metadata schemaVersion expected ${options.config.schemaVersion} but found ${metadata.schemaVersion ?? 'missing'}`,
      );
    }
    if (metadata.packageId !== options.config.packageId) {
      diagnostics.push(
        `Metadata packageId expected ${options.config.packageId} but found ${metadata.packageId ?? 'missing'}`,
      );
    }
    const expectedVersion = resolveExpectedVendoredRuntimeVersion(
      platform,
      options.config,
      options.versionOverrideEnvVar,
    );
    if (expectedVersion && metadata.version !== expectedVersion) {
      diagnostics.push(
        `Metadata version expected ${expectedVersion} but found ${metadata.version ?? 'missing'}`,
      );
    }
    if (
      metadata.extra?.bundledNodeRuntime !== options.expectedBundledNodeRuntime
    ) {
      diagnostics.push(
        `Metadata extra.bundledNodeRuntime expected ${String(options.expectedBundledNodeRuntime)} but found ${String(metadata.extra?.bundledNodeRuntime)}`,
      );
    }
  }

  return {
    status: diagnostics.length === 0 ? 'available' : 'invalid',
    metadata,
    markerPath,
    archivePath,
    diagnostics,
  };
}

async function validateExtractedRuntime(
  options: ValidateVendoredRuntimeOptions,
  target: VendoredRuntimePlatformTarget,
  existsSync: (targetPath: string) => boolean,
): Promise<ExtractedRuntimeValidation> {
  const diagnostics: string[] = [];
  const missingEntries: string[] = [];
  const exists = existsSync(options.runtimeRoot);
  const { metadata, metadataPath } = await readExtractedRuntimeMetadata(
    options.runtimeRoot,
    options.packagedRoot,
    options.config,
    target,
    options.expectedBundledNodeRuntime,
  );

  if (!exists) {
    missingEntries.push('runtime-root');
  }

  for (const relativePattern of options.config.expectedLayout.requiredEntries) {
    if (!resolveRequiredEntry(relativePattern, options.runtimeRoot, existsSync)) {
      missingEntries.push(relativePattern);
    }
  }

  if (!metadata) {
    diagnostics.push('Vendored runtime metadata is missing.');
  } else {
    if (metadata.schemaVersion !== options.config.schemaVersion) {
      diagnostics.push(
        `Metadata schemaVersion expected ${options.config.schemaVersion} but found ${metadata.schemaVersion ?? 'missing'}`,
      );
    }
    if (metadata.packageId !== options.config.packageId) {
      diagnostics.push(
        `Metadata packageId expected ${options.config.packageId} but found ${metadata.packageId ?? 'missing'}`,
      );
    }
    if (
      metadata.extra?.bundledNodeRuntime !== options.expectedBundledNodeRuntime
    ) {
      diagnostics.push(
        `Metadata extra.bundledNodeRuntime expected ${String(options.expectedBundledNodeRuntime)} but found ${String(metadata.extra?.bundledNodeRuntime)}`,
      );
    }
  }

  const entryScriptPath = path.join(
    options.runtimeRoot,
    options.config.expectedLayout.entryScript,
  );
  const wrapperPath = resolveVendoredRuntimeWrapperPath(
    options.runtimeRoot,
    options.config,
    options.platform ?? process.platform,
    existsSync,
  );

  if (exists && !wrapperPath) {
    diagnostics.push(
      `No runnable ${options.runtimeId} wrapper was found in the extracted runtime root.`,
    );
  }

  return {
    metadata,
    metadataPath,
    wrapperPath,
    entryScriptPath: existsSync(entryScriptPath) ? entryScriptPath : null,
    missingEntries,
    diagnostics,
    exists,
    valid: exists && missingEntries.length === 0 && diagnostics.length === 0,
  };
}

function normalizeVendoredRuntimeStatus(
  sourceStatus: VendoredRuntimeSourceStatus,
  extracted: ExtractedRuntimeValidation,
  activation: VendoredRuntimeActivationProgress | null,
  health: VendoredRuntimeHealthSnapshot | undefined,
): VendoredRuntimeStatus {
  if (activation && !['completed', 'failed'].includes(activation.stage)) {
    return 'extracting';
  }
  if (sourceStatus === 'missing') {
    return 'missing';
  }
  if (sourceStatus === 'invalid') {
    return 'damaged';
  }
  if (!extracted.exists) {
    return 'enable-required';
  }
  if (!extracted.valid) {
    return 'damaged';
  }
  if (health?.reachable) {
    return 'running';
  }
  if (health?.message) {
    return 'stopped';
  }
  return 'ready';
}

function normalizeVendoredRuntimeInstallStatus(
  sourceStatus: VendoredRuntimeSourceStatus,
  status: VendoredRuntimeStatus,
): VendoredRuntimeInstallStatus {
  if (sourceStatus === 'missing') {
    return 'not-installed';
  }
  if (sourceStatus === 'invalid') {
    return 'failed';
  }
  if (status === 'enable-required' || status === 'extracting') {
    return 'packaged';
  }
  if (status === 'damaged') {
    return 'failed';
  }
  return 'installed';
}

function resolvePrimaryAction(
  sourceStatus: VendoredRuntimeSourceStatus,
  status: VendoredRuntimeStatus,
): VendoredRuntimePrimaryAction {
  if (status === 'extracting') {
    return 'none';
  }
  if (sourceStatus !== 'available') {
    return process.env.NODE_ENV === 'development'
      ? 'repair'
      : 'reinstall-desktop';
  }
  if (status === 'enable-required') {
    return 'enable';
  }
  if (status === 'damaged') {
    return 'repair';
  }
  return status === 'running' ? 'stop' : 'start';
}

export async function validateVendoredRuntime(
  options: ValidateVendoredRuntimeOptions,
): Promise<ValidatedVendoredRuntime> {
  const existsSync = options.existsSync ?? fsSync.existsSync;
  const platform = detectSupportedVendoredRuntimePlatform(
    options.platform ?? process.platform,
    options.arch ?? process.arch,
  );
  const target = resolveVendoredRuntimeTarget(platform, options.config);
  const packaged = await validatePackagedSource(options, platform, target, existsSync);
  const extracted = await validateExtractedRuntime(options, target, existsSync);
  const activation = options.activation === undefined
    ? getVendoredRuntimeActivationProgress(options.runtimeId)
    : options.activation;
  const status = normalizeVendoredRuntimeStatus(
    packaged.status,
    extracted,
    activation,
    options.health,
  );
  const installStatus = normalizeVendoredRuntimeInstallStatus(packaged.status, status);
  const diagnostics = [
    ...packaged.diagnostics,
    ...((status === 'enable-required' || status === 'extracting')
      ? []
      : extracted.missingEntries),
    ...extracted.diagnostics,
  ];
  if (activation?.error && !diagnostics.includes(activation.error)) {
    diagnostics.unshift(activation.error);
  }

  return {
    config: options.config,
    metadata: extracted.metadata ?? packaged.metadata,
    metadataPath: extracted.metadataPath ?? packaged.markerPath,
    wrapperPath: extracted.wrapperPath,
    entryScriptPath: extracted.entryScriptPath,
    missingEntries:
      status === 'enable-required' || status === 'extracting'
        ? []
        : extracted.missingEntries,
    diagnostics,
    installStatus,
    status,
    sourceStatus: packaged.status,
    packagedArchivePath: packaged.archivePath,
    packagedMarkerPath: packaged.markerPath,
    packagedDiagnostics: packaged.diagnostics,
    activation,
  };
}

export async function inspectVendoredRuntime(
  options: ValidateVendoredRuntimeOptions & {
    health?: VendoredRuntimeHealthSnapshot;
  },
): Promise<VendoredRuntimeStatusSnapshot> {
  const definition = findVendoredRuntime(options.runtimeId);
  if (!definition) {
    throw new Error(
      `Vendored runtime definition is missing for ${options.runtimeId}`,
    );
  }

  const validated = await validateVendoredRuntime(options);
  const health = options.health ?? {
    reachable: false,
    url: null,
    lastCheckedAt: null,
  };
  const primaryAction = resolvePrimaryAction(
    validated.sourceStatus,
    validated.status,
  );
  const runtimeMessage =
    validated.activation?.error
    || (validated.status === 'enable-required'
      ? 'Vendored runtime is packaged but not enabled yet.'
      : validated.activation?.message)
    || validated.diagnostics[0]
    || health.message;

  return {
    id: definition.id,
    definition,
    installStatus: validated.installStatus,
    status: validated.status,
    sourceStatus: validated.sourceStatus,
    version: validated.metadata?.version ?? null,
    runtimeRoot: options.runtimeRoot,
    stagingRoot: options.stagedRoot,
    packagedRoot: options.packagedRoot,
    packagedArchivePath: validated.packagedArchivePath,
    packagedMarkerPath: validated.packagedMarkerPath,
    metadataPath: validated.metadataPath,
    wrapperPath: validated.wrapperPath,
    entryScriptPath: validated.entryScriptPath,
    packageId: validated.metadata?.packageId ?? options.config.packageId,
    schemaVersion: validated.metadata?.schemaVersion ?? null,
    bundledNodeRuntime:
      validated.metadata?.extra?.bundledNodeRuntime
      === options.expectedBundledNodeRuntime,
    managedByDesktop: true,
    primaryAction,
    diagnostics: validated.diagnostics,
    activation: validated.activation,
    health,
    message: runtimeMessage,
  };
}
