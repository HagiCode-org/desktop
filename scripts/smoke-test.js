#!/usr/bin/env node

/**
 * Smoke Test Suite
 *
 * Basic verification tests to ensure the built application functions correctly.
 * This script validates build outputs, staged runtime inputs, and packaged
 * runtime resources when they are available.
 */

import fs from 'fs';
import path from 'path';
import {
  EMBEDDED_RUNTIME_METADATA_FILE,
  detectRuntimePlatform,
  ensureOfficialMicrosoftDownloadUrl,
  getDotnetExecutableName,
  readPinnedRuntimeConfig,
  resolvePinnedRuntimeTarget,
} from './embedded-runtime-config.js';
import {
  detectNodeRuntimePlatform,
} from './embedded-node-runtime-config.js';
import {
  validateToolchainManifest,
  validateToolchainPayload,
} from './bundled-toolchain-contract.js';
import {
  detectCodeServerRuntimePlatform,
  readCodeServerRuntimeConfig,
  validateCodeServerRuntimePayload,
} from './code-server-runtime-contract.js';
import {
  detectOmniRouteRuntimePlatform,
  readOmniRouteRuntimeConfig,
  validateOmniRouteRuntimePayload,
} from './omniroute-runtime-contract.js';
import { resolveStagedDesktopRuntimeComponentRoot } from './desktop-runtime-layout.js';
import { assertGlobalHagiscriptAvailable } from './global-hagiscript.js';

const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose');
const requireRuntimePayload = args.includes('--require-runtime') || process.env.HAGICODE_SMOKE_TEST_REQUIRE_RUNTIME === '1';
const requirePackagedRuntimePayload = requireRuntimePayload || [
  process.env.HAGICODE_SMOKE_TEST_PACKAGED_RUNTIME_ROOT,
  process.env.HAGICODE_SMOKE_TEST_PACKAGED_TOOLCHAIN_ROOT,
  process.env.HAGICODE_SMOKE_TEST_PACKAGED_CODE_SERVER_ROOT,
  process.env.HAGICODE_SMOKE_TEST_PACKAGED_OMNIROUTE_ROOT,
].some((value) => typeof value === 'string' && value.trim().length > 0);
const runtimePlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform();
const runtimeConfig = readPinnedRuntimeConfig();
const runtimeTarget = resolvePinnedRuntimeTarget(runtimePlatform, runtimeConfig);
const dotnetExecutableName = getDotnetExecutableName(runtimePlatform);
const stagedRuntimeRoot = resolveStagedDesktopRuntimeComponentRoot('dotnet', { cwd: process.cwd(), platform: runtimePlatform });
const packagedRuntimeCandidates = resolvePackagedRuntimeRoots(runtimePlatform);
const packagedRuntimeRoot = resolveExistingPackagedRuntimeRoot(packagedRuntimeCandidates);
const requiresExecutableDotnetHost = !runtimePlatform.startsWith('win-');
const nodeRuntimePlatform = process.env.HAGICODE_EMBEDDED_NODE_PLATFORM || detectNodeRuntimePlatform();
const stagedToolchainRoot = resolveStagedDesktopRuntimeComponentRoot('node', { cwd: process.cwd() });
const packagedToolchainCandidates = resolvePackagedToolchainRoots();
const packagedToolchainRoot = resolveExistingPackagedRuntimeRoot(packagedToolchainCandidates);
const codeServerPlatform = process.env.HAGICODE_CODE_SERVER_PLATFORM || detectCodeServerRuntimePlatform();
const codeServerConfig = readCodeServerRuntimeConfig();
const stagedCodeServerRoot = resolveStagedDesktopRuntimeComponentRoot('code-server', { cwd: process.cwd() });
const packagedCodeServerCandidates = resolvePackagedCodeServerRoots();
const packagedCodeServerRoot = resolveExistingPackagedRuntimeRoot(packagedCodeServerCandidates);
const omniroutePlatform = process.env.HAGICODE_OMNIROUTE_PLATFORM || detectOmniRouteRuntimePlatform();
const omnirouteConfig = readOmniRouteRuntimeConfig();
const stagedOmniRouteRoot = resolveStagedDesktopRuntimeComponentRoot('omniroute', { cwd: process.cwd() });
const packagedOmniRouteCandidates = resolvePackagedOmniRouteRoots();
const packagedOmniRouteRoot = resolveExistingPackagedRuntimeRoot(packagedOmniRouteCandidates);
const packagedSteamWrapperPath = resolvePackagedSteamWrapperPath();
const packagedSteamSandboxPath = resolvePackagedSteamSandboxPath();
const globalHagiscriptVersion = (() => {
  try {
    return assertGlobalHagiscriptAvailable();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
})();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
};

