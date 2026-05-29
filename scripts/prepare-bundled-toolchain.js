#!/usr/bin/env node

import fs from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  TOOLCHAIN_MANIFEST_FILE,
  detectNodeRuntimePlatform,
  ensureOfficialNodeDownloadUrl,
  getNodeExecutableRelativePath,
  getNpmExecutableRelativePath,
  getNpmExecutableRelativePathCandidates,
  readPinnedNodeRuntimeConfig,
  resolvePinnedNodeRuntimeTarget,
} from './embedded-node-runtime-config.js';
import {
  readToolchainManifest,
  validateToolchainManifest,
  validateToolchainPayload,
} from './bundled-toolchain-contract.js';
import { resolveStagedDesktopRuntimeComponentRoot, resolveStagedDesktopRuntimeProgramHome } from './desktop-runtime-layout.js';
import {
  updateDesktopRuntimeComponents,
  isManagedDesktopRuntimeComponentExecution,
  resolveManagedDesktopRuntimeComponentRoot,
} from './desktop-runtime-hagiscript.js';
import {
  assertGlobalHagiscriptAvailable,
  resolveGlobalHagiscriptPackageRoot,
} from './global-hagiscript.js';

const MINIMUM_HAGISCRIPT_VERSION = '0.2.9';
const managedExecution = isManagedDesktopRuntimeComponentExecution();

if (!managedExecution) {
  await updateDesktopRuntimeComponents(['node'], {
    force: process.env.HAGICODE_FORCE_BUNDLED_TOOLCHAIN_RESTAGE === '1',
  });
  process.exit(0);
}

const runtimePlatform = process.env.HAGICODE_EMBEDDED_NODE_PLATFORM || detectNodeRuntimePlatform();
const runtimeConfig = readPinnedNodeRuntimeConfig();
const runtimeTarget = resolvePinnedNodeRuntimeTarget(runtimePlatform, runtimeConfig);
const toolchainRoot = resolveManagedDesktopRuntimeComponentRoot()
  || resolveStagedDesktopRuntimeComponentRoot('node', { cwd: process.cwd() });
const portableFixedRoot = managedExecution
  ? path.resolve(toolchainRoot, '..', '..', '..')
  : resolveStagedDesktopRuntimeProgramHome(process.cwd());
const envRoot = path.join(toolchainRoot, 'env');
const legacyNodeRoot = path.join(toolchainRoot, 'node');
const legacyNpmGlobalRoot = path.join(toolchainRoot, 'npm-global');
const hagiscriptPackageRoot = resolveGlobalHagiscriptPackageRoot(MINIMUM_HAGISCRIPT_VERSION);
const { installNodeRuntime } = await import(pathToFileURL(path.join(hagiscriptPackageRoot, 'dist', 'runtime', 'node-installer.js')).href);
const { verifyNodeRuntime } = await import(pathToFileURL(path.join(hagiscriptPackageRoot, 'dist', 'runtime', 'node-verify.js')).href);

