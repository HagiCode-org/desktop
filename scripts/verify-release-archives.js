#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import AdmZip from 'adm-zip';
import {
  EMBEDDED_RUNTIME_METADATA_FILE,
  detectRuntimePlatform,
  ensureOfficialMicrosoftDownloadUrl,
  getDotnetExecutableName,
  readPinnedRuntimeConfig,
  resolvePinnedRuntimeTarget,
} from './embedded-runtime-config.js';
import { detectNodeRuntimePlatform } from './embedded-node-runtime-config.js';
import {
  readToolchainManifest,
  validateToolchainManifest,
  validateToolchainPayload,
} from './bundled-toolchain-contract.js';
import { resolveBundledNodePolicy } from './runtime-node-policy.js';

const args = process.argv.slice(2);
const archives = [];
const runtimePlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform();
const runtimeConfig = readPinnedRuntimeConfig();
const runtimeTarget = resolvePinnedRuntimeTarget(runtimePlatform, runtimeConfig);
const fallbackPlatform = process.env.HAGICODE_EMBEDDED_NODE_PLATFORM || detectNodeRuntimePlatform();
const bundledNodePolicy = resolveBundledNodePolicy({ cwd: process.cwd(), env: process.env });

function parseArgs() {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--archive') {
      const archivePath = args[index + 1];
      if (!archivePath) {
        throw new Error('--archive requires a path value');
      }
      archives.push(path.resolve(process.cwd(), archivePath));
      index += 1;
      continue;
    }

    if (arg === '--help') {
      console.log('Usage: node scripts/verify-release-archives.js [--archive <path> ...]');
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }
}