function resolvePackagedRuntimeRoots(platform) {
  const override = process.env.HAGICODE_SMOKE_TEST_PACKAGED_RUNTIME_ROOT?.trim();
  if (override) {
    return [path.resolve(process.cwd(), override)];
  }

  if (platform.startsWith('win-')) {
    return [path.join(process.cwd(), 'pkg', 'win-unpacked', 'resources', 'extra', 'runtime', 'components', 'dotnet', 'runtime', platform, 'current')];
  }
  if (platform.startsWith('linux-')) {
    return [path.join(process.cwd(), 'pkg', 'linux-unpacked', 'resources', 'extra', 'runtime', 'components', 'dotnet', 'runtime', platform, 'current')];
  }
  if (platform.startsWith('osx-')) {
    return [
      path.join(process.cwd(), 'pkg', 'mac', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'dotnet', 'runtime', platform, 'current'),
      path.join(process.cwd(), 'pkg', 'mac-x64', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'dotnet', 'runtime', platform, 'current'),
      path.join(process.cwd(), 'pkg', 'mac-arm64', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'dotnet', 'runtime', platform, 'current'),
      path.join(process.cwd(), 'pkg', 'mac-universal', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'dotnet', 'runtime', platform, 'current'),
    ];
  }
  return [];
}

function resolveExistingPackagedRuntimeRoot(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0] || null;
}

function resolvePackagedToolchainRoots() {
  const override = process.env.HAGICODE_SMOKE_TEST_PACKAGED_TOOLCHAIN_ROOT?.trim();
  if (override) {
    return [path.resolve(process.cwd(), override)];
  }

  if (process.platform === 'win32') {
    return [path.join(process.cwd(), 'pkg', 'win-unpacked', 'resources', 'extra', 'runtime', 'components', 'node', 'runtime')];
  }
  if (process.platform === 'linux') {
    return [path.join(process.cwd(), 'pkg', 'linux-unpacked', 'resources', 'extra', 'runtime', 'components', 'node', 'runtime')];
  }
  if (process.platform === 'darwin') {
    if (nodeRuntimePlatform === 'osx-x64') {
      return [
          path.join(process.cwd(), 'pkg', 'mac-x64', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'node', 'runtime'),
          path.join(process.cwd(), 'pkg', 'mac', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'node', 'runtime'),
      ];
    }
    if (nodeRuntimePlatform === 'osx-arm64') {
      return [
          path.join(process.cwd(), 'pkg', 'mac-arm64', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'node', 'runtime'),
          path.join(process.cwd(), 'pkg', 'mac', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'node', 'runtime'),
      ];
    }

    return [
      path.join(process.cwd(), 'pkg', 'mac', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'node', 'runtime'),
      path.join(process.cwd(), 'pkg', 'mac-x64', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'node', 'runtime'),
      path.join(process.cwd(), 'pkg', 'mac-arm64', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'node', 'runtime'),
      path.join(process.cwd(), 'pkg', 'mac-universal', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'node', 'runtime'),
    ];
  }
  return [];
}

function resolvePackagedCodeServerRoots() {
  const override = process.env.HAGICODE_SMOKE_TEST_PACKAGED_CODE_SERVER_ROOT?.trim();
  if (override) {
    return [path.resolve(process.cwd(), override)];
  }

  if (process.platform === 'win32') {
    return [path.join(process.cwd(), 'pkg', 'win-unpacked', 'resources', 'extra', 'runtime', 'components', 'bundled', 'code-server', 'current')];
  }
  if (process.platform === 'linux') {
    return [path.join(process.cwd(), 'pkg', 'linux-unpacked', 'resources', 'extra', 'runtime', 'components', 'bundled', 'code-server', 'current')];
  }
  if (process.platform === 'darwin') {
    return [
      path.join(process.cwd(), 'pkg', 'mac', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'bundled', 'code-server', 'current'),
      path.join(process.cwd(), 'pkg', 'mac-x64', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'bundled', 'code-server', 'current'),
      path.join(process.cwd(), 'pkg', 'mac-arm64', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'bundled', 'code-server', 'current'),
      path.join(process.cwd(), 'pkg', 'mac-universal', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'bundled', 'code-server', 'current'),
    ];
  }
  return [];
}

function resolvePackagedOmniRouteRoots() {
  const override = process.env.HAGICODE_SMOKE_TEST_PACKAGED_OMNIROUTE_ROOT?.trim();
  if (override) {
    return [path.resolve(process.cwd(), override)];
  }

  if (process.platform === 'win32') {
    return [path.join(process.cwd(), 'pkg', 'win-unpacked', 'resources', 'extra', 'runtime', 'components', 'bundled', 'omniroute', 'current')];
  }
  if (process.platform === 'linux') {
    return [path.join(process.cwd(), 'pkg', 'linux-unpacked', 'resources', 'extra', 'runtime', 'components', 'bundled', 'omniroute', 'current')];
  }
  if (process.platform === 'darwin') {
    return [
      path.join(process.cwd(), 'pkg', 'mac', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'bundled', 'omniroute', 'current'),
      path.join(process.cwd(), 'pkg', 'mac-x64', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'bundled', 'omniroute', 'current'),
      path.join(process.cwd(), 'pkg', 'mac-arm64', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'bundled', 'omniroute', 'current'),
      path.join(process.cwd(), 'pkg', 'mac-universal', 'Hagicode Desktop.app', 'Contents', 'Resources', 'extra', 'runtime', 'components', 'bundled', 'omniroute', 'current'),
    ];
  }
  return [];
}

function resolvePackagedSteamWrapperPath() {
  if (process.platform === 'linux') {
    return path.join(process.cwd(), 'pkg', 'linux-unpacked', 'hagicode-steam-wrapper.sh');
  }

  return null;
}

