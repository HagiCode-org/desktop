#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  detectOmniRouteRuntimePlatform,
  resolveConfiguredOmniRouteReleaseUrls,
  resolveOmniRouteRuntimeTarget,
  resolveRequestedOmniRouteRuntimeVersion,
} from './omniroute-runtime-contract.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../resources/omniroute/runtime-manifest.json', import.meta.url), 'utf8'));
const targetPlatforms = ['linux-x64', 'osx-arm64', 'win-x64'];

assert.equal(detectOmniRouteRuntimePlatform('linux', 'x64'), 'linux-x64');
assert.equal(detectOmniRouteRuntimePlatform('darwin', 'arm64'), 'osx-arm64');
assert.equal(detectOmniRouteRuntimePlatform('darwin', 'x64'), 'osx-x64');
assert.equal(detectOmniRouteRuntimePlatform('win32', 'x64'), 'win-x64');
assert.throws(() => detectOmniRouteRuntimePlatform('freebsd', 'x64'), /Unsupported vendored OmniRoute platform/);

for (const platform of targetPlatforms) {
  assert.equal(resolveRequestedOmniRouteRuntimeVersion(platform, manifest), '2026.0511.0042');
  assert.deepEqual(
    resolveConfiguredOmniRouteReleaseUrls(platform, manifest),
    ['https://github.com/HagiCode-org/vendered/releases/tag/v2026.0511.0042'],
  );
  assert.ok(resolveOmniRouteRuntimeTarget(platform, manifest));
}

assert.deepEqual(resolveOmniRouteRuntimeTarget('linux-x64', manifest), {
  platform: 'linux',
  arch: 'amd64',
  archiveExtension: '.tar.gz',
});

const previousVersionOverride = process.env.HAGICODE_OMNIROUTE_RUNTIME_VERSION;
const previousReleaseOverride = process.env.HAGICODE_OMNIROUTE_RUNTIME_RELEASE_URL;

process.env.HAGICODE_OMNIROUTE_RUNTIME_VERSION = 'manual-override';
process.env.HAGICODE_OMNIROUTE_RUNTIME_RELEASE_URL = 'https://example.test/custom-release';

assert.equal(resolveRequestedOmniRouteRuntimeVersion('linux-x64', manifest), 'manual-override');
assert.deepEqual(resolveConfiguredOmniRouteReleaseUrls('linux-x64', manifest), ['https://example.test/custom-release']);

if (previousVersionOverride === undefined) {
  delete process.env.HAGICODE_OMNIROUTE_RUNTIME_VERSION;
} else {
  process.env.HAGICODE_OMNIROUTE_RUNTIME_VERSION = previousVersionOverride;
}

if (previousReleaseOverride === undefined) {
  delete process.env.HAGICODE_OMNIROUTE_RUNTIME_RELEASE_URL;
} else {
  process.env.HAGICODE_OMNIROUTE_RUNTIME_RELEASE_URL = previousReleaseOverride;
}

const prepareScript = fs.readFileSync(new URL('./prepare-vendored-omniroute-runtime.js', import.meta.url), 'utf8');
const optionalPrepareScript = fs.readFileSync(new URL('./prepare-vendored-omniroute-runtime-if-supported.js', import.meta.url), 'utf8');

assert.match(prepareScript, /normalizeResolvedRuntimeMetadata\(metadata\)/, 'prepare script normalizes cached OmniRoute metadata before staging');
assert.match(prepareScript, /bundledNodeRuntime:\s*true/, 'prepare script enforces bundledNodeRuntime=true');
assert.match(prepareScript, /rebuildBetterSqlite3ForDesktopNode\(runtimeRoot\)/, 'prepare script rebuilds better-sqlite3 against the Desktop bundled Node toolchain');
assert.match(prepareScript, /resolveDesktopBundledNodeRuntimeRoot\(\)/, 'prepare script resolves the shared Desktop bundled Node runtime instead of the OmniRoute component root');
assert.match(prepareScript, /resolveDesktopBundledNpmCommand\(toolchainRoot, nodeExecutablePath\)/, 'prepare script resolves the bundled npm entrypoint using the shared toolchain contract');
assert.match(prepareScript, /!fs\.existsSync\(path\.join\(betterSqlite3Root, 'binding\.gyp'\)\)/, 'prepare script detects stripped better-sqlite3 payloads before attempting rebuild');
assert.match(prepareScript, /restoreBetterSqlite3Package\(npmCommand, betterSqlite3Root, betterSqlite3Version, rebuildEnvironment\)/, 'prepare script restores stripped better-sqlite3 payloads before rebuild');
assert.match(prepareScript, /'pack', `better-sqlite3@\\$\\{betterSqlite3Version\\}`/, 'prepare script fetches the exact better-sqlite3 tarball without reinstalling the whole OmniRoute app tree');
assert.match(prepareScript, /'tar', \['-xzf', archiveName, '-C', 'unpacked'\]/, 'prepare script expands the packed better-sqlite3 tarball into a relative restore directory');
assert.match(prepareScript, /cp\(path\.join\(unpackRoot, 'package'\), betterSqlite3Root, \{ recursive: true \}\)/, 'prepare script copies the unpacked package into the vendored runtime after extraction');
assert.match(prepareScript, /ensureRootNodeModulesPayload\(runtimeRoot\)/, 'prepare script restores the OmniRoute root runtime-only modules before runtime validation');
assert.match(prepareScript, /const runtimePackageNames = \['wreq-js'\]/, 'prepare script restores the root-level wreq-js dependency required by OmniRoute response proxy scripts');
assert.match(prepareScript, /await cp\(sourcePath, targetPath, \{ recursive: true \}\)/, 'prepare script copies required runtime-only root packages instead of introducing bundle symlinks');
assert.match(prepareScript, /\[\.\.\.npmCommand\.args, 'rebuild', 'better-sqlite3'\]/, 'prepare script rebuilds better-sqlite3 with bundled npm');
assert.match(prepareScript, /'\.\.\/\.\.\/\.\.\/node\/runtime\//, 'OmniRoute wrapper points at the canonical Desktop bundled Node runtime');
assert.match(optionalPrepareScript, /resolveRequestedOmniRouteRuntimeVersion/, 'optional prepare script reuses the pinned runtime version contract');
assert.match(optionalPrepareScript, /resolveConfiguredOmniRouteReleaseUrls/, 'optional prepare script checks per-platform release URLs');

console.log('omniroute-runtime-config tests passed');