function listDiscoveredArchives() {
  const pkgRoot = path.join(process.cwd(), 'pkg');
  if (!fs.existsSync(pkgRoot)) {
    throw new Error(`pkg directory does not exist: ${pkgRoot}`);
  }

  const entries = fs.readdirSync(pkgRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  return selectDiscoveredArchives(entries).map((name) => path.join(pkgRoot, name));
}

function resolveMacArchiveArch(options = {}) {
  const requestedPlatforms = [
    options.runtimePlatform ?? runtimePlatform,
    options.fallbackPlatform ?? fallbackPlatform,
  ].filter(Boolean);

  if (requestedPlatforms.some((platform) => platform === 'osx-arm64')) {
    return 'arm64';
  }

  if (requestedPlatforms.some((platform) => platform === 'osx-x64')) {
    return 'x64';
  }

  return null;
}

function selectDiscoveredArchives(entries, options = {}) {
  const platform = options.platform ?? process.platform;

  if (platform === 'linux') {
    return entries
      .filter((name) => name.endsWith('.zip') || name.endsWith('.tar.gz'))
      .sort();
  }

  if (platform === 'darwin') {
    const zipEntries = entries.filter((name) => name.endsWith('.zip')).sort();
    const desiredArch = resolveMacArchiveArch(options);

    if (desiredArch === 'arm64') {
      const arm64Entries = zipEntries.filter((name) => /-(?:arm64|aarch64)-mac\.zip$/i.test(name));
      return arm64Entries.length > 0 ? arm64Entries : zipEntries;
    }

    if (desiredArch === 'x64') {
      const explicitX64Entries = zipEntries.filter((name) => /-x64-mac\.zip$/i.test(name));
      if (explicitX64Entries.length > 0) {
        return explicitX64Entries;
      }

      const implicitX64Entries = zipEntries.filter(
        (name) => /-mac\.zip$/i.test(name) && !/-(?:arm64|aarch64)-mac\.zip$/i.test(name),
      );
      return implicitX64Entries.length > 0 ? implicitX64Entries : zipEntries;
    }

    return zipEntries;
  }

  if (platform === 'win32') {
    return entries
      .filter((name) => name.endsWith('.zip'))
      .sort();
  }

  return [];
}

function ensureArchivesSelected() {
  if (archives.length > 0) {
    return archives;
  }

  const discovered = listDiscoveredArchives();
  if (discovered.length === 0) {
    throw new Error(`No release archives were discovered for validation on ${process.platform}.`);
  }

  return discovered;
}

function suffixSegments(relativePath) {
  return relativePath.split(path.sep).filter(Boolean);
}

function pathExists(targetPath) {
  return fs.existsSync(targetPath);
}

function isExecutable(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
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

function inspectDotnetRuntimeVersions(runtimeRoot) {
  return {
    aspNetCoreVersion: pickHighestVersion(listVersionDirectories(path.join(runtimeRoot, 'shared', 'Microsoft.AspNetCore.App'))),
    netCoreVersion: pickHighestVersion(listVersionDirectories(path.join(runtimeRoot, 'shared', 'Microsoft.NETCore.App'))),
    hostFxrVersion: pickHighestVersion(listVersionDirectories(path.join(runtimeRoot, 'host', 'fxr'))),
  };
}

function validateDotnetRuntimePayload(runtimeRoot, options = {}) {
  const errors = [];
  const dotnetExecutableName = getDotnetExecutableName(runtimePlatform);
  const dotnetPath = path.join(runtimeRoot, dotnetExecutableName);
  const requireExecutableDotnetHost = !runtimePlatform.startsWith('win-') && !options.extractedFromZip;

  if (!pathExists(dotnetPath)) {
    errors.push(`missing ${dotnetExecutableName}`);
  } else if (requireExecutableDotnetHost && !isExecutable(dotnetPath)) {
    errors.push(`${dotnetExecutableName} is not executable`);
  }

  if (listVersionDirectories(path.join(runtimeRoot, 'host', 'fxr')).length === 0) {
    errors.push('missing host/fxr');
  }
  if (listVersionDirectories(path.join(runtimeRoot, 'shared', 'Microsoft.AspNetCore.App')).length === 0) {
    errors.push('missing shared/Microsoft.AspNetCore.App');
  }
  if (listVersionDirectories(path.join(runtimeRoot, 'shared', 'Microsoft.NETCore.App')).length === 0) {
    errors.push('missing shared/Microsoft.NETCore.App');
  }

  const metadataPath = path.join(runtimeRoot, EMBEDDED_RUNTIME_METADATA_FILE);
  if (!pathExists(metadataPath)) {
    errors.push(`missing ${EMBEDDED_RUNTIME_METADATA_FILE}`);
    return errors;
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const versions = inspectDotnetRuntimeVersions(runtimeRoot);
  ensureOfficialMicrosoftDownloadUrl(metadata.downloadUrl, runtimeConfig.source?.allowedDownloadHosts || []);

  if (metadata.provider !== runtimeConfig.source.provider) {
    errors.push(`provider expected ${runtimeConfig.source.provider} but found ${metadata.provider || 'missing'}`);
  }
  if (metadata.platform !== runtimePlatform) {
    errors.push(`platform expected ${runtimePlatform} but found ${metadata.platform || 'missing'}`);
  }
  if (metadata.releaseVersion !== runtimeConfig.releaseVersion) {
    errors.push(`releaseVersion expected ${runtimeConfig.releaseVersion} but found ${metadata.releaseVersion || 'missing'}`);
  }
  if (metadata.downloadUrl !== runtimeTarget.downloadUrl) {
    errors.push('downloadUrl does not match the pinned runtime manifest');
  }
  if (metadata.aspNetCoreVersion !== runtimeTarget.aspNetCoreVersion) {
    errors.push(`metadata ASP.NET Core version expected ${runtimeTarget.aspNetCoreVersion} but found ${metadata.aspNetCoreVersion || 'missing'}`);
  }
  if (metadata.netCoreVersion !== runtimeTarget.netCoreVersion) {
    errors.push(`metadata Microsoft.NETCore.App version expected ${runtimeTarget.netCoreVersion} but found ${metadata.netCoreVersion || 'missing'}`);
  }
  if (metadata.hostFxrVersion !== runtimeTarget.hostFxrVersion) {
    errors.push(`metadata host/fxr version expected ${runtimeTarget.hostFxrVersion} but found ${metadata.hostFxrVersion || 'missing'}`);
  }
  if (versions.aspNetCoreVersion !== runtimeTarget.aspNetCoreVersion) {
    errors.push(`runtime ASP.NET Core version expected ${runtimeTarget.aspNetCoreVersion} but found ${versions.aspNetCoreVersion || 'missing'}`);
  }
  if (versions.netCoreVersion !== runtimeTarget.netCoreVersion) {
    errors.push(`runtime Microsoft.NETCore.App version expected ${runtimeTarget.netCoreVersion} but found ${versions.netCoreVersion || 'missing'}`);
  }
  if (versions.hostFxrVersion !== runtimeTarget.hostFxrVersion) {
    errors.push(`runtime host/fxr version expected ${runtimeTarget.hostFxrVersion} but found ${versions.hostFxrVersion || 'missing'}`);
  }

  return errors;
}

function findToolchainRoots(rootPath) {
  const matches = [];
  const stack = [rootPath];
  const seen = new Set();

  while (stack.length > 0) {
    const currentPath = stack.pop();
    const manifestPath = path.join(currentPath, 'toolchain-manifest.json');
    if (fs.existsSync(manifestPath) && !seen.has(currentPath)) {
      matches.push(currentPath);
      seen.add(currentPath);
    }

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, absolutePath);
      const parts = suffixSegments(relativePath);
      if (parts.length >= 2 && parts.at(-2) === 'extra' && parts.at(-1) === 'toolchain' && !seen.has(absolutePath)) {
        matches.push(absolutePath);
        seen.add(absolutePath);
        continue;
      }

      stack.push(absolutePath);
    }
  }

  return matches.sort();
}

function collectToolchainRoots(rootPath) {
  return [
    ...new Set([
      ...findExtraRoots(rootPath, ['node', 'runtime']),
      ...findToolchainRoots(rootPath),
    ]),
  ].sort();
}

function findExtraRoots(rootPath, suffixParts) {
  const exactMatches = [];
  const fallbackMatches = [];
  const stack = [rootPath];
  const alternateSuffixParts = suffixParts.at(-1) === 'current'
    ? suffixParts.slice(0, -1)
    : null;

  while (stack.length > 0) {
    const currentPath = stack.pop();
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, absolutePath);
      const parts = suffixSegments(relativePath);

      const matchesSuffix = (expectedParts) => {
        if (!expectedParts || parts.length < expectedParts.length) {
          return false;
        }

        const tail = parts.slice(-(expectedParts.length));
        return tail.every((value, index) => value === expectedParts[index]);
      };

      if (parts.includes('extra') && matchesSuffix(suffixParts)) {
        exactMatches.push(absolutePath);
        continue;
      }

      if (parts.includes('extra') && matchesSuffix(alternateSuffixParts)) {
        fallbackMatches.push(absolutePath);
      }

      stack.push(absolutePath);
    }
  }

  return (exactMatches.length > 0 ? exactMatches : fallbackMatches).sort();
}