function resolvePackagedSteamSandboxPath() {
  if (process.platform === 'linux') {
    return path.join(process.cwd(), 'pkg', 'linux-unpacked', 'hagicode-steam-sandbox.sh');
  }

  return null;
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

function validateRuntimePayload(runtimeRoot) {
  const missing = [];
  const dotnetPath = path.join(runtimeRoot, dotnetExecutableName);
  if (!fs.existsSync(dotnetPath)) {
    missing.push(dotnetExecutableName);
  } else if (requiresExecutableDotnetHost && !isExecutable(dotnetPath)) {
    missing.push(`${dotnetExecutableName} (not executable)`);
  }

  if (listVersionDirectories(path.join(runtimeRoot, 'host', 'fxr')).length === 0) {
    missing.push('host/fxr');
  }

  if (listVersionDirectories(path.join(runtimeRoot, 'shared', 'Microsoft.AspNetCore.App')).length === 0) {
    missing.push('shared/Microsoft.AspNetCore.App');
  }

  if (listVersionDirectories(path.join(runtimeRoot, 'shared', 'Microsoft.NETCore.App')).length === 0) {
    missing.push('shared/Microsoft.NETCore.App');
  }

  return missing;
}

function inspectRuntimeVersions(runtimeRoot) {
  return {
    aspNetCoreVersion: pickHighestVersion(listVersionDirectories(path.join(runtimeRoot, 'shared', 'Microsoft.AspNetCore.App'))),
    netCoreVersion: pickHighestVersion(listVersionDirectories(path.join(runtimeRoot, 'shared', 'Microsoft.NETCore.App'))),
    hostFxrVersion: pickHighestVersion(listVersionDirectories(path.join(runtimeRoot, 'host', 'fxr'))),
  };
}

function readRuntimeMetadata(runtimeRoot) {
  const metadataPath = path.join(runtimeRoot, EMBEDDED_RUNTIME_METADATA_FILE);
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`Runtime metadata file is missing: ${metadataPath}`);
  }

  return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
}

function validatePinnedRuntimeMetadata(runtimeRoot) {
  const metadata = readRuntimeMetadata(runtimeRoot);
  ensureOfficialMicrosoftDownloadUrl(metadata.downloadUrl, runtimeConfig.source?.allowedDownloadHosts || []);

  const errors = [];
  const versions = inspectRuntimeVersions(runtimeRoot);
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
    errors.push(`staged ASP.NET Core version expected ${runtimeTarget.aspNetCoreVersion} but found ${versions.aspNetCoreVersion || 'missing'}`);
  }
  if (versions.netCoreVersion !== runtimeTarget.netCoreVersion) {
    errors.push(`staged Microsoft.NETCore.App version expected ${runtimeTarget.netCoreVersion} but found ${versions.netCoreVersion || 'missing'}`);
  }
  if (versions.hostFxrVersion !== runtimeTarget.hostFxrVersion) {
    errors.push(`staged host/fxr version expected ${runtimeTarget.hostFxrVersion} but found ${versions.hostFxrVersion || 'missing'}`);
  }

  return errors;
}

function validateVendoredCodeServerRuntime(runtimeRoot) {
  const result = validateCodeServerRuntimePayload(runtimeRoot, {
    platformKey: codeServerPlatform,
    config: codeServerConfig,
  });
  return [...result.missingEntries, ...result.diagnostics];
}

function validateVendoredOmniRouteRuntime(runtimeRoot) {
  const result = validateOmniRouteRuntimePayload(runtimeRoot, {
    platformKey: omniroutePlatform,
    config: omnirouteConfig,
  });
  return [...result.missingEntries, ...result.diagnostics];
}

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logVerbose(message) {
  if (isVerbose) {
    log(`  [VERBOSE] ${message}`, colors.gray);
  }
}

function test(name, fn) {
  results.tests.push({ name, fn });
}

function assert(condition, message) {
  if (condition) {
    log(`  + ${message}`, colors.green);
    results.passed++;
    return true;
  }

  log(`  x ${message}`, colors.red);
  results.failed++;
  return false;
}

test('dist directory exists', () => {
  const distPath = path.join(process.cwd(), 'dist');
  const exists = fs.existsSync(distPath);
  assert(exists, 'dist directory exists');

  if (exists) {
    const bootstrapJs = path.join(distPath, 'main', 'bootstrap.js');
    const mainJs = path.join(distPath, 'main', 'main.js');
    const rendererPath = path.join(distPath, 'renderer');
    logVerbose(`dist/main/bootstrap.js exists: ${fs.existsSync(bootstrapJs)}`);
    logVerbose(`dist/main/main.js exists: ${fs.existsSync(mainJs)}`);
    logVerbose(`dist/renderer exists: ${fs.existsSync(rendererPath)}`);
  }
});

