import path from 'node:path';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import {
  assertOfficialMicrosoftDownloadUrl,
  detectPinnedRuntimePlatform,
  getEmbeddedDotnetExecutableName,
  readEmbeddedRuntimeStageMetadata,
  readPinnedRuntimeManifest,
  resolvePinnedRuntimeTarget,
  type EmbeddedRuntimeStageMetadata,
} from './embedded-runtime-config.js';
import type { Manifest } from './manifest-reader.js';

export const FRAMEWORK_DEPENDENT_REQUIRED_FILES = [
  'lib/PCode.Web.dll',
  'lib/PCode.Web.runtimeconfig.json',
  'lib/PCode.Web.deps.json',
] as const;

export interface ServicePayloadPaths {
  serviceDllPath: string;
  runtimeConfigPath: string;
  depsJsonPath: string;
}

export interface ManifestRuntimeMetadata {
  min?: string;
  max?: string;
  recommended?: string;
  description?: string;
}

export interface AspNetRuntimeRequirement {
  runtimeConfigVersion?: string;
  minimumVersion?: string;
  maximumVersion?: string;
  recommendedVersion?: string;
  pinnedVersion?: string;
  effectiveMinimumVersion?: string;
  effectiveMaximumVersion?: string;
  effectiveVersion?: string;
  requiredMajor?: number;
  label: string;
  effectiveLabel: string;
}

export interface ServicePayloadValidationResult {
  startable: boolean;
  missingFiles: string[];
  payloadPaths: ServicePayloadPaths;
  manifestRuntime: ManifestRuntimeMetadata;
  requirement?: AspNetRuntimeRequirement;
  message?: string;
}

export interface EmbeddedRuntimeValidationResult {
  valid: boolean;
  runtimeRoot: string;
  dotnetPath: string;
  missingComponents: string[];
  aspNetCoreVersion?: string;
  netCoreVersion?: string;
  hostFxrVersion?: string;
}

export interface RuntimeCompatibilityResult {
  compatible: boolean;
  reason?: string;
  embeddedVersion?: string;
  requiredVersionLabel: string;
}

export interface PinnedRuntimeValidationResult {
  valid: boolean;
  code?: 'missing-runtime-metadata' | 'unofficial-source' | 'pinned-version-mismatch';
  message?: string;
  metadata?: EmbeddedRuntimeStageMetadata | null;
}

export type BundledRuntimeValidationFailureCode =
  | 'missing-runtime-payload'
  | 'unofficial-runtime-source'
  | 'pinned-runtime-mismatch'
  | 'runtime-incompatible';

export type BundledRuntimeRemediation = 'none' | 'reinstall-desktop' | 'update-desktop';

export interface BundledRuntimeValidationResult {
  valid: boolean;
  runtimeRoot: string;
  platform: string;
  runtimeValidation: EmbeddedRuntimeValidationResult;
  pinnedRuntimeValidation: PinnedRuntimeValidationResult;
  compatibility?: RuntimeCompatibilityResult;
  bundledRuntimeVersion?: string;
  requiredRuntimeLabel?: string;
  runtimeSource?: string;
  code?: BundledRuntimeValidationFailureCode;
  message?: string;
  remediation: BundledRuntimeRemediation;
}

interface RuntimeConfigFrameworkRef {
  name?: string;
  version?: string;
}

interface RuntimeConfigShape {
  runtimeOptions?: {
    framework?: RuntimeConfigFrameworkRef;
    frameworks?: RuntimeConfigFrameworkRef[];
  };
}

export function getServicePayloadPaths(installPath: string): ServicePayloadPaths {
  return {
    serviceDllPath: path.join(installPath, 'lib', 'PCode.Web.dll'),
    runtimeConfigPath: path.join(installPath, 'lib', 'PCode.Web.runtimeconfig.json'),
    depsJsonPath: path.join(installPath, 'lib', 'PCode.Web.deps.json'),
  };
}

export function extractManifestRuntimeMetadata(manifest: Manifest | null | undefined): ManifestRuntimeMetadata {
  const runtime = manifest?.dependencies?.dotnet?.version && 'runtime' in manifest.dependencies.dotnet.version
    ? manifest.dependencies.dotnet.version.runtime
    : undefined;

  return {
    min: normalizeVersion(runtime?.min),
    max: normalizeVersion(runtime?.max),
    recommended: normalizeVersion(runtime?.recommended),
    description: runtime?.description,
  };
}

