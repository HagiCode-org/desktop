#!/usr/bin/env node

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import AdmZip from 'adm-zip';
import {
  TOOLCHAIN_MANIFEST_FILE,
  detectNodeRuntimePlatform,
  ensureOfficialNodeDownloadUrl,
  getCommandExecutableName,
  getNodeExecutableRelativePath,
  getNpmExecutableRelativePath,
  getNpmExecutableRelativePathCandidates,
  getNpmGlobalBinRelativePath,
  getNpmGlobalModulesRelativePath,
  readPinnedNodeRuntimeConfig,
  resolvePinnedNodeRuntimeTarget,
} from './embedded-node-runtime-config.js';

const runtimePlatform = process.env.HAGICODE_EMBEDDED_NODE_PLATFORM || detectNodeRuntimePlatform();
const runtimeConfig = readPinnedNodeRuntimeConfig();
const runtimeTarget = resolvePinnedNodeRuntimeTarget(runtimePlatform, runtimeConfig);
const resourcesRoot = path.join(process.cwd(), 'resources', 'portable-fixed');
const toolchainRoot = path.join(resourcesRoot, 'toolchain');
const nodeRoot = path.join(toolchainRoot, 'node');
const binRoot = path.join(toolchainRoot, 'bin');
const envRoot = path.join(toolchainRoot, 'env');
const npmGlobalRoot = path.join(toolchainRoot, 'npm-global');
const downloadsRoot = path.join(process.cwd(), 'build', 'embedded-node-runtime', 'downloads');
const packageEntries = Object.entries(runtimeConfig.corePackages || {});
const stagingDiagnostics = {
  archiveName: runtimeTarget.archiveName,
  archiveType: runtimeTarget.archiveType,
  downloadUrl: runtimeTarget.downloadUrl,
  extractRoot: runtimeTarget.extractRoot,
  platform: runtimePlatform,
  attemptedCandidates: [],
};
let resolvedNodeCommand = null;
let resolvedNpmCommand = null;
let prunedToolchainEntries = 0;

function isWindowsPlatform(platform) {
  return platform.startsWith('win-');
}

function toPosixPath(relativePath) {
  return String(relativePath).split(path.sep).join('/');
}

function toWindowsPath(relativePath) {
  return String(relativePath).split('/').join('\\');
}

function pathExists(targetPath) {
  return fs.existsSync(targetPath);
}