test('main process entry files exist', () => {
  const bootstrapJs = path.join(process.cwd(), 'dist', 'main', 'bootstrap.js');
  const mainJs = path.join(process.cwd(), 'dist', 'main', 'main.js');
  const bootstrapExists = fs.existsSync(bootstrapJs);
  const mainExists = fs.existsSync(mainJs);
  assert(bootstrapExists, 'dist/main/bootstrap.js exists');
  assert(mainExists, 'dist/main/main.js exists');

  if (bootstrapExists) {
    const stats = fs.statSync(bootstrapJs);
    logVerbose(`bootstrap.js size: ${stats.size} bytes`);
    assert(stats.size > 0, 'bootstrap.js is not empty');
  }

  if (mainExists) {
    const stats = fs.statSync(mainJs);
    logVerbose(`main.js size: ${stats.size} bytes`);
    assert(stats.size > 0, 'main.js is not empty');
  }
});

test('legacy main process implementation exists', () => {
  const mainJs = path.join(process.cwd(), 'dist', 'main', 'main.js');
  const exists = fs.existsSync(mainJs);
  assert(exists, 'dist/main/main.js exists');

  if (exists) {
    const stats = fs.statSync(mainJs);
    logVerbose(`main.js size: ${stats.size} bytes`);
    assert(stats.size > 0, 'main.js is not empty');
  }
});

test('renderer process files exist', () => {
  const indexPath = path.join(process.cwd(), 'dist', 'renderer', 'index.html');
  const exists = fs.existsSync(indexPath);
  assert(exists, 'dist/renderer/index.html exists');

  if (exists) {
    const content = fs.readFileSync(indexPath, 'utf8');
    logVerbose(`index.html references scripts: ${content.includes('<script')}`);
  }
});

test('preload script exists', () => {
  const preloadPath = path.join(process.cwd(), 'dist', 'preload', 'index.mjs');
  const exists = fs.existsSync(preloadPath);
  assert(exists, 'dist/preload/index.mjs exists');

  if (exists) {
    const content = fs.readFileSync(preloadPath, 'utf8');
    logVerbose(`preload script includes contextBridge: ${content.includes('contextBridge')}`);
  }
});

test('package.json is valid', () => {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const exists = fs.existsSync(pkgPath);

  if (!assert(exists, 'package.json exists')) {
    return;
  }

  try {
    const content = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(content);
    assert(pkg.name && pkg.version, 'package.json has name and version');
    assert(pkg.main === 'dist/main/bootstrap.js', 'package.json main points to dist/main/bootstrap.js');
    logVerbose(`name: ${pkg.name}, version: ${pkg.version}`);
  } catch (error) {
    assert(false, `package.json is valid JSON: ${error.message}`);
  }
});

test('main.js has content', () => {
  const mainJs = path.join(process.cwd(), 'dist', 'main', 'main.js');

  if (!fs.existsSync(mainJs)) {
    log('  - Skipping: main.js does not exist', colors.yellow);
    results.skipped++;
    return;
  }

  const stats = fs.statSync(mainJs);
  assert(stats.size > 1000, 'main.js has reasonable size (> 1KB)');
  logVerbose(`main.js size: ${stats.size} bytes`);
});