export function parseAspNetCoreRuntimeConfig(content: string | RuntimeConfigShape): string {
  const runtimeConfig = typeof content === 'string'
    ? JSON.parse(content) as RuntimeConfigShape
    : content;

  const frameworks = [
    runtimeConfig.runtimeOptions?.framework,
    ...(runtimeConfig.runtimeOptions?.frameworks ?? []),
  ].filter(Boolean) as RuntimeConfigFrameworkRef[];

  const aspNetCore = frameworks.find((framework) => framework.name === 'Microsoft.AspNetCore.App');
  const version = normalizeVersion(aspNetCore?.version);

  if (!version) {
    throw new Error('PCode.Web.runtimeconfig.json does not declare Microsoft.AspNetCore.App');
  }

  return version;
}

export function resolveAspNetCoreRuntimeRequirement(
  runtimeConfigVersion: string | undefined,
  manifestRuntime: ManifestRuntimeMetadata,
  pinnedVersion?: string,
): AspNetRuntimeRequirement {
  const normalizedRuntimeConfigVersion = normalizeVersion(runtimeConfigVersion);
  const normalizedPinnedVersion = normalizeVersion(pinnedVersion);
  const minimumVersion = pickHighestVersion([
    normalizedRuntimeConfigVersion,
    manifestRuntime.min,
  ]);
  const maximumVersion = normalizeVersion(manifestRuntime.max);
  const recommendedVersion = pickHighestVersion([
    manifestRuntime.recommended,
    minimumVersion,
  ]);
  const requiredMajor = extractMajorVersion(
    normalizedRuntimeConfigVersion
    ?? recommendedVersion
    ?? manifestRuntime.min
    ?? maximumVersion
    ?? normalizedPinnedVersion,
  );

  const effectiveMinimumVersion = pickHighestVersion([
    minimumVersion,
    normalizedPinnedVersion,
  ]);
  const effectiveMaximumVersion = pickLowestVersion([
    maximumVersion,
    normalizedPinnedVersion,
  ]);
  const effectiveVersion = normalizedPinnedVersion;

  const label = requiredMajor !== undefined
    ? `${requiredMajor}.x`
    : minimumVersion
      ?? recommendedVersion
      ?? 'unknown';

  return {
    runtimeConfigVersion: normalizedRuntimeConfigVersion,
    minimumVersion,
    maximumVersion,
    recommendedVersion,
    pinnedVersion: normalizedPinnedVersion,
    effectiveMinimumVersion,
    effectiveMaximumVersion,
    effectiveVersion,
    requiredMajor,
    label,
    effectiveLabel: effectiveVersion ?? label,
  };
}

export function evaluateRuntimeCompatibility(
  requirement: AspNetRuntimeRequirement,
  embeddedVersion: string | undefined,
): RuntimeCompatibilityResult {
  const normalizedEmbeddedVersion = normalizeVersion(embeddedVersion);
  if (!normalizedEmbeddedVersion) {
    return {
      compatible: false,
      reason: 'Bundled ASP.NET Core runtime version could not be resolved.',
      embeddedVersion: embeddedVersion,
      requiredVersionLabel: requirement.effectiveLabel,
    };
  }

  const embeddedMajor = extractMajorVersion(normalizedEmbeddedVersion);
  if (requirement.requiredMajor !== undefined && embeddedMajor !== requirement.requiredMajor) {
    return {
      compatible: false,
      reason: `Service requires ASP.NET Core ${requirement.label}, but Desktop bundles ${normalizedEmbeddedVersion}.`,
      embeddedVersion: normalizedEmbeddedVersion,
      requiredVersionLabel: requirement.label,
    };
  }

  const minimumVersion = requirement.effectiveMinimumVersion ?? requirement.minimumVersion;
  if (minimumVersion && compareVersions(normalizedEmbeddedVersion, minimumVersion) < 0) {
    return {
      compatible: false,
      reason: `Service requires ASP.NET Core >= ${minimumVersion}, but Desktop bundles ${normalizedEmbeddedVersion}.`,
      embeddedVersion: normalizedEmbeddedVersion,
      requiredVersionLabel: minimumVersion,
    };
  }

  const maximumVersion = requirement.effectiveMaximumVersion ?? requirement.maximumVersion;
  if (maximumVersion && compareVersions(normalizedEmbeddedVersion, maximumVersion) > 0) {
    return {
      compatible: false,
      reason: `Service supports ASP.NET Core <= ${maximumVersion}, but Desktop bundles ${normalizedEmbeddedVersion}.`,
      embeddedVersion: normalizedEmbeddedVersion,
      requiredVersionLabel: maximumVersion,
    };
  }

  return {
    compatible: true,
    embeddedVersion: normalizedEmbeddedVersion,
    requiredVersionLabel: requirement.effectiveLabel,
  };
}

