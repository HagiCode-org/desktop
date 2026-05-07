#!/usr/bin/env node

import fs from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  EMBEDDED_RUNTIME_METADATA_FILE,
  detectRuntimePlatform,
  ensureOfficialMicrosoftDownloadUrl,
  getDotnetExecutableName,
  readPinnedRuntimeConfig,
  resolvePinnedRuntimeTarget,
} from './embedded-runtime-config.js';
import { resolveStagedDesktopRuntimeComponentRoot, resolveStagedDesktopRuntimeProgramHome } from './desktop-runtime-layout.js';
import {
  installDesktopRuntimeComponents,
  isManagedDesktopRuntimeComponentExecution,
  resolveManagedDesktopRuntimeComponentRoot,
} from './desktop-runtime-hagiscript.js';
import {
  assertGlobalHagiscriptAvailable,
  resolveGlobalHagiscriptPackageRoot,
} from './global-hagiscript.js';

const MINIMUM_HAGISCRIPT_VERSION = '0.1.10';

if (!isManagedDesktopRuntimeComponentExecution()) {
  await installDesktopRuntimeComponents(['dotnet']);
  process.exit(0);
}

const runtimePlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform();
const runtimeConfig = readPinnedRuntimeConfig();
const runtimeTarget = resolvePinnedRuntimeTarget(runtimePlatform, runtimeConfig);
const dotnetExecutableName = getDotnetExecutableName(runtimePlatform);
const stageRoot = resolveStagedDesktopRuntimeProgramHome(process.cwd());
const stagedRuntimeRoot = resolveManagedDesktopRuntimeComponentRoot()
  || resolveStagedDesktopRuntimeComponentRoot('dotnet', {
    cwd: process.cwd(),
    platform: runtimePlatform,
  });
const hagiscriptPackageRoot = resolveGlobalHagiscriptPackageRoot(MINIMUM_HAGISCRIPT_VERSION);
const {
  installManagedDotnetRuntime,
  verifyManagedDotnetRuntime,
} = await import(pathToFileURL(path.join(hagiscriptPackageRoot, 'dist', 'runtime', 'dotnet-installer.js')).href);

const requiresExecutableDotnetHost = !runtimePlatform.startsWith('win-');

