#!/usr/bin/env node

/**
 * Smoke Test Suite
 *
 * Basic verification tests to ensure the obfuscated application
 * functions correctly. This script performs automated checks on
 * the built application.
 *
 * Usage:
 *   node scripts/smoke-test.js
 *   node scripts/smoke-test.js --verbose
 */

import fs from 'fs';
import path from 'path';

// Parse arguments
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose');
const requireRuntimePayload = args.includes('--require-runtime') || process.env.HAGICODE_SMOKE_TEST_REQUIRE_RUNTIME === '1';
const runtimePlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectPlatform();
const dotnetExecutableName = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
const stagedRuntimeRoot = path.join(process.cwd(), 'build', 'embedded-runtime', 'current', 'dotnet', runtimePlatform);

/**
 * ANSI color codes
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

/**
 * Test results tracking
 */
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
};

function detectPlatform() {
  if (process.platform === 'win32') return 'win-x64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'osx-arm64' : 'osx-x64';
  if (process.platform === 'linux') return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  throw new Error(`Unsupported smoke-test platform: ${process.platform}/${process.arch}`);
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

function validateRuntimePayload(runtimeRoot) {
  const missing = [];
  if (!fs.existsSync(path.join(runtimeRoot, dotnetExecutableName))) {
    missing.push(dotnetExecutableName);
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

/**
 * Log messages with optional colors
 */
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Log verbose messages
 */
function logVerbose(message) {
  if (isVerbose) {
    log(`  [VERBOSE] ${message}`, colors.gray);
  }
}

/**
 * Run a single test
 */
function test(name, fn) {
  results.tests.push({ name, fn });
}

/**
 * Assert a condition is true
 */
function assert(condition, message) {
  if (condition) {
    log(`  ✓ ${message}`, colors.green);
    results.passed++;
    return true;
  } else {
    log(`  ✗ ${message}`, colors.red);
    results.failed++;
    return false;
  }
}

/**
 * Test: Check if dist directory exists
 */
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

/**
 * Test: Check if main process files are built
 */
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

/**
 * Test: Check if renderer process files are built
 */
test('renderer process files exist', () => {
  const indexPath = path.join(process.cwd(), 'dist', 'renderer', 'index.html');
  const exists = fs.existsSync(indexPath);
  assert(exists, 'dist/renderer/index.html exists');

  if (exists) {
    const content = fs.readFileSync(indexPath, 'utf8');
    logVerbose(`index.html references scripts: ${content.includes('<script')}`);
  }
});

/**
 * Test: Check if preload script exists
 */
test('preload script exists', () => {
  const preloadPath = path.join(process.cwd(), 'dist', 'preload', 'index.mjs');
  const exists = fs.existsSync(preloadPath);
  assert(exists, 'dist/preload/index.mjs exists');

  if (exists) {
    const content = fs.readFileSync(preloadPath, 'utf8');
    logVerbose(`preload script includes contextBridge: ${content.includes('contextBridge')}`);
  }
});

/**
 * Test: Check if package.json is valid
 */
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

/**
 * Test: Check if main.js is non-empty
 */
test('main.js has content', () => {
  const mainJs = path.join(process.cwd(), 'dist', 'main', 'main.js');

  if (!fs.existsSync(mainJs)) {
    log('  ⊘ Skipping: main.js does not exist', colors.yellow);
    results.skipped++;
    return;
  }

  const stats = fs.statSync(mainJs);
  assert(stats.size > 1000, 'main.js has reasonable size (> 1KB)');
  logVerbose(`main.js size: ${stats.size} bytes`);
});

/**
 * Test: Check electron-builder configuration
 */
test('electron-builder configuration is valid', async () => {
  const yamlPath = path.join(process.cwd(), 'electron-builder.yml');
  const pkgPath = path.join(process.cwd(), 'package.json');

  let buildConfig = null;
  let configSource = '';

  // Try to load from electron-builder.yml first
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
  }
  // Fallback to package.json build config
  else if (fs.existsSync(pkgPath)) {
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
    assert(false, 'build configuration exists in ' + configSource);
    return;
  }

  const hasAsar = buildConfig?.asar === true;
  const hasFiles = Array.isArray(buildConfig?.files);
  const extraResources = Array.isArray(buildConfig?.extraResources) ? buildConfig.extraResources : [];
  const runtimeExtraResource = extraResources.find((entry) => entry.from === 'build/embedded-runtime/current/dotnet');
  const runtimeOutsideAsar = typeof runtimeExtraResource?.to === 'string' && !runtimeExtraResource.to.includes('app.asar');

  logVerbose(`config source: ${configSource}`);
  logVerbose(`asar enabled: ${hasAsar}`);
  logVerbose(`runtime extraResources entries: ${extraResources.length}`);

  assert(true, `build configuration exists (${configSource})`);
  assert(hasAsar, 'asar packaging is enabled');
  assert(hasFiles, 'files to include are specified');
  assert(Boolean(runtimeExtraResource), 'embedded runtime is shipped via extraResources');
  assert(runtimeOutsideAsar, 'embedded runtime is staged outside app.asar');
});

test('staged embedded runtime payload is complete', () => {
  if (!requireRuntimePayload && !fs.existsSync(stagedRuntimeRoot)) {
    log(`  Skipping: staged runtime not required for this smoke-test run`, colors.yellow);
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
      : `staged runtime payload is missing: ${missingComponents.join(', ')}`
  );
});

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();

  log('='.repeat(60), colors.blue);
  log('Smoke Test Suite', colors.blue);
  log('='.repeat(60), colors.blue);
  log('');

  // Run all tests
  for (const { name, fn } of results.tests) {
    log(`Running: ${name}`, colors.blue);
    try {
      await fn();
    } catch (error) {
      log(`  ✗ Test error: ${error.message}`, colors.red);
      results.failed++;
    }
    log('');
  }

  // Print summary
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

  // Exit with appropriate code
  if (results.failed > 0) {
    process.exit(1);
  }
}

// Run the tests
main().catch(error => {
  log(`Fatal error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