function describeToolchainRoots(rootPath) {
  return collectToolchainRoots(rootPath)
    .map((candidate) => path.relative(rootPath, candidate) || '.')
    .join(', ');
}

function resolveToolchainValidation(rootPath, options = {}) {
  const toolchainRoots = options.toolchainRoots ?? collectToolchainRoots(rootPath);
  const requireBundledNodePayload = options.requireBundledNodePayload ?? bundledNodePolicy.required;
  const skipReason = options.skipReason ?? bundledNodePolicy.reason;

  return {
    toolchainRoots,
    requireBundledNodePayload,
    skipReason,
    shouldValidate: requireBundledNodePayload || toolchainRoots.length > 0,
  };
}

function validateVendoredRuntimeRoots(archivePath, extractionRoot, options) {
  const runtimeRoots = findExtraRoots(extractionRoot, options.suffixParts);
  if (runtimeRoots.length === 0) {
    throw new Error(`No packaged ${options.label} roots were found in ${archivePath}.`);
  }

  const failures = [];
  for (const runtimeRoot of runtimeRoots) {
    const errors = options.validate(runtimeRoot);
    if (errors.length === 0) {
      console.log(`[archive-verify] ${path.basename(archivePath)} -> ${path.relative(extractionRoot, runtimeRoot)} (${options.platform}) OK`);
      return;
    }

    failures.push(`${path.relative(extractionRoot, runtimeRoot)}: ${errors.join('; ')}`);
  }

  throw new Error(`Archive ${archivePath} failed ${options.label} validation: ${failures.join(' | ')}`);
}