main().catch((error) => {
  console.error('[bundled-toolchain] Failed to install bundled toolchain through hagiscript:', error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

async function main() {
  const hagiscriptVersion = assertGlobalHagiscriptAvailable(MINIMUM_HAGISCRIPT_VERSION);
  const sourceUrl = ensureOfficialNodeDownloadUrl(runtimeTarget.downloadUrl, runtimeConfig.source?.allowedDownloadHosts || []);

  await rm(toolchainRoot, { recursive: true, force: true });
  await mkdir(toolchainRoot, { recursive: true });
  await installNodeRuntime({
    targetDirectory: toolchainRoot,
    versionSelector: runtimeConfig.releaseVersion,
  });

  const verification = await verifyNodeRuntime(toolchainRoot);
  if (!verification.valid) {
    throw new Error(verification.failureReason || 'Installed Node runtime failed verification.');
  }

  removeUnusedNodeBinEntrypoints();
  cleanDeferredPackageRoots();
  const npmRelativePath = materializeNpmCompatibilityPath(resolveNpmEntrypoint());
  const activation = await writeActivationArtifacts();
  await writeToolchainManifest({
    sourceHost: sourceUrl.hostname,
    commands: {
      node: getNodeExecutableRelativePath(runtimePlatform),
      npm: npmRelativePath,
    },
    packages: buildDeferredPackageMetadata(),
    activation,
  });

  const payloadErrors = validateToolchainPayload(toolchainRoot, { platform: runtimePlatform });
  if (payloadErrors.length > 0) {
    throw new Error(`Bundled toolchain payload validation failed: ${payloadErrors.join('; ')}`);
  }

  const manifestErrors = validateToolchainManifest(toolchainRoot, { platform: runtimePlatform });
  if (manifestErrors.length > 0) {
    throw new Error(`Bundled toolchain manifest validation failed: ${manifestErrors.join('; ')}`);
  }

  console.log(`[bundled-toolchain] Installed Node ${runtimeConfig.releaseVersion} for ${runtimePlatform} via hagiscript ${hagiscriptVersion}`);
  console.log(`[bundled-toolchain] Staged toolchain root: ${toolchainRoot}`);
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

function isWindowsPlatform(platform) {
  return platform.startsWith('win-');
}

function toPosixPath(relativePath) {
  return String(relativePath).split(path.sep).join('/');
}

function ensureExecutable(targetPath) {
  if (isWindowsPlatform(runtimePlatform) || !pathExists(targetPath)) {
    return;
  }
  const currentMode = fs.statSync(targetPath).mode;
  fs.chmodSync(targetPath, currentMode | 0o755);
}

function removeUnusedNodeBinEntrypoints() {
  if (isWindowsPlatform(runtimePlatform)) {
    for (const candidate of ['corepack', 'corepack.cmd', 'npx', 'npx.cmd'].map((entry) => path.join(toolchainRoot, entry))) {
      if (pathExistsOrIsSymlink(candidate)) {
        fs.rmSync(candidate, { force: true });
      }
    }
    return;
  }

  const binDirectory = path.join(toolchainRoot, 'bin');
  if (!pathExists(binDirectory)) {
    return;
  }

  for (const entry of fs.readdirSync(binDirectory)) {
    if (entry !== 'node') {
      fs.rmSync(path.join(binDirectory, entry), { recursive: true, force: true });
    }
  }
}

function cleanDeferredPackageRoots() {
  for (const targetPath of [legacyNodeRoot, legacyNpmGlobalRoot]) {
    if (pathExistsOrIsSymlink(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  }
}

function resolveNpmEntrypoint() {
  const candidates = getNpmExecutableRelativePathCandidates(runtimePlatform);
  const matched = candidates.find((relativePath) => pathExists(path.join(toolchainRoot, relativePath)));
  if (!matched) {
    throw new Error(`Bundled Node layout is incomplete. Missing npm entrypoint for ${runtimePlatform}.`);
  }
  return matched;
}

function isJavaScriptNpmEntrypoint(relativePath) {
  return relativePath.endsWith('.js');
}

function resolveStableNpmEntrypoint(npmRelativePath) {
  if (isWindowsPlatform(runtimePlatform) || isJavaScriptNpmEntrypoint(npmRelativePath)) {
    return npmRelativePath;
  }

  const jsEntrypoint = getNpmExecutableRelativePathCandidates(runtimePlatform)
    .filter((candidate) => candidate !== npmRelativePath && isJavaScriptNpmEntrypoint(candidate))
    .find((candidate) => pathExists(path.join(toolchainRoot, candidate)));
  return jsEntrypoint || npmRelativePath;
}

function materializeNpmCompatibilityPath(npmRelativePath) {
  const compatibilityRelativePath = getNpmExecutableRelativePath(runtimePlatform);
  const stableNpmRelativePath = resolveStableNpmEntrypoint(npmRelativePath);

  if (!isWindowsPlatform(runtimePlatform)) {
    const shimPath = path.join(toolchainRoot, compatibilityRelativePath);
    fs.mkdirSync(path.dirname(shimPath), { recursive: true });
    if (pathExistsOrIsSymlink(shimPath)) {
      fs.rmSync(shimPath, { force: true });
    }
    fs.writeFileSync(shimPath, [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'SCRIPT_DIR="$(CDPATH=\'\' cd -- "$(dirname -- "$0")" && pwd)"',
      'TOOLCHAIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"',
      `exec "$TOOLCHAIN_ROOT/${toPosixPath(getNodeExecutableRelativePath(runtimePlatform))}" "$TOOLCHAIN_ROOT/${toPosixPath(stableNpmRelativePath)}" "$@"`,
    ].join('\n') + '\n', 'utf8');
    ensureExecutable(shimPath);
    return compatibilityRelativePath;
  }

  const compatibilityPath = path.join(toolchainRoot, compatibilityRelativePath);
  if (!pathExists(compatibilityPath)) {
    throw new Error(`Bundled Node layout is incomplete. Missing npm compatibility command: ${compatibilityRelativePath}`);
  }
  ensureExecutable(compatibilityPath);
  return compatibilityRelativePath;
}

function buildDeferredPackageMetadata() {
  return Object.fromEntries(Object.entries(runtimeConfig.corePackages || {}).map(([logicalName, packageConfig]) => {
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

async function writeActivationArtifacts() {
  await mkdir(envRoot, { recursive: true });

  if (!isWindowsPlatform(runtimePlatform)) {
    const activationPath = path.join(envRoot, 'activate.sh');
    const pathEntries = [...new Set(['bin', path.dirname(getNodeExecutableRelativePath(runtimePlatform))])]
      .filter((entry) => entry.length > 0 && entry !== '.')
      .map((entry) => `$TOOLCHAIN_ROOT/${toPosixPath(entry)}`)
      .join(':');
    await writeFile(activationPath, [
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
  await writeFile(cmdPath, [
    '@echo off',
    'setlocal',
    'set "SCRIPT_DIR=%~dp0"',
    'for %%I in ("%SCRIPT_DIR%..") do set "TOOLCHAIN_ROOT=%%~fI"',
    'set "HAGICODE_PORTABLE_TOOLCHAIN_ROOT=%TOOLCHAIN_ROOT%"',
    'set "PATH=%TOOLCHAIN_ROOT%;%PATH%"',
    'echo HagiCode bundled toolchain activated: %TOOLCHAIN_ROOT%',
  ].join('\r\n') + '\r\n', 'utf8');
  await writeFile(ps1Path, [
    '$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path',
    '$toolchainRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path',
    '$env:HAGICODE_PORTABLE_TOOLCHAIN_ROOT = $toolchainRoot',
    '$env:PATH = "$toolchainRoot;" + $env:PATH',
    'Write-Output "HagiCode bundled toolchain activated: $toolchainRoot"',
  ].join('\r\n') + '\r\n', 'utf8');
  return [path.join('env', 'activate.cmd'), path.join('env', 'activate.ps1')];
}

async function writeToolchainManifest({ sourceHost, commands, packages, activation }) {
  const manifest = {
    schemaVersion: runtimeConfig.schemaVersion || 2,
    layoutVersion: runtimeConfig.layoutVersion || 2,
    owner: 'hagicode-desktop',
    source: 'bundled-desktop',
    platform: runtimePlatform,
    defaultEnabledByConsumer: { ...(runtimeConfig.defaultEnabledByConsumer || {}) },
    stagedAt: new Date().toISOString(),
    portableFixedRoot,
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
      archivePath: path.join(process.cwd(), 'build', 'embedded-node-runtime', 'downloads', runtimeTarget.archiveName),
      checksumSha256: runtimeTarget.checksumSha256,
      extractRoot: runtimeTarget.extractRoot,
      executableRelativePath: commands.node,
      npmExecutableRelativePath: commands.npm,
      archiveNpmExecutableRelativePath: resolveNpmEntrypoint(),
    },
    packages,
    commands,
    activation,
    ownership: 'hagiscript-managed',
  };

  await writeFile(path.join(toolchainRoot, TOOLCHAIN_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const persistedManifest = readToolchainManifest(toolchainRoot);
  if (!persistedManifest) {
    throw new Error(`${TOOLCHAIN_MANIFEST_FILE} was not written.`);
  }
}
