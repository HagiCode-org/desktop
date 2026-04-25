#!/usr/bin/env node

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import AdmZip from 'adm-zip';
import {
  detectNodeRuntimePlatform,
  ensureOfficialNodeDownloadUrl,
  getCommandExecutableName,
  getGovernedNodeRuntimeMajor,
  getNodeExecutableRelativePath,
  getNpmExecutableRelativePath,
  getNpmExecutableRelativePathCandidates,
  nodeVersionMatchesGovernedMajor,
  readPinnedNodeRuntimeConfig,
  resolvePinnedNodeRuntimeTarget,
} from './embedded-node-runtime-config.js';
import {
  buildDevNodeRuntimeMetadata,
  getDevNodeRuntimeCacheRoot,
  getDevNodeRuntimeInstallRoot,
  getDevNodeRuntimeMetadataPath,
  getDevNodeRuntimeRoot,
} from './dev-node-runtime-config.js';

const projectRoot = process.cwd();
const runtimePlatform = process.env.HAGICODE_EMBEDDED_NODE_PLATFORM || detectNodeRuntimePlatform();
const runtimeConfig = readPinnedNodeRuntimeConfig();
const governedNodeMajor = getGovernedNodeRuntimeMajor(runtimeConfig);
const runtimeTarget = resolvePinnedNodeRuntimeTarget(runtimePlatform, runtimeConfig);
const runtimeRoot = getDevNodeRuntimeRoot(projectRoot);
const cacheRoot = getDevNodeRuntimeCacheRoot(projectRoot);
const installRoot = getDevNodeRuntimeInstallRoot(runtimePlatform, runtimeConfig.releaseVersion, projectRoot);
const metadataPath = getDevNodeRuntimeMetadataPath(projectRoot);
const nodeExecutablePath = path.join(installRoot, getNodeExecutableRelativePath(runtimePlatform));
const npmExecutablePath = path.join(installRoot, getNpmExecutableRelativePath(runtimePlatform));
const corepackExecutablePath = path.join(installRoot, getNodeBinRelativePath(runtimePlatform), getCommandExecutableName(runtimePlatform, 'corepack'));

function getNodeBinRelativePath(platform) {
  return platform.startsWith('win-') ? 'node' : path.join('node', 'bin');
}