test('electron-builder configuration is valid', async () => {
  const yamlPath = path.join(process.cwd(), 'electron-builder.yml');
  const pkgPath = path.join(process.cwd(), 'package.json');

  let buildConfig = null;
  let configSource = '';

  if (fs.existsSync(yamlPath)) {
    try {
      const yaml = await import('js-yaml');
      const content = fs.readFileSync(yamlPath, 'utf8');
      buildConfig = yaml.load(content);
      configSource = 'electron-builder.yml';
    } catch (error) {
      assert(false, `electron-builder.yml is valid YAML: ${error.message}`);
      return;
    }
  } else if (fs.existsSync(pkgPath)) {
    try {
      const content = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(content);
      buildConfig = pkg.build;
      configSource = 'package.json';
    } catch (error) {
      assert(false, `package.json is valid JSON: ${error.message}`);
      return;
    }
  } else {
    results.skipped++;
    return;
  }

  if (!buildConfig) {
    assert(false, `build configuration exists in ${configSource}`);
    return;
  }

  const hasAsar = buildConfig?.asar === true;
  const hasFiles = Array.isArray(buildConfig?.files);
  const extraResources = Array.isArray(buildConfig?.extraResources) ? buildConfig.extraResources : [];
  const linuxExtraFiles = Array.isArray(buildConfig?.linux?.extraFiles) ? buildConfig.linux.extraFiles : [];
  const windowIconExtraResource = extraResources.find((entry) => entry.from === 'resources/icon.png');
  const runtimeExtraResource = extraResources.find((entry) => entry.from === 'build/desktop-runtime/current');
  const steamWrapperExtraFile = linuxExtraFiles.find((entry) => entry.from === 'resources/linux/hagicode-steam-wrapper.sh');
  const steamSandboxExtraFile = linuxExtraFiles.find((entry) => entry.from === 'resources/linux/hagicode-steam-sandbox.sh');
  const macToolchainSigningHook = 'scripts/macos-toolchain-signing-hook.cjs';
  const windowIconOutsideAsar = typeof windowIconExtraResource?.to === 'string' && !windowIconExtraResource.to.includes('app.asar');
  const runtimeOutsideAsar = typeof runtimeExtraResource?.to === 'string' && !runtimeExtraResource.to.includes('app.asar');
  const runtimeCanonicalPath = runtimeExtraResource?.to === 'extra/runtime';
  const legacyToolchainExtraResource = extraResources.find((entry) => entry.from === 'resources/toolchain' || entry.to === 'extra/toolchain');
  const legacyCodeServerExtraResource = extraResources.find((entry) => entry.from === 'resources/code-server/current' || entry.to === 'extra/code-server/current');
  const legacyOmniRouteExtraResource = extraResources.find((entry) => entry.from === 'resources/omniroute/current' || entry.to === 'extra/omniroute/current');
  const macSignIgnore = Array.isArray(buildConfig?.mac?.signIgnore)
    ? buildConfig.mac.signIgnore
    : (buildConfig?.mac?.signIgnore ? [buildConfig.mac.signIgnore] : []);
  const runtimeSkippedByMacSigning = macSignIgnore.some((pattern) => String(pattern).includes('extra/runtime'));
  const legacyRuntimeSigningPattern = macSignIgnore.some((pattern) => String(pattern).includes('extra/toolchain') || String(pattern).includes('extra/code-server/current') || String(pattern).includes('extra/omniroute/current'));
  const toolchainStashedDuringMacSigning = buildConfig?.afterPack === macToolchainSigningHook && buildConfig?.afterSign === macToolchainSigningHook;
  const linuxTargets = Array.isArray(buildConfig?.linux?.target)
    ? buildConfig.linux.target
      .map((entry) => (typeof entry === 'string' ? entry : entry?.target))
      .filter(Boolean)
    : [];

  logVerbose(`config source: ${configSource}`);
  logVerbose(`asar enabled: ${hasAsar}`);
  logVerbose(`runtime extraResources entries: ${extraResources.length}`);
  logVerbose(`linux targets: ${linuxTargets.join(', ') || 'none'}`);

  assert(true, `build configuration exists (${configSource})`);
  assert(hasAsar, 'asar packaging is enabled');
  assert(hasFiles, 'files to include are specified');
  assert(Boolean(windowIconExtraResource), 'window icon is shipped via extraResources');
  assert(windowIconOutsideAsar, 'window icon is staged outside app.asar');
  assert(Boolean(runtimeExtraResource), 'desktop runtime is shipped via extraResources');
  assert(runtimeOutsideAsar, 'embedded runtime is staged outside app.asar');
  assert(runtimeCanonicalPath, 'desktop runtime is staged at extra/runtime');
  assert(!legacyToolchainExtraResource, 'legacy split packaged toolchain root is no longer shipped');
  assert(!legacyCodeServerExtraResource, 'legacy split packaged code-server root is no longer shipped');
  assert(!legacyOmniRouteExtraResource, 'legacy split packaged OmniRoute root is no longer shipped');
  assert(Boolean(steamWrapperExtraFile), 'steam Linux wrapper is shipped via extraFiles');
  assert(steamWrapperExtraFile?.to === 'hagicode-steam-wrapper.sh', 'steam Linux wrapper is staged at the package root');
  assert(Boolean(steamSandboxExtraFile), 'steam Linux sandbox helper is shipped via extraFiles');
  assert(steamSandboxExtraFile?.to === 'hagicode-steam-sandbox.sh', 'steam Linux sandbox helper is staged at the package root');
  assert(runtimeSkippedByMacSigning, 'desktop runtime is excluded from recursive macOS code signing');
  assert(!legacyRuntimeSigningPattern, 'macOS signing ignore no longer targets legacy split runtime roots');
  assert(toolchainStashedDuringMacSigning, 'bundled Node toolchain is stashed outside the macOS app during code signing');
  assert(linuxTargets.includes('AppImage'), 'linux packaging keeps AppImage output');
  assert(linuxTargets.includes('tar.gz'), 'linux packaging keeps tar.gz output');
  assert(linuxTargets.includes('zip'), 'linux packaging adds ZIP output');
  assert(!linuxTargets.includes('deb'), 'linux packaging no longer emits deb output');
});

test('desktop build workflow includes ZIP publication steps', () => {
  const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'build.yml');
  const exists = fs.existsSync(workflowPath);

  if (!assert(exists, '.github/workflows/build.yml exists')) {
    return;
  }

  const content = fs.readFileSync(workflowPath, 'utf8');

  assert(content.includes('Prepare Windows unpacked ZIP payload workspace'), 'workflow stages the unpacked Windows ZIP payload before compression');
  assert(content.includes('Create Windows ZIP artifact'), 'workflow creates Windows ZIP artifacts after staging');
  assert(content.includes('Upload Windows ZIP'), 'workflow uploads Windows ZIP CI artifacts');
  assert(content.includes('Upload Windows ZIP to Release'), 'workflow uploads Windows ZIP release assets');
  assert(content.includes('Summarize Linux ZIP artifacts'), 'workflow reports Linux ZIP diagnostics');
  assert(content.includes('Upload Linux ZIP'), 'workflow uploads Linux ZIP CI artifacts');
  assert(content.includes('Upload Linux ZIP to Release'), 'workflow uploads Linux ZIP release assets');
});

test('global hagiscript prerequisite is available', () => {
  assert(!globalHagiscriptVersion.includes('required') && !globalHagiscriptVersion.includes('missing'), `global hagiscript prerequisite resolved (${globalHagiscriptVersion})`);
});

