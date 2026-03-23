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

const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose');
const requireRuntimePayload = args.includes('--require-runtime') || process.env.HAGICODE_SMOKE_TEST_REQUIRE_RUNTIME === '1';
const runtimePlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform();
const runtimeConfig = readPinnedRuntimeConfig();
const runtimeTarget = resolvePinnedRuntimeTarget(runtimePlatform, runtimeConfig);
const dotnetExecutableName = getDotnetExecutableName(runtimePlatform);
const stagedRuntimeRoot = path.join(process.cwd(), 'build', 'embedded-runtime', 'current', 'dotnet', runtimePlatform);
const packagedRuntimeCandidates = resolvePackagedRuntimeRoots(runtimePlatform);
const packagedRuntimeRoot = resolveExistingPackagedRuntimeRoot(packagedRuntimeCandidates);
const requiresExecutableDotnetHost = !runtimePlatform.startsWith('win-');

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
    return [path.join(process.cwd(), 'pkg', 'win-unpacked', 'resources', 'dotnet', platform)];
  }
  if (platform.startsWith('linux-')) {
    return [path.join(process.cwd(), 'pkg', 'linux-unpacked', 'resources', 'dotnet', platform)];
  }
  if (platform.startsWith('osx-')) {
    return [
      path.join(process.cwd(), 'pkg', 'mac', 'Hagicode Desktop.app', 'Contents', 'Resources', 'dotnet', platform),
      path.join(process.cwd(), 'pkg', 'mac-x64', 'Hagicode Desktop.app', 'Contents', 'Resources', 'dotnet', platform),
      path.join(process.cwd(), 'pkg', 'mac-arm64', 'Hagicode Desktop.app', 'Contents', 'Resources', 'dotnet', platform),
      path.join(process.cwd(), 'pkg', 'mac-universal', 'Hagicode Desktop.app', 'Contents', 'Resources', 'dotnet', platform),
    ];
  }
  return [];
}

function resolveExistingPackagedRuntimeRoot(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0] || null;
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
    const mainJs = path.join(distPath, 'main', 'main.js');
    const rendererPath = path.join(distPath, 'renderer');
    logVerbose(`dist/main/main.js exists: ${fs.existsSync(mainJs)}`);
    logVerbose(`dist/renderer exists: ${fs.existsSync(rendererPath)}`);
  }
});

test('main process files exist', () => {
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
    assert(pkg.main === 'dist/main/main.js', 'package.json main points to dist/main/main.js');
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
  const runtimeExtraResource = extraResources.find((entry) => entry.from === 'build/embedded-runtime/current/dotnet');
  const runtimeOutsideAsar = typeof runtimeExtraResource?.to === 'string' && !runtimeExtraResource.to.includes('app.asar');
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
  assert(Boolean(runtimeExtraResource), 'embedded runtime is shipped via extraResources');
  assert(runtimeOutsideAsar, 'embedded runtime is staged outside app.asar');
  assert(linuxTargets.includes('AppImage'), 'linux packaging keeps AppImage output');
  assert(linuxTargets.includes('deb'), 'linux packaging keeps deb output');
  assert(linuxTargets.includes('tar.gz'), 'linux packaging keeps tar.gz output');
  assert(linuxTargets.includes('zip'), 'linux packaging adds ZIP output');
});

test('desktop build workflow includes ZIP publication steps', () => {
  const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'build.yml');
  const exists = fs.existsSync(workflowPath);

  if (!assert(exists, '.github/workflows/build.yml exists')) {
    return;
  }

  const content = fs.readFileSync(workflowPath, 'utf8');

  assert(content.includes('Prepare Windows ZIP payload workspace'), 'workflow stages Windows ZIP payload before compression');
  assert(content.includes('Create Windows ZIP artifact'), 'workflow creates Windows ZIP artifacts after staging');
  assert(content.includes('Upload Windows ZIP'), 'workflow uploads Windows ZIP CI artifacts');
  assert(content.includes('Upload Windows ZIP to Release'), 'workflow uploads Windows ZIP release assets');
  assert(content.includes('Summarize Linux ZIP artifacts'), 'workflow reports Linux ZIP diagnostics');
  assert(content.includes('Upload Linux ZIP'), 'workflow uploads Linux ZIP CI artifacts');
  assert(content.includes('Upload Linux ZIP to Release'), 'workflow uploads Linux ZIP release assets');
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

  if (!requireRuntimePayload && !fs.existsSync(packagedRuntimeRoot)) {
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