function pathExistsOrIsSymlink(targetPath) {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function toRelativeToolchainPath(targetPath) {
  return path.relative(toolchainRoot, targetPath);
}

function toAbsoluteToolchainPath(relativePath) {
  return path.join(toolchainRoot, relativePath);
}

function recordCandidate(commandName, relativePath, exists) {
  stagingDiagnostics.attemptedCandidates.push({ commandName, relativePath, exists });
}

function ensureExecutable(targetPath) {
  if (isWindowsPlatform(runtimePlatform) || !pathExists(targetPath)) {
    return;
  }

  const currentMode = fs.statSync(targetPath).mode;
  fs.chmodSync(targetPath, currentMode | 0o755);
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function downloadArchive(downloadUrl, destinationPath) {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Node archive (${response.status} ${response.statusText}): ${downloadUrl}`);
  }

  fs.writeFileSync(destinationPath, Buffer.from(await response.arrayBuffer()));
}

function extractArchive(archivePath, archiveType, destinationPath) {
  if (archiveType === 'zip') {
    const archive = new AdmZip(archivePath);
    archive.extractAllTo(destinationPath, true);
    return;
  }

  if (archiveType === 'tar.gz' || archiveType === 'tar.xz') {
    execFileSync('tar', ['-xf', archivePath, '-C', destinationPath], { stdio: 'inherit' });
    return;
  }

  throw new Error(`Unsupported embedded Node archive type: ${archiveType}`);
}

function validateArchiveChecksum(archivePath) {
  const actual = hashFile(archivePath);
  if (actual !== runtimeTarget.checksumSha256) {
    throw new Error(`Pinned Node archive checksum mismatch for ${archivePath}. Expected ${runtimeTarget.checksumSha256}, got ${actual}.`);
  }
}

function getNodeRelativePathCandidates(platform) {
  return [getNodeExecutableRelativePath(platform)];
}

function findFirstExistingCandidate(commandName, relativeCandidates) {
  for (const relativePath of relativeCandidates) {
    const exists = pathExists(toAbsoluteToolchainPath(relativePath));
    recordCandidate(commandName, relativePath, exists);
    if (exists) {
      return relativePath;
    }
  }

  return null;
}

function isJavaScriptNpmEntrypoint(relativePath) {
  return relativePath.endsWith('.js');
}

function resolveStableNpmEntrypoint(npmRelativePath) {
  if (isWindowsPlatform(runtimePlatform) || isJavaScriptNpmEntrypoint(npmRelativePath)) {
    return npmRelativePath;
  }

  const candidates = getNpmExecutableRelativePathCandidates(runtimePlatform)
    .filter((candidate) => candidate !== npmRelativePath && isJavaScriptNpmEntrypoint(candidate));
  const jsEntrypoint = candidates.find((candidate) => pathExists(toAbsoluteToolchainPath(candidate)));
  return jsEntrypoint || npmRelativePath;
}

function createPosixNpmCompatibilityShim(npmRelativePath, compatibilityRelativePath) {
  const shimPath = toAbsoluteToolchainPath(compatibilityRelativePath);
  fs.mkdirSync(path.dirname(shimPath), { recursive: true });
  if (pathExistsOrIsSymlink(shimPath)) {
    fs.rmSync(shimPath, { force: true });
  }
  fs.writeFileSync(shimPath, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'SCRIPT_DIR="$(CDPATH=\'\' cd -- "$(dirname -- "$0")" && pwd)"',
    'TOOLCHAIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"',
    `exec "$TOOLCHAIN_ROOT/${toPosixPath(getNodeExecutableRelativePath(runtimePlatform))}" "$TOOLCHAIN_ROOT/${toPosixPath(npmRelativePath)}" "$@"`,
  ].join('\n') + '\n', 'utf8');
  ensureExecutable(shimPath);
}

function materializeNpmCompatibilityPath(npmRelativePath) {
  const compatibilityRelativePath = getNpmExecutableRelativePath(runtimePlatform);
  const stableNpmRelativePath = resolveStableNpmEntrypoint(npmRelativePath);

  if (!isWindowsPlatform(runtimePlatform)) {
    createPosixNpmCompatibilityShim(stableNpmRelativePath, compatibilityRelativePath);
    return compatibilityRelativePath;
  }

  if (npmRelativePath === compatibilityRelativePath || pathExists(toAbsoluteToolchainPath(compatibilityRelativePath))) {
    ensureExecutable(toAbsoluteToolchainPath(compatibilityRelativePath));
    return compatibilityRelativePath;
  }

  throw new Error(`Bundled Node layout is incomplete. Missing compatibility npm command: ${compatibilityRelativePath}`);
}

function removeUnusedNodeBinEntrypoints() {
  if (isWindowsPlatform(runtimePlatform)) {
    const candidates = [path.join(nodeRoot, 'corepack'), path.join(nodeRoot, 'corepack.cmd'), path.join(nodeRoot, 'npx'), path.join(nodeRoot, 'npx.cmd')];
    for (const candidate of candidates) {
      if (pathExistsOrIsSymlink(candidate)) {
        fs.rmSync(candidate, { force: true });
      }
    }
    return;
  }

  const binDirectory = path.join(nodeRoot, 'bin');
  if (!pathExists(binDirectory)) {
    return;
  }

  for (const entry of fs.readdirSync(binDirectory)) {
    if (entry !== 'node') {
      fs.rmSync(path.join(binDirectory, entry), { recursive: true, force: true });
    }
  }
}

function snapshotDirectory(rootPath, maxDepth = 2, maxEntries = 80) {
  if (!pathExists(rootPath)) {
    return [`${rootPath} (missing)`];
  }

  const snapshot = [];
  const visit = (currentPath, depth) => {
    if (snapshot.length >= maxEntries || depth > maxDepth) {
      return;
    }

    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (snapshot.length >= maxEntries) {
        snapshot.push('... truncated ...');
        return;
      }

      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = toRelativeToolchainPath(absolutePath) || '.';
      const suffix = entry.isDirectory() ? '/' : entry.isSymbolicLink() ? ' -> symlink' : '';
      snapshot.push(`${relativePath}${suffix}`);
      if (entry.isDirectory()) {
        visit(absolutePath, depth + 1);
      }
    }
  };

  visit(rootPath, 0);
  return snapshot;
}

function printStagingDiagnostics(error) {
  console.error('[bundled-toolchain] Staging diagnostics:');
  console.error(`[bundled-toolchain]   platform: ${stagingDiagnostics.platform}`);
  console.error(`[bundled-toolchain]   archive: ${stagingDiagnostics.archiveName} (${stagingDiagnostics.archiveType})`);
  console.error(`[bundled-toolchain]   downloadUrl: ${stagingDiagnostics.downloadUrl}`);
  console.error(`[bundled-toolchain]   extractRoot: ${stagingDiagnostics.extractRoot}`);
  if (stagingDiagnostics.attemptedCandidates.length > 0) {
    console.error('[bundled-toolchain]   attempted command candidates:');
    for (const candidate of stagingDiagnostics.attemptedCandidates) {
      console.error(`[bundled-toolchain]     ${candidate.commandName}: ${candidate.relativePath} (${candidate.exists ? 'found' : 'missing'})`);
    }
  }
  console.error(`[bundled-toolchain]   shallow snapshot: ${nodeRoot}`);
  for (const entry of snapshotDirectory(nodeRoot)) {
    console.error(`[bundled-toolchain]     ${entry}`);
  }
  if (error?.stack) {
    console.error(`[bundled-toolchain]   error: ${error.stack}`);
  }
}

function resolveExtractedNodeRoot(extractRoot) {
  const configuredRoot = path.join(extractRoot, runtimeTarget.extractRoot);
  if (pathExists(path.join(configuredRoot, getNodeExecutableRelativePath(runtimePlatform).replace(/^node[\\/]/, '')))) {
    return configuredRoot;
  }

  const directNodePath = path.join(extractRoot, getNodeExecutableRelativePath(runtimePlatform).replace(/^node[\\/]/, ''));
  if (pathExists(directNodePath)) {
    return extractRoot;
  }

  throw new Error(`Extracted Node archive did not produce ${runtimeTarget.extractRoot} under ${extractRoot}.`);
}

function prunePath(targetPath) {
  if (!pathExistsOrIsSymlink(targetPath)) {
    return;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
  prunedToolchainEntries += 1;
}

function writeActivationArtifacts() {
  fs.mkdirSync(envRoot, { recursive: true });
  if (!isWindowsPlatform(runtimePlatform)) {
    const activationPath = path.join(envRoot, 'activate.sh');
    const pathEntries = [
      'bin',
      path.dirname(getNodeExecutableRelativePath(runtimePlatform)),
      getNpmGlobalBinRelativePath(runtimePlatform),
    ].map((entry) => `$TOOLCHAIN_ROOT/${toPosixPath(entry)}`).join(':');
    fs.writeFileSync(activationPath, [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'SCRIPT_DIR="$(CDPATH=\'\' cd -- "$(dirname -- "$0")" && pwd)"',
      'TOOLCHAIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"',
      'export HAGICODE_PORTABLE_TOOLCHAIN_ROOT="$TOOLCHAIN_ROOT"',
      `export PATH="${pathEntries}:$PATH"`,
      'echo "HagiCode bundled toolchain activated: $TOOLCHAIN_ROOT"',
    ].join('\n') + '\n', 'utf8');
    ensureExecutable(activationPath);
    return [path.join('env', 'activate.sh')];
  }

  const cmdPath = path.join(envRoot, 'activate.cmd');
  const ps1Path = path.join(envRoot, 'activate.ps1');
  fs.writeFileSync(cmdPath, [
    '@echo off',
    'setlocal',
    'set "SCRIPT_DIR=%~dp0"',
    'for %%I in ("%SCRIPT_DIR%..") do set "TOOLCHAIN_ROOT=%%~fI"',
    'set "HAGICODE_PORTABLE_TOOLCHAIN_ROOT=%TOOLCHAIN_ROOT%"',
    'set "PATH=%TOOLCHAIN_ROOT%\\bin;%TOOLCHAIN_ROOT%\\node;%TOOLCHAIN_ROOT%\\npm-global;%PATH%"',
    'echo HagiCode bundled toolchain activated: %TOOLCHAIN_ROOT%',
  ].join('\r\n') + '\r\n', 'utf8');
  fs.writeFileSync(ps1Path, [
    '$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path',
    '$toolchainRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path',
    '$env:HAGICODE_PORTABLE_TOOLCHAIN_ROOT = $toolchainRoot',
    '$env:PATH = "$toolchainRoot\\bin;$toolchainRoot\\node;$toolchainRoot\\npm-global;" + $env:PATH',
    'Write-Output "HagiCode bundled toolchain activated: $toolchainRoot"',
  ].join('\r\n') + '\r\n', 'utf8');
  return [path.join('env', 'activate.cmd'), path.join('env', 'activate.ps1')];
}

function cleanDeferredPackageRoots() {
  prunePath(binRoot);
  prunePath(npmGlobalRoot);
}

function buildRuntimeCommands(nodeLayout) {
  return {
    node: nodeLayout?.node || getNodeExecutableRelativePath(runtimePlatform),
    npm: nodeLayout?.npm || getNpmExecutableRelativePath(runtimePlatform),
  };
}

function buildDeferredPackageMetadata() {
  return Object.fromEntries(packageEntries.map(([logicalName, packageConfig]) => {
    const installMode = packageConfig.installMode || 'manual';
    const installState = packageConfig.installState || 'pending';
    const installSpec = packageConfig.installSpec || `${packageConfig.packageName}@${packageConfig.version}`;
    const manualActionId = packageConfig.manualActionId || 'install-bundled-node-cli';

    return [logicalName, {
      packageName: packageConfig.packageName,
      version: packageConfig.version,
      integrity: packageConfig.integrity,
      binName: packageConfig.binName,
      aliases: packageConfig.aliases || [],
      installMode,
      installState,
      installSpec,
      manualActionId,
    }];
  }));
}

function validateNodeLayout() {
  const nodeRelativePath = findFirstExistingCandidate('node', getNodeRelativePathCandidates(runtimePlatform));
  const npmRelativePath = findFirstExistingCandidate('npm', getNpmExecutableRelativePathCandidates(runtimePlatform));
  const missing = [];
  if (!nodeRelativePath) {
    missing.push('node');
  }
  if (!npmRelativePath) {
    missing.push('npm');
  }
  if (missing.length > 0) {
    throw new Error(`Bundled Node layout is incomplete. Missing commands: ${missing.join(', ')}`);
  }

  ensureExecutable(toAbsoluteToolchainPath(nodeRelativePath));
  if (!isWindowsPlatform(runtimePlatform) && !isJavaScriptNpmEntrypoint(npmRelativePath)) {
    ensureExecutable(toAbsoluteToolchainPath(npmRelativePath));
  }

  resolvedNodeCommand = nodeRelativePath;
  resolvedNpmCommand = materializeNpmCompatibilityPath(npmRelativePath);
  recordCandidate('npm-compat', resolvedNpmCommand, pathExists(toAbsoluteToolchainPath(resolvedNpmCommand)));
  return { node: resolvedNodeCommand, npm: resolvedNpmCommand, archiveNpm: npmRelativePath };
}

function writeToolchainManifest({ archivePath, sourceHost, packages, commands, activation, nodeLayout }) {
  const manifest = {
    schemaVersion: runtimeConfig.schemaVersion || 2,
    layoutVersion: runtimeConfig.layoutVersion || 2,
    owner: 'hagicode-desktop',
    source: 'bundled-desktop',
    platform: runtimePlatform,
    defaultEnabledByConsumer: { ...(runtimeConfig.defaultEnabledByConsumer || {}) },
    stagedAt: new Date().toISOString(),
    portableFixedRoot: resourcesRoot,
    toolchainRoot,
    node: {
      version: runtimeConfig.releaseVersion,
      channelVersion: runtimeConfig.channelVersion,
      releaseDate: runtimeConfig.releaseDate,
      provider: runtimeConfig.source.provider,
      releaseMetadataUrl: runtimeConfig.source.releaseMetadataUrl,
      allowedDownloadHosts: runtimeConfig.source.allowedDownloadHosts,
      downloadUrl: runtimeTarget.downloadUrl,
      sourceHost,
      archiveName: runtimeTarget.archiveName,
      archiveType: runtimeTarget.archiveType,
      archivePath,
      checksumSha256: runtimeTarget.checksumSha256,
      extractRoot: runtimeTarget.extractRoot,
      executableRelativePath: nodeLayout?.node || getNodeExecutableRelativePath(runtimePlatform),
      npmExecutableRelativePath: nodeLayout?.npm || getNpmExecutableRelativePath(runtimePlatform),
      archiveNpmExecutableRelativePath: nodeLayout?.archiveNpm || nodeLayout?.npm || getNpmExecutableRelativePath(runtimePlatform),
    },
    packages,
    commands,
    activation,
  };

  fs.writeFileSync(path.join(toolchainRoot, TOOLCHAIN_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function validateToolchainManifest(manifest) {
  const errors = [];
  if (manifest.owner !== 'hagicode-desktop') {
    errors.push('owner must be hagicode-desktop');
  }
  if (manifest.platform !== runtimePlatform) {
    errors.push(`platform expected ${runtimePlatform} but found ${manifest.platform || 'missing'}`);
  }
  if (manifest.node?.version !== runtimeConfig.releaseVersion) {
    errors.push(`Node version expected ${runtimeConfig.releaseVersion} but found ${manifest.node?.version || 'missing'}`);
  }

  for (const commandName of ['node', 'npm']) {
    const relativePath = manifest.commands?.[commandName];
    if (!relativePath || !pathExists(path.join(toolchainRoot, relativePath))) {
      errors.push(`command ${commandName} is missing or points to a missing entry`);
    }
  }

  for (const managedCommandName of ['openspec', 'skills', 'omniroute']) {
    if (manifest.commands?.[managedCommandName]) {
      errors.push(`managed command ${managedCommandName} must not be declared before manual installation`);
    }
  }

  for (const [logicalName, packageConfig] of packageEntries) {
    const packageRecord = manifest.packages?.[logicalName];
    if (packageRecord?.version !== packageConfig.version) {
      errors.push(`${logicalName} package version expected ${packageConfig.version}`);
    }
    if (packageRecord?.installMode !== (packageConfig.installMode || 'manual')) {
      errors.push(`${logicalName} installMode expected ${packageConfig.installMode || 'manual'}`);
    }
    if (packageRecord?.installState !== (packageConfig.installState || 'pending')) {
      errors.push(`${logicalName} installState expected ${packageConfig.installState || 'pending'}`);
    }
    if (packageRecord?.installSpec !== (packageConfig.installSpec || `${packageConfig.packageName}@${packageConfig.version}`)) {
      errors.push(`${logicalName} installSpec expected ${packageConfig.installSpec || `${packageConfig.packageName}@${packageConfig.version}`}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Bundled toolchain manifest validation failed: ${errors.join('; ')}`);
  }
}

async function stageNodeRuntime() {
  fs.mkdirSync(downloadsRoot, { recursive: true });
  fs.mkdirSync(toolchainRoot, { recursive: true });
  const sourceUrl = ensureOfficialNodeDownloadUrl(runtimeTarget.downloadUrl, runtimeConfig.source?.allowedDownloadHosts || []);
  const archivePath = path.join(downloadsRoot, runtimeTarget.archiveName);

  if (!pathExists(archivePath)) {
    console.log(`[bundled-toolchain] Downloading ${runtimePlatform} Node runtime from ${runtimeTarget.downloadUrl}`);
    await downloadArchive(runtimeTarget.downloadUrl, archivePath);
  } else {
    console.log(`[bundled-toolchain] Reusing cached Node archive ${archivePath}`);
  }

  validateArchiveChecksum(archivePath);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `hagicode-node-${runtimePlatform}-`));

  try {
    extractArchive(archivePath, runtimeTarget.archiveType, tempRoot);
    const extractedNodeRoot = resolveExtractedNodeRoot(tempRoot);
    fs.rmSync(nodeRoot, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(nodeRoot), { recursive: true });
    fs.cpSync(extractedNodeRoot, nodeRoot, { recursive: true, force: true });
    removeUnusedNodeBinEntrypoints();
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const nodeLayout = validateNodeLayout();
  return { archivePath, sourceHost: sourceUrl.hostname, nodeLayout };
}

async function main() {
  console.log(`[bundled-toolchain] Preparing Desktop-owned Node toolchain for ${runtimePlatform}`);
  const stageResult = await stageNodeRuntime();
  cleanDeferredPackageRoots();
  const commandResult = {
    commands: buildRuntimeCommands(stageResult.nodeLayout),
    packages: buildDeferredPackageMetadata(),
  };
  const activation = writeActivationArtifacts();
  const manifest = writeToolchainManifest({
    ...stageResult,
    ...commandResult,
    activation,
  });
  validateToolchainManifest(manifest);

  console.log(`[bundled-toolchain] Staged Node ${runtimeConfig.releaseVersion} at ${nodeRoot}`);
  console.log(`[bundled-toolchain] Removed ${prunedToolchainEntries} stale managed-package entries`);
  console.log(`[bundled-toolchain] Wrote ${path.join(toolchainRoot, TOOLCHAIN_MANIFEST_FILE)}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[bundled-toolchain] ${message}`);
  printStagingDiagnostics(error);
  process.exit(1);
});
