import path from 'node:path';
import fs from 'node:fs/promises';
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
  requiredMajor?: number;
  label: string;
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
}

export interface RuntimeCompatibilityResult {
  compatible: boolean;
  reason?: string;
  embeddedVersion?: string;
  requiredVersionLabel: string;
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
): AspNetRuntimeRequirement {
  const normalizedRuntimeConfigVersion = normalizeVersion(runtimeConfigVersion);
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
    ?? maximumVersion,
  );

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
    requiredMajor,
    label,
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
      requiredVersionLabel: requirement.label,
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

  if (requirement.minimumVersion && compareVersions(normalizedEmbeddedVersion, requirement.minimumVersion) < 0) {
    return {
      compatible: false,
      reason: `Service requires ASP.NET Core >= ${requirement.minimumVersion}, but Desktop bundles ${normalizedEmbeddedVersion}.`,
      embeddedVersion: normalizedEmbeddedVersion,
      requiredVersionLabel: requirement.minimumVersion,
    };
  }

  if (requirement.maximumVersion && compareVersions(normalizedEmbeddedVersion, requirement.maximumVersion) > 0) {
    return {
      compatible: false,
      reason: `Service supports ASP.NET Core <= ${requirement.maximumVersion}, but Desktop bundles ${normalizedEmbeddedVersion}.`,
      embeddedVersion: normalizedEmbeddedVersion,
      requiredVersionLabel: requirement.maximumVersion,
    };
  }

  return {
    compatible: true,
    embeddedVersion: normalizedEmbeddedVersion,
    requiredVersionLabel: requirement.label,
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
    const requirement = resolveAspNetCoreRuntimeRequirement(runtimeConfigVersion, manifestRuntime);

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

export function extractMajorVersion(version: string | undefined): number | undefined {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    return undefined;
  }

  return Number.parseInt(normalized.split('.')[0], 10);
}