export async function validateFrameworkDependentPayload(
  installPath: string,
  manifest: Manifest | null | undefined,
): Promise<ServicePayloadValidationResult> {
  const payloadPaths = getServicePayloadPaths(installPath);
  const missingFiles = await collectMissingFiles(installPath, FRAMEWORK_DEPENDENT_REQUIRED_FILES);
  const manifestRuntime = extractManifestRuntimeMetadata(manifest);

  if (missingFiles.length > 0) {
    return {
      startable: false,
      missingFiles,
      payloadPaths,
      manifestRuntime,
      message: `Missing framework-dependent payload files: ${missingFiles.join(', ')}`,
    };
  }

  try {
    const runtimeConfigContent = await fs.readFile(payloadPaths.runtimeConfigPath, 'utf-8');
    const runtimeConfigVersion = parseAspNetCoreRuntimeConfig(runtimeConfigContent);
    const requirement = resolveAspNetCoreRuntimeRequirement(
      runtimeConfigVersion,
      manifestRuntime,
      resolvePinnedAspNetCoreVersion(),
    );

    return {
      startable: true,
      missingFiles: [],
      payloadPaths,
      manifestRuntime,
      requirement,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      startable: false,
      missingFiles: [],
      payloadPaths,
      manifestRuntime,
      message: `Invalid PCode.Web.runtimeconfig.json: ${message}`,
    };
  }
}

export async function validateEmbeddedRuntimeLayout(
  runtimeRoot: string,
  executableName: string,
): Promise<EmbeddedRuntimeValidationResult> {
  const dotnetPath = path.join(runtimeRoot, executableName);
  const missingComponents: string[] = [];

  if (!(await pathExists(dotnetPath))) {
    missingComponents.push(executableName);
  } else if (!executableName.endsWith('.exe') && !(await isExecutable(dotnetPath))) {
    missingComponents.push(`${executableName} (not executable)`);
  }

  const hostFxrDir = path.join(runtimeRoot, 'host', 'fxr');
  const hostFxrVersions = await listDirectoryNames(hostFxrDir);
  if (hostFxrVersions.length === 0) {
    missingComponents.push('host/fxr');
  }

  const sharedAspNetRoot = path.join(runtimeRoot, 'shared', 'Microsoft.AspNetCore.App');
  const aspNetVersions = await listDirectoryNames(sharedAspNetRoot);
  if (aspNetVersions.length === 0) {
    missingComponents.push('shared/Microsoft.AspNetCore.App');
  }

  const sharedNetCoreRoot = path.join(runtimeRoot, 'shared', 'Microsoft.NETCore.App');
  const netCoreVersions = await listDirectoryNames(sharedNetCoreRoot);
  if (netCoreVersions.length === 0) {
    missingComponents.push('shared/Microsoft.NETCore.App');
  }

  return {
    valid: missingComponents.length === 0,
    runtimeRoot,
    dotnetPath,
    missingComponents,
    aspNetCoreVersion: pickHighestVersion(aspNetVersions),
    netCoreVersion: pickHighestVersion(netCoreVersions),
    hostFxrVersion: pickHighestVersion(hostFxrVersions),
  };
}