test('staged bundled Node toolchain payload is complete', () => {
  if (!requireRuntimePayload && !fs.existsSync(stagedToolchainRoot)) {
    log('  - Skipping: staged bundled Node toolchain not required for this smoke-test run', colors.yellow);
    results.skipped++;
    return;
  }

  const exists = fs.existsSync(stagedToolchainRoot);
  if (!assert(exists, `staged bundled Node toolchain directory exists (${stagedToolchainRoot})`)) {
    return;
  }

  const missingComponents = validateToolchainPayload(stagedToolchainRoot, { platform: nodeRuntimePlatform });
  assert(
    missingComponents.length === 0,
    missingComponents.length === 0
      ? 'staged bundled Node toolchain contains node, npm, and the deferred package manifest contract'
      : `staged bundled Node toolchain is missing: ${missingComponents.join(', ')}`,
  );

  const manifestErrors = validateToolchainManifest(stagedToolchainRoot, { platform: nodeRuntimePlatform });
  assert(
    manifestErrors.length === 0,
    manifestErrors.length === 0
      ? 'staged bundled Node toolchain manifest matches the pinned Desktop contract'
      : `staged bundled Node toolchain manifest mismatch: ${manifestErrors.join('; ')}`,
  );
});

test('packaged bundled Node toolchain payload is complete', () => {
  if (!packagedToolchainRoot) {
    log('  - Skipping: packaged bundled Node toolchain checks are not defined for this platform', colors.yellow);
    results.skipped++;
    return;
  }

  if (!requirePackagedRuntimePayload) {
    log('  - Skipping: packaged bundled Node toolchain not required for this smoke-test run', colors.yellow);
    results.skipped++;
    return;
  }

  const exists = fs.existsSync(packagedToolchainRoot);
  if (!assert(exists, `packaged bundled Node toolchain directory exists (${packagedToolchainRoot})`)) {
    if (packagedToolchainCandidates.length > 1) {
      logVerbose(`checked packaged toolchain candidates: ${packagedToolchainCandidates.join(', ')}`);
    }
    return;
  }

  assert(!packagedToolchainRoot.includes('app.asar'), 'packaged bundled Node toolchain directory resolves outside app.asar');
  assert(packagedToolchainRoot.includes(path.join('extra', 'runtime', 'components', 'node', 'runtime')), 'packaged bundled Node toolchain uses canonical extra/runtime/components/node/runtime path');
  assert(!packagedToolchainRoot.includes(path.join('extra', 'toolchain')), 'packaged bundled Node toolchain does not use the legacy extra/toolchain path');

  const missingComponents = validateToolchainPayload(packagedToolchainRoot, { platform: nodeRuntimePlatform });
  assert(
    missingComponents.length === 0,
    missingComponents.length === 0
      ? 'packaged bundled Node toolchain contains node, npm, and the deferred package manifest contract'
      : `packaged bundled Node toolchain is missing: ${missingComponents.join(', ')}`,
  );

  const manifestErrors = validateToolchainManifest(packagedToolchainRoot, { platform: nodeRuntimePlatform });
  assert(
    manifestErrors.length === 0,
    manifestErrors.length === 0
      ? 'packaged bundled Node toolchain manifest matches the pinned Desktop contract'
      : `packaged bundled Node toolchain manifest mismatch: ${manifestErrors.join('; ')}`,
  );
});

test('staged vendored code-server payload is complete', () => {
  if (!requireRuntimePayload && !fs.existsSync(stagedCodeServerRoot)) {
    log('  - Skipping: staged vendored code-server runtime not required for this smoke-test run', colors.yellow);
    results.skipped++;
    return;
  }

  const exists = fs.existsSync(stagedCodeServerRoot);
  if (!assert(exists, `staged vendored code-server runtime exists (${stagedCodeServerRoot})`)) {
    return;
  }

  const errors = validateVendoredCodeServerRuntime(stagedCodeServerRoot);
  assert(
    errors.length === 0,
    errors.length === 0
      ? 'staged vendored code-server runtime matches the Desktop layout contract'
      : `staged vendored code-server runtime mismatch: ${errors.join('; ')}`,
  );
});

test('staged vendored OmniRoute payload is complete', () => {
  if (!requireRuntimePayload && !fs.existsSync(stagedOmniRouteRoot)) {
    log('  - Skipping: staged vendored OmniRoute runtime not required for this smoke-test run', colors.yellow);
    results.skipped++;
    return;
  }

  const exists = fs.existsSync(stagedOmniRouteRoot);
  if (!assert(exists, `staged vendored OmniRoute runtime exists (${stagedOmniRouteRoot})`)) {
    return;
  }

  const errors = validateVendoredOmniRouteRuntime(stagedOmniRouteRoot);
  assert(
    errors.length === 0,
    errors.length === 0
      ? 'staged vendored OmniRoute runtime matches the Desktop layout contract'
      : `staged vendored OmniRoute runtime mismatch: ${errors.join('; ')}`,
  );
});

