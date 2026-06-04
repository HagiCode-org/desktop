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
import { pathToFileURL } from 'node:url';
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
import { resolveStagedDesktopRuntimeComponentRoot } from './desktop-runtime-layout.js';
import { assertGlobalHagiscriptAvailable } from './global-hagiscript.js';
import { resolveBundledNodePolicy } from './runtime-node-policy.js';

const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose');
const requireRuntimePayload = args.includes('--require-runtime') || process.env.HAGICODE_SMOKE_TEST_REQUIRE_RUNTIME === '1';
const requirePackagedRuntimePayload = requireRuntimePayload || [
  process.env.HAGICODE_SMOKE_TEST_PACKAGED_RUNTIME_ROOT,
  process.env.HAGICODE_SMOKE_TEST_PACKAGED_TOOLCHAIN_ROOT,
].some((value) => typeof value === 'string' && value.trim().length > 0);
const bundledNodePolicy = resolveBundledNodePolicy({ cwd: process.cwd(), env: process.env });
const requireBundledNodePayload = requireRuntimePayload && bundledNodePolicy.required;
const requirePackagedBundledNodePayload = requirePackagedRuntimePayload && bundledNodePolicy.required;
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
const packagedSteamWrapperPath = resolvePackagedSteamWrapperPath();
const packagedSteamSandboxPath = resolvePackagedSteamSandboxPath();
const globalHagiscriptVersion = (() => {
  try {
    return assertGlobalHagiscriptAvailable();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
})();
const msixAssetDir = path.join(process.cwd(), 'resources', 'msix');
const requiredMsixAssets = [
  { fileName: 'StoreLogo.png', width: 50, height: 50 },
  { fileName: 'Square44x44Logo.png', width: 44, height: 44 },
  { fileName: 'Square150x150Logo.png', width: 150, height: 150 },
  { fileName: 'Wide310x150Logo.png', width: 310, height: 150 },
];

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
    const preferredArch = platform === 'osx-arm64' ? 'arm64' : platform === 'osx-x64' ? 'x64' : null;
    return resolvePackagedMacResourceRoots(preferredArch)
      .map((resourceRoot) => path.join(resourceRoot, 'extra', 'runtime', 'components', 'dotnet', 'runtime', platform, 'current'));
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
    const preferredArch = nodeRuntimePlatform === 'osx-arm64'
      ? 'arm64'
      : nodeRuntimePlatform === 'osx-x64'
        ? 'x64'
        : null;

    return resolvePackagedMacResourceRoots(preferredArch)
      .map((resourceRoot) => path.join(resourceRoot, 'extra', 'runtime', 'components', 'node', 'runtime'));
  }
  return [];
}

function resolvePackagedMacResourceRoots(preferredArch) {
  return resolvePackagedMacRootNames(preferredArch)
    .map((rootName) => path.join(process.cwd(), 'pkg', rootName, 'Hagicode Desktop.app', 'Contents', 'Resources'));
}

