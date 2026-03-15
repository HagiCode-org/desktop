#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import AdmZip from 'adm-zip';
import {
  EMBEDDED_RUNTIME_METADATA_FILE,
  detectRuntimePlatform,
  ensureOfficialMicrosoftDownloadUrl,
  getDotnetExecutableName,
  readPinnedRuntimeConfig,
  resolvePinnedRuntimeTarget,
} from './embedded-runtime-config.js';

const runtimePlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform();
const runtimeConfig = readPinnedRuntimeConfig();
const runtimeTarget = resolvePinnedRuntimeTarget(runtimePlatform, runtimeConfig);
const dotnetExecutableName = getDotnetExecutableName(runtimePlatform);
const stageRoot = path.join(process.cwd(), 'build', 'embedded-runtime', 'current');
const downloadsRoot = path.join(process.cwd(), 'build', 'embedded-runtime', 'downloads');
const stagedRuntimeRoot = path.join(stageRoot, 'dotnet', runtimePlatform);
const requiresExecutableDotnetHost = !runtimePlatform.startsWith('win-');

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

function isExecutable(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function ensureBundledDotnetHost(runtimeRoot) {
  if (!requiresExecutableDotnetHost) {
    return;
  }

  const dotnetPath = path.join(runtimeRoot, dotnetExecutableName);
  const currentMode = fs.statSync(dotnetPath).mode;
  const executableMode = currentMode | 0o755;
  if (currentMode !== executableMode) {
    fs.chmodSync(dotnetPath, executableMode);
  }
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

async function downloadRuntimeArchive(downloadUrl, destinationPath) {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download runtime archive (${response.status} ${response.statusText}): ${downloadUrl}`);
  }

  const payload = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destinationPath, payload);
}

function extractArchive(archivePath, archiveType, destinationPath) {
  if (archiveType === 'zip') {
    const archive = new AdmZip(archivePath);
    archive.extractAllTo(destinationPath, true);
    return;
  }

  if (archiveType === 'tar.gz') {
    execFileSync('tar', ['-xzf', archivePath, '-C', destinationPath], { stdio: 'inherit' });
    return;
  }

  throw new Error(`Unsupported embedded runtime archive type: ${archiveType}`);
}

function findExtractedRuntimeRoot(extractRoot) {
  if (fs.existsSync(path.join(extractRoot, dotnetExecutableName))) {
    return extractRoot;
  }

  const entries = fs.readdirSync(extractRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (entries.length === 1) {
    const nestedRoot = path.join(extractRoot, entries[0].name);
    if (fs.existsSync(path.join(nestedRoot, dotnetExecutableName))) {
      return nestedRoot;
    }
  }

  throw new Error(`Extracted runtime payload at ${extractRoot} does not contain ${dotnetExecutableName}`);
}

function writeRuntimeMetadata(validation, archivePath) {
  const sourceUrl = ensureOfficialMicrosoftDownloadUrl(
    runtimeTarget.downloadUrl,
    runtimeConfig.source?.allowedDownloadHosts || [],
  );

  const metadata = {
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
  };

  fs.writeFileSync(
    path.join(stagedRuntimeRoot, EMBEDDED_RUNTIME_METADATA_FILE),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );

  fs.writeFileSync(
    path.join(stageRoot, '.runtime-stage.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );

  return metadata;
}

function validateWrittenRuntimeMetadata(metadata) {
  const metadataPath = path.join(stagedRuntimeRoot, EMBEDDED_RUNTIME_METADATA_FILE);
  const persisted = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const errors = [];

  if (persisted.platform !== runtimePlatform) {
    errors.push(`platform expected ${runtimePlatform} but found ${persisted.platform || 'missing'}`);
  }
  if (persisted.downloadUrl !== runtimeTarget.downloadUrl) {
    errors.push('downloadUrl does not match the pinned runtime manifest');
  }
  if (persisted.runtimeRoot !== stagedRuntimeRoot) {
    errors.push(`runtimeRoot expected ${stagedRuntimeRoot} but found ${persisted.runtimeRoot || 'missing'}`);
  }
  if (persisted.dotnetPath !== metadata.dotnetPath) {
    errors.push(`dotnetPath expected ${metadata.dotnetPath} but found ${persisted.dotnetPath || 'missing'}`);
  }
  if (persisted.aspNetCoreVersion !== runtimeTarget.aspNetCoreVersion) {
    errors.push(`ASP.NET Core version expected ${runtimeTarget.aspNetCoreVersion} but found ${persisted.aspNetCoreVersion || 'missing'}`);
  }
  if (persisted.netCoreVersion !== runtimeTarget.netCoreVersion) {
    errors.push(`Microsoft.NETCore.App version expected ${runtimeTarget.netCoreVersion} but found ${persisted.netCoreVersion || 'missing'}`);
  }
  if (persisted.hostFxrVersion !== runtimeTarget.hostFxrVersion) {
    errors.push(`host/fxr version expected ${runtimeTarget.hostFxrVersion} but found ${persisted.hostFxrVersion || 'missing'}`);
  }

  if (errors.length > 0) {
    throw new Error(`Pinned runtime metadata validation failed for ${runtimePlatform}: ${errors.join('; ')}`);
  }
}

async function stageRuntime() {
  fs.mkdirSync(downloadsRoot, { recursive: true });
  ensureOfficialMicrosoftDownloadUrl(runtimeTarget.downloadUrl, runtimeConfig.source?.allowedDownloadHosts || []);

  const archiveExtension = runtimeTarget.archiveType === 'zip' ? 'zip' : 'tar.gz';
  const archivePath = path.join(downloadsRoot, `${runtimePlatform}-${runtimeConfig.releaseVersion}.${archiveExtension}`);

  if (!fs.existsSync(archivePath)) {
    console.log(`[embedded-runtime] Downloading ${runtimePlatform} runtime from ${runtimeTarget.downloadUrl}`);
    await downloadRuntimeArchive(runtimeTarget.downloadUrl, archivePath);
  } else {
    console.log(`[embedded-runtime] Reusing cached runtime archive ${archivePath}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `hagicode-runtime-${runtimePlatform}-`));

  try {
    extractArchive(archivePath, runtimeTarget.archiveType, tempRoot);
    const extractedRuntimeRoot = findExtractedRuntimeRoot(tempRoot);

    fs.rmSync(stageRoot, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(stagedRuntimeRoot), { recursive: true });
    fs.cpSync(extractedRuntimeRoot, stagedRuntimeRoot, { recursive: true, force: true });
    ensureBundledDotnetHost(stagedRuntimeRoot);

    const validation = validateRuntimeLayout(stagedRuntimeRoot);
    ensureExpectedPinnedVersions(validation);
    const metadata = writeRuntimeMetadata(validation, archivePath);
    validateWrittenRuntimeMetadata(metadata);

    console.log(`[embedded-runtime] Staged ${runtimePlatform} runtime from ${runtimeTarget.downloadUrl}`);
    console.log(`[embedded-runtime] ASP.NET Core ${validation.aspNetCoreVersion} -> ${stagedRuntimeRoot}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

stageRuntime().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[embedded-runtime] ${message}`);
  process.exit(1);
});