function isWindowsPlatform(platform) {
  return platform.startsWith('win-');
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

function validateArchiveChecksum(archivePath) {
  const actual = hashFile(archivePath);
  if (actual !== runtimeTarget.checksumSha256) {
    throw new Error(`Cached Node archive checksum mismatch for ${archivePath}. Expected ${runtimeTarget.checksumSha256}, got ${actual}. Delete the file and rerun install:dev-node-runtime.`);
  }
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

function resolveExtractedNodeRoot(extractRoot) {
  const configuredRoot = path.join(extractRoot, runtimeTarget.extractRoot);
  const configuredNode = path.join(configuredRoot, getNodeExecutableRelativePath(runtimePlatform).replace(/^node[\\/]/, ''));
  if (pathExists(configuredNode)) {
    return configuredRoot;
  }

  const directNode = path.join(extractRoot, getNodeExecutableRelativePath(runtimePlatform).replace(/^node[\\/]/, ''));
  if (pathExists(directNode)) {
    return extractRoot;
  }

  throw new Error(`Extracted Node archive did not produce ${runtimeTarget.extractRoot} under ${extractRoot}.`);
}

function readMetadata() {
  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch {
    return null;
  }
}

function runVersionProbe(executablePath, args) {
  return execFileSync(executablePath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function probeTool(name, executablePath, args = ['--version'], required = true) {
  if (!pathExists(executablePath)) {
    if (required) {
      throw new Error(`${name} executable is missing at ${executablePath}`);
    }
    return { available: false, executablePath, version: null, message: 'not bundled with this Node distribution' };
  }

  ensureExecutable(executablePath);
  if (!isWindowsPlatform(runtimePlatform) && !isExecutable(executablePath)) {
    throw new Error(`${name} executable is not executable at ${executablePath}`);
  }

  try {
    return { available: true, executablePath, version: runVersionProbe(executablePath, args), message: 'ok' };
  } catch (error) {
    if (required) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${name} probe failed for ${executablePath}: ${message}`);
    }
    return { available: false, executablePath, version: null, message: 'probe failed' };
  }
}

function findExistingNpmExecutable() {
  const candidates = getNpmExecutableRelativePathCandidates(runtimePlatform).map((relativePath) => path.join(installRoot, relativePath));
  return candidates.find((candidate) => pathExists(candidate)) || npmExecutablePath;
}

function createPosixNpmShim(targetNpmPath) {
  if (isWindowsPlatform(runtimePlatform) || targetNpmPath === npmExecutablePath) {
    return;
  }

  fs.rmSync(npmExecutablePath, { force: true });
  fs.mkdirSync(path.dirname(npmExecutablePath), { recursive: true });
  const relativeNode = path.relative(path.dirname(npmExecutablePath), nodeExecutablePath).split(path.sep).join('/');
  const relativeNpm = path.relative(path.dirname(npmExecutablePath), targetNpmPath).split(path.sep).join('/');
  fs.writeFileSync(npmExecutablePath, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'SCRIPT_DIR="$(CDPATH=\'\' cd -- "$(dirname -- "$0")" && pwd)"',
    `exec "$SCRIPT_DIR/${relativeNode}" "$SCRIPT_DIR/${relativeNpm}" "$@"`,
  ].join('\n') + '\n', 'utf8');
  ensureExecutable(npmExecutablePath);
}

function createPosixToolShim(commandName, targetScriptPath) {
  if (isWindowsPlatform(runtimePlatform)) {
    return;
  }

  const shimPath = path.join(installRoot, getNodeBinRelativePath(runtimePlatform), commandName);
  fs.rmSync(shimPath, { force: true });
  fs.mkdirSync(path.dirname(shimPath), { recursive: true });
  const relativeNode = path.relative(path.dirname(shimPath), nodeExecutablePath).split(path.sep).join('/');
  const relativeScript = path.relative(path.dirname(shimPath), targetScriptPath).split(path.sep).join('/');
  fs.writeFileSync(shimPath, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'SCRIPT_DIR="$(CDPATH=\'\' cd -- "$(dirname -- "$0")" && pwd)"',
    `exec "$SCRIPT_DIR/${relativeNode}" "$SCRIPT_DIR/${relativeScript}" "$@"`,
  ].join('\n') + '\n', 'utf8');
  ensureExecutable(shimPath);
}

function repairPosixPackageManagerShims() {
  if (isWindowsPlatform(runtimePlatform)) {
    return;
  }

  const npmCliPath = path.join(installRoot, 'node', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const npxCliPath = path.join(installRoot, 'node', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js');
  const corepackCliPath = path.join(installRoot, 'node', 'lib', 'node_modules', 'corepack', 'dist', 'corepack.js');

  createPosixToolShim('npm', npmCliPath);
  createPosixToolShim('npx', npxCliPath);
  if (pathExists(corepackCliPath)) {
    createPosixToolShim('corepack', corepackCliPath);
  }
}

function validateInstalledRuntime() {
  const node = probeTool('node', nodeExecutablePath, ['--version'], true);
  const reportedNodeVersion = node.version?.replace(/^v/, '');
  if (!nodeVersionMatchesGovernedMajor(reportedNodeVersion, runtimeConfig)) {
    throw new Error(`Node major version expected ${governedNodeMajor} but found ${reportedNodeVersion || 'missing'} at ${nodeExecutablePath}`);
  }

  const npmCandidate = findExistingNpmExecutable();
  createPosixNpmShim(npmCandidate);
  const npm = probeTool('npm', npmExecutablePath, ['--version'], true);
  const corepack = probeTool('corepack', corepackExecutablePath, ['--version'], false);

  return { node, npm, corepack, valid: node.available && npm.available };
}

function existingRuntimeIsValid() {
  const metadata = readMetadata();
  if (!metadata) {
    return false;
  }
  if (metadata.owner !== 'hagicode-desktop' || metadata.source !== 'bundled-dev') {
    return false;
  }
  if (!nodeVersionMatchesGovernedMajor(metadata.nodeVersion, runtimeConfig) || metadata.platform !== runtimePlatform) {
    return false;
  }
  if (metadata.nodeExecutablePath !== nodeExecutablePath || metadata.installRoot !== installRoot) {
    return false;
  }

  try {
    validateInstalledRuntime();
    return true;
  } catch {
    return false;
  }
}

async function ensureArchive() {
  fs.mkdirSync(cacheRoot, { recursive: true });
  const sourceUrl = ensureOfficialNodeDownloadUrl(runtimeTarget.downloadUrl, runtimeConfig.source?.allowedDownloadHosts || []);
  const archivePath = path.join(cacheRoot, runtimeTarget.archiveName);

  if (!pathExists(archivePath)) {
    console.log(`[dev-node-runtime] Downloading ${runtimePlatform} Node runtime from ${runtimeTarget.downloadUrl}`);
    try {
      await downloadArchive(runtimeTarget.downloadUrl, archivePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}. Check network access or pre-populate ${archivePath} with the pinned archive.`);
    }
  } else {
    console.log(`[dev-node-runtime] Reusing cached Node archive ${archivePath}`);
  }

  validateArchiveChecksum(archivePath);
  return { archivePath, sourceHost: sourceUrl.hostname };
}

function extractRuntime(archivePath) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `hagicode-dev-node-${runtimePlatform}-`));
  try {
    extractArchive(archivePath, runtimeTarget.archiveType, tempRoot);
    const extractedNodeRoot = resolveExtractedNodeRoot(tempRoot);
    fs.rmSync(installRoot, { recursive: true, force: true });
    fs.mkdirSync(path.join(installRoot, 'node'), { recursive: true });
    fs.cpSync(extractedNodeRoot, path.join(installRoot, 'node'), { recursive: true, force: true });
    repairPosixPackageManagerShims();
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function writeMetadata(archivePath, toolchain) {
  const metadata = buildDevNodeRuntimeMetadata({
    runtimeConfig,
    runtimeTarget,
    platform: runtimePlatform,
    installRoot,
    nodeExecutablePath,
    npmExecutablePath,
    corepackExecutablePath,
    archivePath,
    toolchain,
  });
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return metadata;
}

async function main() {
  console.log(`[dev-node-runtime] Preparing development Node runtime for ${runtimePlatform}`);
  console.log(`[dev-node-runtime] Runtime root: ${runtimeRoot}`);

  if (existingRuntimeIsValid()) {
    console.log(`[dev-node-runtime] Existing Node ${runtimeConfig.releaseVersion} runtime is valid at ${nodeExecutablePath}`);
    return;
  }

  const { archivePath } = await ensureArchive();
  extractRuntime(archivePath);
  const toolchain = validateInstalledRuntime();
  writeMetadata(archivePath, toolchain);

  console.log(`[dev-node-runtime] Installed Node ${runtimeConfig.releaseVersion} at ${nodeExecutablePath}`);
  console.log(`[dev-node-runtime] npm: ${toolchain.npm.version} at ${npmExecutablePath}`);
  console.log(`[dev-node-runtime] corepack: ${toolchain.corepack.available ? toolchain.corepack.version : 'not available'}`);
  console.log(`[dev-node-runtime] Wrote ${metadataPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[dev-node-runtime] ${message}`);
  process.exit(1);
});