test('packaged vendored code-server payload is complete', () => {
  if (!packagedCodeServerRoot) {
    log('  - Skipping: packaged vendored code-server checks are not defined for this platform', colors.yellow);
    results.skipped++;
    return;
  }

  if (!requirePackagedRuntimePayload) {
    log('  - Skipping: packaged vendored code-server runtime not required for this smoke-test run', colors.yellow);
    results.skipped++;
    return;
  }

  const exists = fs.existsSync(packagedCodeServerRoot);
  if (!assert(exists, `packaged vendored code-server runtime exists (${packagedCodeServerRoot})`)) {
    if (packagedCodeServerCandidates.length > 1) {
      logVerbose(`checked packaged code-server candidates: ${packagedCodeServerCandidates.join(', ')}`);
    }
    return;
  }

  assert(!packagedCodeServerRoot.includes('app.asar'), 'packaged vendored code-server runtime resolves outside app.asar');
  assert(packagedCodeServerRoot.includes(path.join('extra', 'runtime', 'components', 'bundled', 'code-server')), 'packaged vendored code-server runtime uses canonical extra/runtime/components/bundled/code-server path');
  assert(!packagedCodeServerRoot.includes(path.join('extra', 'code-server', 'current')), 'packaged vendored code-server runtime does not use the legacy extra/code-server/current path');

  const errors = validateVendoredCodeServerRuntime(packagedCodeServerRoot);
  assert(
    errors.length === 0,
    errors.length === 0
      ? 'packaged vendored code-server runtime matches the Desktop layout contract'
      : `packaged vendored code-server runtime mismatch: ${errors.join('; ')}`,
  );
});

test('packaged vendored OmniRoute payload is complete', () => {
  if (!packagedOmniRouteRoot) {
    log('  - Skipping: packaged vendored OmniRoute checks are not defined for this platform', colors.yellow);
    results.skipped++;
    return;
  }

  if (!requirePackagedRuntimePayload) {
    log('  - Skipping: packaged vendored OmniRoute runtime not required for this smoke-test run', colors.yellow);
    results.skipped++;
    return;
  }

  const exists = fs.existsSync(packagedOmniRouteRoot);
  if (!assert(exists, `packaged vendored OmniRoute runtime exists (${packagedOmniRouteRoot})`)) {
    if (packagedOmniRouteCandidates.length > 1) {
      logVerbose(`checked packaged OmniRoute candidates: ${packagedOmniRouteCandidates.join(', ')}`);
    }
    return;
  }

  assert(!packagedOmniRouteRoot.includes('app.asar'), 'packaged vendored OmniRoute runtime resolves outside app.asar');
  assert(packagedOmniRouteRoot.includes(path.join('extra', 'runtime', 'components', 'bundled', 'omniroute')), 'packaged vendored OmniRoute runtime uses canonical extra/runtime/components/bundled/omniroute path');
  assert(!packagedOmniRouteRoot.includes(path.join('extra', 'omniroute', 'current')), 'packaged vendored OmniRoute runtime does not use the legacy extra/omniroute/current path');

  const errors = validateVendoredOmniRouteRuntime(packagedOmniRouteRoot);
  assert(
    errors.length === 0,
    errors.length === 0
      ? 'packaged vendored OmniRoute runtime matches the Desktop layout contract'
      : `packaged vendored OmniRoute runtime mismatch: ${errors.join('; ')}`,
  );
});

test('staged embedded runtime payload is complete', () => {
  if (!requireRuntimePayload && !fs.existsSync(stagedRuntimeRoot)) {
    log('  - Skipping: staged runtime not required for this smoke-test run', colors.yellow);
    results.skipped++;
    return;
  }

  const exists = fs.existsSync(stagedRuntimeRoot);
  if (!assert(exists, `staged runtime directory exists (${stagedRuntimeRoot})`)) {
    return;
  }

  const missingComponents = validateRuntimePayload(stagedRuntimeRoot);
  assert(
    missingComponents.length === 0,
    missingComponents.length === 0
      ? 'staged runtime payload contains dotnet host, host/fxr, Microsoft.NETCore.App, and Microsoft.AspNetCore.App'
      : `staged runtime payload is missing: ${missingComponents.join(', ')}`,
  );

  const metadataErrors = validatePinnedRuntimeMetadata(stagedRuntimeRoot);
  assert(
    metadataErrors.length === 0,
    metadataErrors.length === 0
      ? 'staged runtime metadata matches the pinned Microsoft runtime manifest'
      : `staged runtime metadata mismatch: ${metadataErrors.join('; ')}`,
  );
});

test('packaged runtime payload is complete', () => {
  if (!packagedRuntimeRoot) {
    log('  - Skipping: packaged runtime checks are not defined for this platform', colors.yellow);
    results.skipped++;
    return;
  }

  if (!requirePackagedRuntimePayload) {
    log('  - Skipping: packaged runtime not required for this smoke-test run', colors.yellow);
    results.skipped++;
    return;
  }

  const exists = fs.existsSync(packagedRuntimeRoot);
  if (!assert(exists, `packaged runtime directory exists (${packagedRuntimeRoot})`)) {
    if (packagedRuntimeCandidates.length > 1) {
      logVerbose(`checked packaged runtime candidates: ${packagedRuntimeCandidates.join(', ')}`);
    }
    return;
  }

  assert(!packagedRuntimeRoot.includes('app.asar'), 'packaged runtime directory resolves outside app.asar');

  const missingComponents = validateRuntimePayload(packagedRuntimeRoot);
  assert(
    missingComponents.length === 0,
    missingComponents.length === 0
      ? 'packaged runtime payload contains dotnet host, host/fxr, Microsoft.NETCore.App, and Microsoft.AspNetCore.App'
      : `packaged runtime payload is missing: ${missingComponents.join(', ')}`,
  );

  const metadataErrors = validatePinnedRuntimeMetadata(packagedRuntimeRoot);
  assert(
    metadataErrors.length === 0,
    metadataErrors.length === 0
      ? 'packaged runtime metadata matches the pinned Microsoft runtime manifest'
      : `packaged runtime metadata mismatch: ${metadataErrors.join('; ')}`,
  );
});

