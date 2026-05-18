#!/usr/bin/env node

import AdmZip from 'adm-zip';
import fs from 'node:fs';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
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
  updateDesktopRuntimeComponents,
  isManagedDesktopRuntimeComponentExecution,
  resolveManagedDesktopRuntimeComponentRoot,
} from './desktop-runtime-hagiscript.js';

const runtimePlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform();
const runtimeConfig = readPinnedRuntimeConfig();
const runtimeTarget = resolvePinnedRuntimeTarget(runtimePlatform, runtimeConfig);
const dotnetExecutableName = getDotnetExecutableName(runtimePlatform);
const managedExecution = isManagedDesktopRuntimeComponentExecution();
const managedComponentRoot = resolveManagedDesktopRuntimeComponentRoot();
const stagedRuntimeRoot = managedComponentRoot
  ? path.join(managedComponentRoot, 'current')
  : resolveStagedDesktopRuntimeComponentRoot('dotnet', {
    cwd: process.cwd(),
    platform: runtimePlatform,
  });
const stageRoot = managedExecution
  ? path.resolve(stagedRuntimeRoot, '..', '..', '..', '..', '..')
  : resolveStagedDesktopRuntimeProgramHome(process.cwd());
const downloadsRoot = path.join(process.cwd(), 'build', 'embedded-runtime', 'downloads');
const overallStartedAt = Date.now();
const forceRestage = process.env.HAGICODE_FORCE_EMBEDDED_RUNTIME_RESTAGE === '1';
const metadataPath = path.join(stagedRuntimeRoot, EMBEDDED_RUNTIME_METADATA_FILE);

const requiresExecutableDotnetHost = !runtimePlatform.startsWith('win-');

if (!managedExecution) {
  if (forceRestage) {
    console.log('[embedded-runtime] Forced restage requested via HAGICODE_FORCE_EMBEDDED_RUNTIME_RESTAGE=1');
  } else if (!fs.existsSync(stagedRuntimeRoot)) {
    console.log(`[embedded-runtime] Existing staged runtime cannot be reused: runtime root is missing at ${stagedRuntimeRoot}`);
  } else if (!fs.existsSync(metadataPath)) {
    console.log(`[embedded-runtime] Existing staged runtime cannot be reused: runtime metadata is missing at ${metadataPath}`);
  }
  await updateDesktopRuntimeComponents(['dotnet'], {
    force: forceRestage || !fs.existsSync(stagedRuntimeRoot) || !fs.existsSync(metadataPath),
  });
  process.exit(0);
}