function resolvePackagedMacRootNames(preferredArch) {
  if (preferredArch === 'arm64') {
    return ['mac-arm64', 'mac-universal', 'mac', 'mac-x64'];
  }

  if (preferredArch === 'x64') {
    return ['mac', 'mac-x64', 'mac-universal', 'mac-arm64'];
  }

  return ['mac', 'mac-arm64', 'mac-universal', 'mac-x64'];
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

function extractWorkflowStepBlock(workflowContent, stepName) {
  const marker = `- name: ${stepName}`;
  const startIndex = workflowContent.indexOf(marker);
  if (startIndex === -1) {
    return '';
  }

  const nextStepIndex = workflowContent.indexOf('\n      - name:', startIndex + marker.length);
  return workflowContent.slice(startIndex, nextStepIndex === -1 ? undefined : nextStepIndex);
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
function readPngDimensions(targetPath) {
  const buffer = fs.readFileSync(targetPath);
  const pngSignature = '89504e470d0a1a0a';

  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error('Invalid PNG file: ' + targetPath);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
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

test('electron-forge configuration is valid', async () => {
  const forgeConfigPath = path.join(process.cwd(), 'forge.config.js');

  if (!fs.existsSync(forgeConfigPath)) {
    results.skipped++;
    return;
  }

  let forgeConfig = null;
  const forgeConfigSource = fs.readFileSync(forgeConfigPath, 'utf8');
  try {
    forgeConfig = (await import(`${pathToFileURL(forgeConfigPath).href}?t=${Date.now()}`)).default;
  } catch (error) {
    assert(false, `forge.config.js is a valid module: ${error.message}`);
    return;
  }

  const packagerConfig = forgeConfig?.packagerConfig || {};
  const makerNames = Array.isArray(forgeConfig?.makers) ? forgeConfig.makers.map((maker) => maker?.name).filter(Boolean) : [];
  const ignorePatterns = Array.isArray(packagerConfig.ignore) ? packagerConfig.ignore.map((pattern) => String(pattern)) : [];
  const extraResources = Array.isArray(packagerConfig.extraResource) ? packagerConfig.extraResource : [];
  const windowIconExtraResource = extraResources.find((entry) => String(entry).endsWith(path.join('resources', 'icon.png')));
  const runtimeGeneratedPathsExcludedFromAsar = ignorePatterns.some((pattern) => pattern.includes('resources\\/bin') || pattern.includes('resources/bin'))
    && ignorePatterns.some((pattern) => pattern.includes('resources\\/components') || pattern.includes('resources/components'));
  const portableFixedExcludedFromAsar = ignorePatterns.some((pattern) => pattern.includes('portable-fixed'));
  const runtimeCopyHookRegistered = Array.isArray(packagerConfig.afterCopyExtraResources) && packagerConfig.afterCopyExtraResources.length > 0;
  const runtimeRestoreHookRegistered = Array.isArray(packagerConfig.afterComplete) && packagerConfig.afterComplete.length > 0;
  const macSignIgnore = packagerConfig?.osxSign?.ignore;
  const runtimeSkippedByMacSigning = typeof macSignIgnore === 'function'
    ? macSignIgnore('/Applications/Hagicode Desktop.app/Contents/Resources/extra/runtime/components/node/runtime/node')
    : String(macSignIgnore || '').includes('extra/runtime') || forgeConfigSource.includes('extra/runtime');
  const forgeIncludesAppImage = makerNames.includes('@reforged/maker-appimage');
  const forgeIncludesZip = makerNames.includes('@electron-forge/maker-zip');
  const forgeIncludesPortable = makerNames.includes('@rabbitholesyndrome/electron-forge-maker-portable');
  const forgeIncludesNsis = makerNames.includes('@electron-addons/electron-forge-maker-nsis');
  const forgeIncludesMsix = makerNames.includes('@electron-forge/maker-msix');
  const forgeIncludesDmg = makerNames.includes('@electron-forge/maker-dmg');
  const missingMsixAssets = requiredMsixAssets
    .filter((asset) => !fs.existsSync(path.join(msixAssetDir, asset.fileName)))
    .map((asset) => asset.fileName);
  const invalidMsixAssets = requiredMsixAssets
    .filter((asset) => {
      const assetPath = path.join(msixAssetDir, asset.fileName);
      if (!fs.existsSync(assetPath)) {
        return false;
      }

      try {
        const dimensions = readPngDimensions(assetPath);
        return dimensions.width !== asset.width || dimensions.height !== asset.height;
      } catch {
        return true;
      }
    })
    .map((asset) => asset.fileName);

  logVerbose(`asar enabled: ${packagerConfig?.asar === true}`);
  logVerbose(`msix asset directory: ${msixAssetDir}`);
  logVerbose(`forge makers: ${makerNames.join(', ') || 'none'}`);
  logVerbose(`runtime extraResource entries: ${extraResources.length}`);

  assert(Boolean(forgeConfig), 'forge configuration exists');
  assert(packagerConfig?.asar === true, 'asar packaging is enabled');
  assert(missingMsixAssets.length === 0, 'msix tile assets override the default MSIX sample assets');
  assert(invalidMsixAssets.length === 0, 'msix tile assets use the expected Store dimensions');
  assert(Boolean(windowIconExtraResource), 'window icon is staged through Forge extraResource');
  assert(runtimeGeneratedPathsExcludedFromAsar, 'generated runtime directories are excluded from app.asar source files');
  assert(portableFixedExcludedFromAsar, 'portable fixed payload is excluded from app.asar source files');
  assert(runtimeCopyHookRegistered, 'desktop runtime staging hook is registered before packaging completes');
  assert(runtimeRestoreHookRegistered, 'macOS runtime restore hook is registered after packaging completes');
  assert(runtimeSkippedByMacSigning, 'desktop runtime is excluded from recursive macOS code signing');
  assert(forgeIncludesAppImage, 'linux packaging keeps AppImage output');
  assert(forgeIncludesZip, 'Forge keeps ZIP packaging for Linux and macOS');
  assert(forgeIncludesPortable, 'windows packaging keeps the portable target');
  assert(forgeIncludesNsis, 'windows packaging keeps the NSIS target');
  assert(forgeIncludesMsix, 'windows packaging keeps the MSIX target');
  assert(forgeIncludesDmg, 'macOS packaging keeps the DMG target');
});

test('desktop build workflow uses reusable ZIP-aware packaging workflows and split release publication steps', () => {
  const buildWorkflowPath = path.join(process.cwd(), '.github', 'workflows', 'build.yml');
  const reusableWindowsWorkflowPath = path.join(process.cwd(), '.github', 'workflows', 'reusable-build-windows.yml');
  const reusableUnixWorkflowPath = path.join(process.cwd(), '.github', 'workflows', 'reusable-build-unix.yml');
  const legacyPublishPreviewWorkflowPath = path.join(process.cwd(), '.github', 'workflows', 'publish-dev.yml');
  const buildExists = fs.existsSync(buildWorkflowPath);
  const reusableWindowsExists = fs.existsSync(reusableWindowsWorkflowPath);
  const reusableUnixExists = fs.existsSync(reusableUnixWorkflowPath);
  const legacyPublishPreviewExists = fs.existsSync(legacyPublishPreviewWorkflowPath);

  if (!assert(buildExists, '.github/workflows/build.yml exists')) {
    return;
  }

  assert(reusableWindowsExists, '.github/workflows/reusable-build-windows.yml exists');
  assert(reusableUnixExists, '.github/workflows/reusable-build-unix.yml exists');
  assert(!legacyPublishPreviewExists, '.github/workflows/publish-dev.yml is removed in favor of reusable build workflows');

  const buildContent = fs.readFileSync(buildWorkflowPath, 'utf8');
  const reusableWindowsContent = fs.readFileSync(reusableWindowsWorkflowPath, 'utf8');
  const reusableUnixContent = fs.readFileSync(reusableUnixWorkflowPath, 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const msixStoreStepContent = extractWorkflowStepBlock(reusableWindowsContent, 'Build Windows MSIX Store package');
  const windowsZipVerifyStepContent = extractWorkflowStepBlock(reusableWindowsContent, 'Verify Windows ZIP toolchain payload');

  assert(buildContent.includes('production_build'), 'build workflow exposes a manual production_build input');
  assert(buildContent.includes('is_production_build'), 'build workflow resolves production build metadata');
  assert(buildContent.includes('uses: ./.github/workflows/reusable-build-windows.yml'), 'build workflow delegates Windows packaging to the reusable Windows workflow');
  assert(buildContent.includes('uses: ./.github/workflows/reusable-build-unix.yml'), 'build workflow delegates Linux and macOS packaging to the reusable Unix workflow');
  assert(buildContent.includes('Publish Windows Release Assets'), 'build workflow publishes Windows release assets in a separate job');
  assert(buildContent.includes('Publish ${{ matrix.target.name }} Release Assets'), 'build workflow publishes non-Windows release assets through a matrix job');
  assert(buildContent.includes('release-assets/windows/**/*.msix'), 'build workflow publishes MSIX release assets');
  assert(buildContent.includes("needs.prepare-release.outputs.is_tag_release == 'true'"), 'build workflow only publishes GitHub release assets for tag releases');
  assert(buildContent.includes('actions/workflows/release-drafter.yml/runs?head_sha='), 'main branch build waits for the Release Drafter workflow instead of creating another draft release');
  assert(!buildContent.includes('uses: release-drafter/release-drafter@v6'), 'build workflow no longer invokes release-drafter directly');
  assert(packageJson.build?.win?.publish === null, 'package.json disables Windows electron-builder auto-publish');
  assert(packageJson.build?.nsis?.publish === null, 'package.json disables NSIS electron-builder auto-publish');
  assert(packageJson.build?.portable?.publish === null, 'package.json disables portable electron-builder auto-publish');

  assert(reusableWindowsContent.includes('Prepare Windows unpacked ZIP payload workspace'), 'reusable Windows workflow stages the unpacked Windows ZIP payload before compression');
  assert(reusableWindowsContent.includes('Create Windows ZIP artifact'), 'reusable Windows workflow creates Windows ZIP artifacts after staging');
  assert(reusableWindowsContent.includes('WINDOWS_PACKAGE_PUBLISHER'), 'reusable Windows workflow requires Windows package publisher alignment for signed store packages');
  assert(reusableWindowsContent.includes('azure/artifact-signing-action@v2'), 'reusable Windows workflow uses Artifact Signing v2');
  assert(reusableWindowsContent.includes('unsigned-artifacts/*'), 'reusable Windows workflow preserves unsigned artifacts alongside signed outputs');
  assert(reusableWindowsContent.includes('Upload Windows build bundle'), 'reusable Windows workflow uploads a Windows build bundle after packaging');
  assert(reusableWindowsContent.includes('name: MSIX'), 'reusable Windows workflow includes a dedicated MSIX matrix target');
  assert(Boolean(msixStoreStepContent), 'reusable Windows workflow uses a dedicated Store build step for MSIX artifacts');
  assert(msixStoreStepContent.includes('npm run build:win:store --'), 'reusable Windows workflow invokes the desktop Store build entrypoint for MSIX artifacts');
  assert(msixStoreStepContent.includes('npm run package:smoke-test'), 'reusable Windows workflow reruns packaged smoke validation after the MSIX Store build');
  assert(msixStoreStepContent.includes('HAGICODE_RUNTIME_CONSUMER: windows-store'), 'reusable Windows workflow passes the Store runtime consumer into packaged smoke validation');
  assert(msixStoreStepContent.includes('HAGICODE_RUNTIME_DEPENDENCY_MANAGEMENT_MODE: internal'), 'reusable Windows workflow keeps the default internal dependency-management mode during packaged smoke validation');
  assert(msixStoreStepContent.includes('pkg/store-build-metadata.json'), 'reusable Windows workflow preserves Store build metadata for MSIX artifacts');
  assert(Boolean(windowsZipVerifyStepContent), 'reusable Windows workflow includes a dedicated Windows ZIP archive verification step');
  assert(windowsZipVerifyStepContent.includes('node scripts/verify-release-archives.js'), 'reusable Windows workflow validates Windows ZIP archives before upload');
  assert(windowsZipVerifyStepContent.includes('HAGICODE_RUNTIME_CONSUMER: windows-store'), 'reusable Windows workflow passes the Store runtime consumer into Windows ZIP archive validation');
  assert(windowsZipVerifyStepContent.includes('HAGICODE_RUNTIME_DEPENDENCY_MANAGEMENT_MODE: internal'), 'reusable Windows workflow keeps the default internal dependency-management mode during Windows ZIP archive validation');

  assert(reusableUnixContent.includes('strategy:'), 'reusable Unix workflow uses a matrix strategy for non-Windows packaging');
  assert(reusableUnixContent.includes('macos-arm64'), 'reusable Unix workflow includes a dedicated macOS arm64 matrix target');
  assert(reusableUnixContent.includes('Resolve macOS signing mode'), 'reusable Unix workflow explicitly resolves macOS signing mode for production releases');
  assert(reusableUnixContent.includes('Build unsigned macOS artifacts'), 'reusable Unix workflow preserves unsigned macOS artifacts before signed rebuilds');
  assert(reusableUnixContent.includes('Build signed macOS artifacts'), 'reusable Unix workflow rebuilds signed macOS artifacts when signing material is present');
  assert(reusableUnixContent.includes('Summarize Linux artifacts'), 'reusable Unix workflow reports Linux ZIP diagnostics');
  assert(reusableUnixContent.includes('Upload Linux release bundle'), 'reusable Unix workflow uploads a Linux release bundle for later publication');
  assert(!reusableUnixContent.includes('pkg/*.deb'), 'reusable Unix workflow no longer references deb artifacts');
});

test('global hagiscript prerequisite is available', () => {
  assert(!globalHagiscriptVersion.includes('required') && !globalHagiscriptVersion.includes('missing'), `global hagiscript prerequisite resolved (${globalHagiscriptVersion})`);
});

test('staged bundled Node toolchain payload is complete', () => {
  if (!requireBundledNodePayload && !fs.existsSync(stagedToolchainRoot)) {
    const reasonSuffix = bundledNodePolicy.reason ? ` (${bundledNodePolicy.reason})` : '';
    log('  - Skipping: staged bundled Node toolchain not required for this smoke-test run', colors.yellow);
    logVerbose(`staged bundled Node toolchain skipped${reasonSuffix}`);
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

  if (!requirePackagedBundledNodePayload) {
    const reasonSuffix = bundledNodePolicy.reason ? ` (${bundledNodePolicy.reason})` : '';
    log('  - Skipping: packaged bundled Node toolchain not required for this smoke-test run', colors.yellow);
    logVerbose(`packaged bundled Node toolchain skipped${reasonSuffix}`);
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
