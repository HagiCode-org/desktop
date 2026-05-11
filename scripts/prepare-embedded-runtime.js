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
  isManagedDesktopRuntimeComponentExecution,
  resolveManagedDesktopRuntimeComponentRoot,
} from './desktop-runtime-hagiscript.js';

const runtimePlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform();
const runtimeConfig = readPinnedRuntimeConfig();
const runtimeTarget = resolvePinnedRuntimeTarget(runtimePlatform, runtimeConfig);
const dotnetExecutableName = getDotnetExecutableName(runtimePlatform);
const stageRoot = resolveStagedDesktopRuntimeProgramHome(process.cwd());
const managedExecution = isManagedDesktopRuntimeComponentExecution();
const stagedRuntimeRoot = resolveManagedDesktopRuntimeComponentRoot()
  || resolveStagedDesktopRuntimeComponentRoot('dotnet', {
    cwd: process.cwd(),
    platform: runtimePlatform,
  });
const downloadsRoot = path.join(process.cwd(), 'build', 'embedded-runtime', 'downloads');

const requiresExecutableDotnetHost = !runtimePlatform.startsWith('win-');

main().catch((error) => {
  console.error('[embedded-runtime] Failed to install Desktop embedded runtime:', error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

async function main() {
  ensureOfficialMicrosoftDownloadUrl(runtimeTarget.downloadUrl, runtimeConfig.source?.allowedDownloadHosts || []);
  await rm(stagedRuntimeRoot, { recursive: true, force: true });
  await mkdir(path.dirname(stagedRuntimeRoot), { recursive: true });
  await mkdir(downloadsRoot, { recursive: true });

  const archivePath = path.join(
    downloadsRoot,
    `aspnetcore-runtime-${runtimeConfig.releaseVersion}-${runtimePlatform}.${runtimeTarget.archiveType}`,
  );
  await downloadArchive(runtimeTarget.downloadUrl, archivePath);
  await extractArchive(archivePath, runtimeTarget.archiveType, stagedRuntimeRoot);
  await ensureDotnetExecutable(stagedRuntimeRoot);

  const validation = validateRuntimeLayout(stagedRuntimeRoot);
  ensureExpectedPinnedVersions(validation);
  const metadata = buildRuntimeMetadata(validation, archivePath);
  await writeRuntimeMetadata(metadata);

  console.log(`[embedded-runtime] Installed ${runtimeConfig.releaseVersion} for ${runtimePlatform} from ${runtimeTarget.downloadUrl}`);
  console.log(`[embedded-runtime] Staged runtime root: ${stagedRuntimeRoot}`);
}

async function downloadArchive(downloadUrl, destinationPath) {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download pinned dotnet runtime (${response.status} ${response.statusText}): ${downloadUrl}`);
  }

  await writeFile(destinationPath, Buffer.from(await response.arrayBuffer()));
}

async function extractArchive(archivePath, archiveType, destinationPath) {
  await mkdir(destinationPath, { recursive: true });

  if (archiveType === 'zip') {
    const archive = new AdmZip(archivePath);
    archive.extractAllTo(destinationPath, true);
    return;
  }

  if (archiveType === 'tar.gz') {
    await execa('tar', ['-xzf', archivePath, '-C', destinationPath], {
      stdin: 'ignore',
      stdout: 'inherit',
      stderr: 'inherit',
    });
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
  await writeFile(
    path.join(stageRoot, '.runtime-stage.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );
}