export async function validateBundledRuntimeForPlatform(options: {
  platform: string;
  runtimeRoot: string;
  requirement?: AspNetRuntimeRequirement;
  executableName?: string;
}): Promise<BundledRuntimeValidationResult> {
  const executableName = options.executableName ?? getEmbeddedDotnetExecutableName(options.platform);
  const runtimeValidation = await validateEmbeddedRuntimeLayout(options.runtimeRoot, executableName);

  if (!runtimeValidation.valid) {
    return {
      valid: false,
      platform: options.platform,
      runtimeRoot: options.runtimeRoot,
      runtimeValidation,
      pinnedRuntimeValidation: {
        valid: false,
        metadata: null,
      },
      bundledRuntimeVersion: runtimeValidation.aspNetCoreVersion,
      requiredRuntimeLabel: options.requirement?.effectiveLabel,
      code: 'missing-runtime-payload',
      remediation: 'reinstall-desktop',
      message: `Pinned runtime missing or incomplete. Expected ${options.runtimeRoot} (missing: ${runtimeValidation.missingComponents.join(', ')})`,
    };
  }

  const pinnedRuntimeValidation = await validatePinnedEmbeddedRuntime(options.platform, runtimeValidation);
  if (!pinnedRuntimeValidation.valid) {
    const remediation = pinnedRuntimeValidation.code === 'pinned-version-mismatch' ? 'update-desktop' : 'reinstall-desktop';
    const code = pinnedRuntimeValidation.code === 'unofficial-source'
      ? 'unofficial-runtime-source'
      : pinnedRuntimeValidation.code === 'pinned-version-mismatch'
        ? 'pinned-runtime-mismatch'
        : 'missing-runtime-payload';

    const message = code === 'unofficial-runtime-source'
      ? `Pinned runtime source validation failed. ${pinnedRuntimeValidation.message ?? 'Expected an official Microsoft runtime source.'}`
      : code === 'pinned-runtime-mismatch'
        ? `Pinned runtime version mismatch. ${pinnedRuntimeValidation.message ?? 'Bundled runtime does not match the pinned Desktop runtime.'}`
        : pinnedRuntimeValidation.message ?? `Pinned runtime metadata is missing from ${options.runtimeRoot}.`;

    return {
      valid: false,
      platform: options.platform,
      runtimeRoot: options.runtimeRoot,
      runtimeValidation,
      pinnedRuntimeValidation,
      bundledRuntimeVersion: runtimeValidation.aspNetCoreVersion,
      requiredRuntimeLabel: options.requirement?.effectiveLabel,
      runtimeSource: pinnedRuntimeValidation.metadata?.downloadUrl,
      code,
      remediation,
      message,
    };
  }

  const compatibility = options.requirement
    ? evaluateRuntimeCompatibility(options.requirement, runtimeValidation.aspNetCoreVersion)
    : undefined;

  if (compatibility && !compatibility.compatible) {
    return {
      valid: false,
      platform: options.platform,
      runtimeRoot: options.runtimeRoot,
      runtimeValidation,
      pinnedRuntimeValidation,
      compatibility,
      bundledRuntimeVersion: runtimeValidation.aspNetCoreVersion,
      requiredRuntimeLabel: options.requirement?.effectiveLabel ?? compatibility.requiredVersionLabel,
      runtimeSource: pinnedRuntimeValidation.metadata?.downloadUrl,
      code: 'runtime-incompatible',
      remediation: 'update-desktop',
      message: `Pinned runtime version incompatible. ${compatibility.reason ?? 'Unsupported ASP.NET Core version.'}`,
    };
  }

  return {
    valid: true,
    platform: options.platform,
    runtimeRoot: options.runtimeRoot,
    runtimeValidation,
    pinnedRuntimeValidation,
    compatibility,
    bundledRuntimeVersion: runtimeValidation.aspNetCoreVersion,
    requiredRuntimeLabel: options.requirement?.effectiveLabel,
    runtimeSource: pinnedRuntimeValidation.metadata?.downloadUrl,
    remediation: 'none',
  };
}