main().catch((error) => {
  console.error('[embedded-runtime] Failed to install Desktop runtime through hagiscript:', error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

async function main() {
  const hagiscriptVersion = assertGlobalHagiscriptAvailable(MINIMUM_HAGISCRIPT_VERSION);
  ensureOfficialMicrosoftDownloadUrl(runtimeTarget.downloadUrl, runtimeConfig.source?.allowedDownloadHosts || []);
  await rm(stagedRuntimeRoot, { recursive: true, force: true });
  await mkdir(path.dirname(stagedRuntimeRoot), { recursive: true });

  const installation = await installManagedDotnetRuntime({
    targetDirectory: stagedRuntimeRoot,
    version: runtimeConfig.releaseVersion,
    verbose: process.env.HAGICODE_RUNTIME_VERBOSE === '1',
    scriptBaseUrl: process.env.HAGISCRIPT_DOTNET_INSTALL_SCRIPT_BASE_URL?.trim() || undefined,
  });

  if (!installation.valid) {
    throw new Error(installation.failureReason || 'Managed .NET runtime install failed.');
  }

  const validation = validateRuntimeLayout(stagedRuntimeRoot);
  ensureExpectedPinnedVersions(validation);

  const verification = await verifyManagedDotnetRuntime({
    targetDirectory: stagedRuntimeRoot,
    version: runtimeConfig.releaseVersion,
  });
  if (!verification.valid) {
    throw new Error(verification.failureReason || 'Managed .NET runtime verification failed.');
  }

  const metadata = buildRuntimeMetadata(validation);
  await writeRuntimeMetadata(metadata);

  console.log(`[embedded-runtime] Installed ${runtimeConfig.releaseVersion} for ${runtimePlatform} via hagiscript ${hagiscriptVersion}`);
  console.log(`[embedded-runtime] Staged runtime root: ${stagedRuntimeRoot}`);
}

function listVersionDirectories(targetPath) {
  try {
    return fs.readdirSync(targetPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((entry) => /^\d+(?:\.\d+){1,3}$/.test(entry));
  } catch {
    return [];
  }
}

function compareVersions(left, right) {
  const leftParts = left.split('.').map((segment) => Number.parseInt(segment, 10));
  const rightParts = right.split('.').map((segment) => Number.parseInt(segment, 10));

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftValue = leftParts[index] || 0;
    const rightValue = rightParts[index] || 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

function pickHighestVersion(versions) {
  return [...versions].sort((left, right) => compareVersions(right, left))[0];
}

function isExecutable(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function validateRuntimeLayout(runtimeRoot) {
  const missing = [];
  const dotnetPath = path.join(runtimeRoot, dotnetExecutableName);
  if (!fs.existsSync(dotnetPath)) {
    missing.push(dotnetExecutableName);
  } else if (requiresExecutableDotnetHost && !isExecutable(dotnetPath)) {
    missing.push(`${dotnetExecutableName} (not executable)`);
  }

  const hostFxrRoot = path.join(runtimeRoot, 'host', 'fxr');
  const fxrVersions = listVersionDirectories(hostFxrRoot);
  if (fxrVersions.length === 0) {
    missing.push('host/fxr');
  }

  const aspNetCoreRoot = path.join(runtimeRoot, 'shared', 'Microsoft.AspNetCore.App');
  const aspNetCoreVersions = listVersionDirectories(aspNetCoreRoot);
  if (aspNetCoreVersions.length === 0) {
    missing.push('shared/Microsoft.AspNetCore.App');
  }

  const netCoreRoot = path.join(runtimeRoot, 'shared', 'Microsoft.NETCore.App');
  const netCoreVersions = listVersionDirectories(netCoreRoot);
  if (netCoreVersions.length === 0) {
    missing.push('shared/Microsoft.NETCore.App');
  }

  if (missing.length > 0) {
    throw new Error(`Runtime payload is incomplete at ${runtimeRoot}. Missing: ${missing.join(', ')}`);
  }

  return {
    dotnetPath,
    aspNetCoreVersion: pickHighestVersion(aspNetCoreVersions),
    netCoreVersion: pickHighestVersion(netCoreVersions),
    hostFxrVersion: pickHighestVersion(fxrVersions),
  };
}

function ensureExpectedPinnedVersions(validation) {
  const mismatches = [];

  if (validation.aspNetCoreVersion !== runtimeTarget.aspNetCoreVersion) {
    mismatches.push(`Microsoft.AspNetCore.App expected ${runtimeTarget.aspNetCoreVersion} but found ${validation.aspNetCoreVersion || 'missing'}`);
  }
  if (validation.netCoreVersion !== runtimeTarget.netCoreVersion) {
    mismatches.push(`Microsoft.NETCore.App expected ${runtimeTarget.netCoreVersion} but found ${validation.netCoreVersion || 'missing'}`);
  }
  if (validation.hostFxrVersion !== runtimeTarget.hostFxrVersion) {
    mismatches.push(`host/fxr expected ${runtimeTarget.hostFxrVersion} but found ${validation.hostFxrVersion || 'missing'}`);
  }

  if (mismatches.length > 0) {
    throw new Error(`Pinned runtime validation failed for ${runtimePlatform}: ${mismatches.join('; ')}`);
  }
}

function buildRuntimeMetadata(validation) {
  const sourceUrl = ensureOfficialMicrosoftDownloadUrl(
    runtimeTarget.downloadUrl,
    runtimeConfig.source?.allowedDownloadHosts || [],
  );

  return {
    schemaVersion: 1,
    platform: runtimePlatform,
    provider: runtimeConfig.source.provider,
    releaseMetadataUrl: runtimeConfig.source.releaseMetadataUrl,
    allowedDownloadHosts: runtimeConfig.source.allowedDownloadHosts,
    releaseVersion: runtimeConfig.releaseVersion,
    releaseDate: runtimeConfig.releaseDate,
    downloadUrl: runtimeTarget.downloadUrl,
    sourceHost: sourceUrl.hostname,
    archiveType: runtimeTarget.archiveType,
    archivePath: null,
    dotnetPath: path.join(stagedRuntimeRoot, dotnetExecutableName),
    runtimeRoot: stagedRuntimeRoot,
    aspNetCoreVersion: validation.aspNetCoreVersion,
    netCoreVersion: validation.netCoreVersion,
    hostFxrVersion: validation.hostFxrVersion,
    stagedAt: new Date().toISOString(),
    ownership: 'hagiscript-managed',
  };
}

async function writeRuntimeMetadata(metadata) {
  await writeFile(
    path.join(stagedRuntimeRoot, EMBEDDED_RUNTIME_METADATA_FILE),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(stageRoot, '.runtime-stage.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );
}