function validateExtractedToolchain(archivePath, extractionRoot, options = {}) {
  const toolchainRoots = options.toolchainRoots ?? collectToolchainRoots(extractionRoot);
  if (toolchainRoots.length === 0) {
    const available = describeToolchainRoots(extractionRoot);
    throw new Error(
      available
        ? `No packaged toolchain roots were found in ${archivePath}. Scanned roots: ${available}`
        : `No packaged toolchain roots were found in ${archivePath}.`,
    );
  }

  const failures = [];
  for (const toolchainRoot of toolchainRoots) {
    const manifest = readToolchainManifest(toolchainRoot);
    const platform = manifest?.platform || fallbackPlatform;
    const payloadErrors = validateToolchainPayload(toolchainRoot, {
      platform,
      extractedFromZip: options.extractedFromZip,
    });
    const manifestErrors = validateToolchainManifest(toolchainRoot, { platform });
    if (payloadErrors.length === 0 && manifestErrors.length === 0) {
      console.log(`[archive-verify] ${path.basename(archivePath)} -> ${path.relative(extractionRoot, toolchainRoot)} (${platform}) OK`);
      return;
    }

    failures.push(
      `${path.relative(extractionRoot, toolchainRoot)}: ${[...payloadErrors, ...manifestErrors].join('; ')}`,
    );
  }

  throw new Error(`Archive ${archivePath} failed toolchain validation: ${failures.join(' | ')}`);
}

function validateExtractedArchiveContents(archivePath, extractionRoot, options = {}) {
  const toolchainValidation = resolveToolchainValidation(extractionRoot, options);
  if (toolchainValidation.shouldValidate) {
    validateExtractedToolchain(archivePath, extractionRoot, {
      extractedFromZip: options.extractedFromZip,
      toolchainRoots: toolchainValidation.toolchainRoots,
    });
  } else {
    const reasonSuffix = toolchainValidation.skipReason ? ` (${toolchainValidation.skipReason})` : '';
    console.log(`[archive-verify] ${path.basename(archivePath)} -> skipping bundled Node toolchain validation${reasonSuffix}`);
  }

  validateVendoredRuntimeRoots(archivePath, extractionRoot, {
    label: 'embedded dotnet runtime',
    suffixParts: ['dotnet', 'runtime', runtimePlatform, 'current'],
    platform: runtimePlatform,
    validate: (runtimeRoot) => validateDotnetRuntimePayload(runtimeRoot, { extractedFromZip: options.extractedFromZip }),
  });
}

function extractZip(archivePath, destinationRoot) {
  const archive = new AdmZip(archivePath);
  archive.extractAllTo(destinationRoot, true);
  validateExtractedArchiveContents(archivePath, destinationRoot, { extractedFromZip: true });
}

function extractTarGz(archivePath, destinationRoot) {
  execFileSync('tar', ['-xzf', archivePath, '-C', destinationRoot], { stdio: 'inherit' });
  validateExtractedArchiveContents(archivePath, destinationRoot, { extractedFromZip: false });
}

function verifyArchive(archivePath) {
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Release archive does not exist: ${archivePath}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hagicode-release-archive-'));
  try {
    if (archivePath.endsWith('.zip')) {
      extractZip(archivePath, tempRoot);
      return;
    }

    if (archivePath.endsWith('.tar.gz')) {
      extractTarGz(archivePath, tempRoot);
      return;
    }

    throw new Error(`Unsupported release archive type: ${archivePath}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  parseArgs();
  const selectedArchives = ensureArchivesSelected();
  for (const archivePath of selectedArchives) {
    verifyArchive(archivePath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export {
  resolveToolchainValidation,
  resolveMacArchiveArch,
  selectDiscoveredArchives,
};