export async function validatePinnedEmbeddedRuntime(
  platform: string,
  runtimeValidation: EmbeddedRuntimeValidationResult,
): Promise<PinnedRuntimeValidationResult> {
  const manifest = readPinnedRuntimeManifest();
  const target = resolvePinnedRuntimeTarget(platform);
  const metadata = await readEmbeddedRuntimeStageMetadata(runtimeValidation.runtimeRoot);

  if (!metadata) {
    return {
      valid: false,
      code: 'missing-runtime-metadata',
      message: `Pinned runtime metadata is missing from ${runtimeValidation.runtimeRoot}.`,
      metadata: null,
    };
  }

  try {
    assertOfficialMicrosoftDownloadUrl(metadata.downloadUrl, manifest.source.allowedDownloadHosts);
  } catch (error) {
    return {
      valid: false,
      code: 'unofficial-source',
      message: error instanceof Error ? error.message : String(error),
      metadata,
    };
  }

  if (metadata.provider !== manifest.source.provider) {
    return {
      valid: false,
      code: 'unofficial-source',
      message: `Pinned runtime metadata provider must be ${manifest.source.provider}, but found ${metadata.provider}.`,
      metadata,
    };
  }

  if (metadata.platform !== platform) {
    return {
      valid: false,
      code: 'pinned-version-mismatch',
      message: `Pinned runtime metadata targets ${metadata.platform}, but Desktop requires ${platform}.`,
      metadata,
    };
  }

  const mismatches: string[] = [];
  if (metadata.releaseVersion !== manifest.releaseVersion) {
    mismatches.push(`release version expected ${manifest.releaseVersion} but found ${metadata.releaseVersion}`);
  }
  if (metadata.aspNetCoreVersion !== target.aspNetCoreVersion || runtimeValidation.aspNetCoreVersion !== target.aspNetCoreVersion) {
    mismatches.push(`ASP.NET Core expected ${target.aspNetCoreVersion} but found ${runtimeValidation.aspNetCoreVersion || metadata.aspNetCoreVersion || 'missing'}`);
  }
  if (metadata.netCoreVersion !== target.netCoreVersion || runtimeValidation.netCoreVersion !== target.netCoreVersion) {
    mismatches.push(`Microsoft.NETCore.App expected ${target.netCoreVersion} but found ${runtimeValidation.netCoreVersion || metadata.netCoreVersion || 'missing'}`);
  }
  if (metadata.hostFxrVersion !== target.hostFxrVersion || runtimeValidation.hostFxrVersion !== target.hostFxrVersion) {
    mismatches.push(`host/fxr expected ${target.hostFxrVersion} but found ${runtimeValidation.hostFxrVersion || metadata.hostFxrVersion || 'missing'}`);
  }
  if (metadata.downloadUrl !== target.downloadUrl) {
    mismatches.push('download URL does not match the pinned Microsoft runtime manifest');
  }

  if (mismatches.length > 0) {
    return {
      valid: false,
      code: 'pinned-version-mismatch',
      message: `Pinned runtime metadata mismatch: ${mismatches.join('; ')}`,
      metadata,
    };
  }

  return {
    valid: true,
    metadata,
  };
}

export async function collectMissingFiles(basePath: string, relativePaths: readonly string[]): Promise<string[]> {
  const missing: string[] = [];

  for (const relativePath of relativePaths) {
    if (!(await pathExists(path.join(basePath, relativePath)))) {
      missing.push(relativePath);
    }
  }

  return missing;
}

async function listDirectoryNames(targetPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((entry) => normalizeVersion(entry));
  } catch {
    return [];
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isExecutable(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolvePinnedAspNetCoreVersion(): string | undefined {
  try {
    const platform = detectCurrentPlatform();
    return resolvePinnedRuntimeTarget(platform).aspNetCoreVersion;
  } catch {
    return undefined;
  }
}

function detectCurrentPlatform(): string {
  return detectPinnedRuntimePlatform();
}

function extractMajorVersion(version: string | undefined): number | undefined {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    return undefined;
  }

  return Number.parseInt(normalized.split('.')[0], 10);
}

export function normalizeVersion(version: string | undefined): string | undefined {
  if (!version) {
    return undefined;
  }

  const trimmed = version.trim();
  if (!trimmed) {
    return undefined;
  }

  const main = trimmed.split('-')[0];
  const segments = main.split('.').map((segment) => Number.parseInt(segment, 10));
  if (segments.some((segment) => Number.isNaN(segment))) {
    return undefined;
  }

  while (segments.length < 3) {
    segments.push(0);
  }

  return segments.slice(0, 3).join('.');
}

export function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left)?.split('.').map((segment) => Number.parseInt(segment, 10));
  const rightParts = normalizeVersion(right)?.split('.').map((segment) => Number.parseInt(segment, 10));

  if (!leftParts || !rightParts) {
    return 0;
  }

  for (let index = 0; index < 3; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

export function pickHighestVersion(versions: Array<string | undefined>): string | undefined {
  return versions
    .map((version) => normalizeVersion(version))
    .filter((version): version is string => Boolean(version))
    .sort((left, right) => compareVersions(right, left))[0];
}

export function pickLowestVersion(versions: Array<string | undefined>): string | undefined {
  return versions
    .map((version) => normalizeVersion(version))
    .filter((version): version is string => Boolean(version))
    .sort((left, right) => compareVersions(left, right))[0];
}