main().catch((error) => {
  console.error('[embedded-runtime] Failed to install Desktop embedded runtime:', error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

async function main() {
  ensureOfficialMicrosoftDownloadUrl(runtimeTarget.downloadUrl, runtimeConfig.source?.allowedDownloadHosts || []);
  console.log(
    `[embedded-runtime] Staging ASP.NET runtime ${runtimeConfig.releaseVersion} for ${runtimePlatform}`,
  );
  console.log(`[embedded-runtime] Stage root: ${stagedRuntimeRoot}`);
  console.log(`[embedded-runtime] Downloads root: ${downloadsRoot}`);

  console.log(`[embedded-runtime] Clearing staged runtime root at ${stagedRuntimeRoot}`);
  await rm(stagedRuntimeRoot, { recursive: true, force: true });
  await mkdir(path.dirname(stagedRuntimeRoot), { recursive: true });
  await mkdir(downloadsRoot, { recursive: true });

  const archivePath = path.join(
    downloadsRoot,
    `aspnetcore-runtime-${runtimeConfig.releaseVersion}-${runtimePlatform}.${runtimeTarget.archiveType}`,
  );
  console.log(`[embedded-runtime] Archive destination: ${archivePath}`);
  await downloadArchive(runtimeTarget.downloadUrl, archivePath);
  await extractArchive(archivePath, runtimeTarget.archiveType, stagedRuntimeRoot);
  await ensureDotnetExecutable(stagedRuntimeRoot);

  console.log('[embedded-runtime] Validating extracted runtime layout');
  const validation = validateRuntimeLayout(stagedRuntimeRoot);
  ensureExpectedPinnedVersions(validation);
  const metadata = buildRuntimeMetadata(validation, archivePath);
  await writeRuntimeMetadata(metadata);

  console.log(`[embedded-runtime] Installed ${runtimeConfig.releaseVersion} for ${runtimePlatform} from ${runtimeTarget.downloadUrl}`);
  console.log(`[embedded-runtime] Staged runtime root: ${stagedRuntimeRoot}`);
  console.log(`[embedded-runtime] Total prepare time: ${Date.now() - overallStartedAt}ms`);
}

async function downloadArchive(downloadUrl, destinationPath) {
  const startedAt = Date.now();
  console.log(`[embedded-runtime] Downloading runtime archive from ${downloadUrl}`);
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download pinned dotnet runtime (${response.status} ${response.statusText}): ${downloadUrl}`);
  }

  const archiveBuffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destinationPath, archiveBuffer);
  console.log(
    `[embedded-runtime] Downloaded ${(archiveBuffer.byteLength / 1024 / 1024).toFixed(1)} MiB in ${Date.now() - startedAt}ms`,
  );
}

async function extractArchive(archivePath, archiveType, destinationPath) {
  const startedAt = Date.now();
  console.log(`[embedded-runtime] Extracting ${archiveType} archive into ${destinationPath}`);
  await mkdir(destinationPath, { recursive: true });

  if (archiveType === 'zip') {
    const archive = new AdmZip(archivePath);
    archive.extractAllTo(destinationPath, true);
    console.log(`[embedded-runtime] Extraction completed in ${Date.now() - startedAt}ms`);
    return;
  }

  if (archiveType === 'tar.gz') {
    await execa('tar', ['-xzf', archivePath, '-C', destinationPath], {
      stdin: 'ignore',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    console.log(`[embedded-runtime] Extraction completed in ${Date.now() - startedAt}ms`);
    return;
  }

  throw new Error(`Unsupported embedded dotnet archive type: ${archiveType}`);
}

async function ensureDotnetExecutable(runtimeRoot) {
  if (!requiresExecutableDotnetHost) {
    return;
  }

  const dotnetPath = path.join(runtimeRoot, dotnetExecutableName);
  if (!fs.existsSync(dotnetPath)) {
    return;
  }

  const currentMode = fs.statSync(dotnetPath).mode;
  await chmod(dotnetPath, currentMode | 0o755);
  console.log(`[embedded-runtime] Ensured executable permissions for ${dotnetPath}`);
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

function buildRuntimeMetadata(validation, archivePath) {
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
    archivePath,
    dotnetPath: path.join(stagedRuntimeRoot, dotnetExecutableName),
    runtimeRoot: stagedRuntimeRoot,
    aspNetCoreVersion: validation.aspNetCoreVersion,
    netCoreVersion: validation.netCoreVersion,
    hostFxrVersion: validation.hostFxrVersion,
    stagedAt: new Date().toISOString(),
    ownership: managedExecution ? 'desktop-direct-managed' : 'desktop-direct',
  };
}

async function writeRuntimeMetadata(metadata) {
  await writeFile(
    path.join(stagedRuntimeRoot, EMBEDDED_RUNTIME_METADATA_FILE),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );
  console.log(`[embedded-runtime] Wrote runtime metadata to ${path.join(stagedRuntimeRoot, EMBEDDED_RUNTIME_METADATA_FILE)}`);
  await writeFile(
    path.join(stageRoot, '.runtime-stage.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );
  console.log(`[embedded-runtime] Wrote stage metadata to ${path.join(stageRoot, '.runtime-stage.json')}`);
}