test('packaged Steam wrapper is available for Linux launches', () => {
  if (!packagedSteamWrapperPath) {
    log('  - Skipping: packaged Steam wrapper checks are only defined for Linux', colors.yellow);
    results.skipped++;
    return;
  }

  if (!requirePackagedRuntimePayload) {
    log('  - Skipping: packaged Steam wrapper not required for this smoke-test run', colors.yellow);
    results.skipped++;
    return;
  }

  if (!assert(fs.existsSync(packagedSteamWrapperPath), `packaged Steam wrapper exists (${packagedSteamWrapperPath})`)) {
    return;
  }

  assert(isExecutable(packagedSteamWrapperPath), 'packaged Steam wrapper is executable');

  const wrapperContent = fs.readFileSync(packagedSteamWrapperPath, 'utf8');
  assert(wrapperContent.includes('steam-runtime-launch-client'), 'packaged Steam wrapper can relaunch pressure-vessel sessions on the host');
  assert(wrapperContent.includes('--host'), 'packaged Steam wrapper uses Steam Runtime host launcher mode');
  assert(wrapperContent.includes('-- \\\n      /usr/bin/env'), 'packaged Steam wrapper separates host launcher options from Electron options');
  assert(wrapperContent.includes('HAGICODE_STEAM_HOST_REEXEC=1'), 'packaged Steam wrapper prevents recursive host relaunch attempts');
  assert(wrapperContent.includes('unset LD_PRELOAD'), 'packaged Steam wrapper clears LD_PRELOAD before launch');
  assert(wrapperContent.includes('unset LD_LIBRARY_PATH'), 'packaged Steam wrapper clears Steam Runtime library overrides');
  assert(wrapperContent.includes('unset GSETTINGS_SCHEMA_DIR'), 'packaged Steam wrapper clears Steam Runtime GSettings overrides');
  assert(wrapperContent.includes('export HAGICODE_STEAM_LINUX=1'), 'packaged Steam wrapper marks Steam Linux launches');
  assert(!wrapperContent.includes('HAGICODE_DISABLE_ELECTRON_SANDBOX=1'), 'packaged Steam wrapper keeps Electron sandbox enabled by default');
  assert(!wrapperContent.includes('--disable-setuid-sandbox'), 'packaged Steam wrapper does not disable the setuid sandbox by default');
  assert(!wrapperContent.includes('--no-sandbox'), 'packaged Steam wrapper does not disable the Chromium sandbox by default');
});

test('packaged Steam sandbox helper is available for Linux launches', () => {
  if (!packagedSteamSandboxPath) {
    log('  - Skipping: packaged Steam sandbox helper checks are only defined for Linux', colors.yellow);
    results.skipped++;
    return;
  }

  if (!requirePackagedRuntimePayload) {
    log('  - Skipping: packaged Steam sandbox helper not required for this smoke-test run', colors.yellow);
    results.skipped++;
    return;
  }

  if (!assert(fs.existsSync(packagedSteamSandboxPath), `packaged Steam sandbox helper exists (${packagedSteamSandboxPath})`)) {
    return;
  }

  assert(isExecutable(packagedSteamSandboxPath), 'packaged Steam sandbox helper is executable');

  const helperContent = fs.readFileSync(packagedSteamSandboxPath, 'utf8');
  assert(helperContent.includes('https://docs.hagicode.com'), 'packaged Steam sandbox helper points to the sandbox documentation URL');
  assert(helperContent.includes('xdg-open') || helperContent.includes('gio open'), 'packaged Steam sandbox helper opens the documentation in a browser');
});

async function main() {
  const startTime = Date.now();

  log('='.repeat(60), colors.blue);
  log('Smoke Test Suite', colors.blue);
  log('='.repeat(60), colors.blue);
  log('');

  for (const { name, fn } of results.tests) {
    log(`Running: ${name}`, colors.blue);
    try {
      await fn();
    } catch (error) {
      log(`  x Test error: ${error.message}`, colors.red);
      results.failed++;
    }
    log('');
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  log('='.repeat(60), colors.blue);
  log('Test Summary', colors.blue);
  log('='.repeat(60), colors.blue);
  log(`  Passed: ${results.passed}`, colors.green);
  if (results.skipped > 0) {
    log(`  Skipped: ${results.skipped}`, colors.yellow);
  }
  if (results.failed > 0) {
    log(`  Failed: ${results.failed}`, colors.red);
  }
  log(`  Duration: ${duration}s`, colors.blue);
  log('='.repeat(60) + '\n', colors.blue);

  if (results.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  log(`Fatal error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
