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
  assert.equal(resolveRequestedOmniRouteRuntimeVersion(platform, manifest), '2026.0506.0026');
  assert.deepEqual(
    resolveConfiguredOmniRouteReleaseUrls(platform, manifest),
    ['https://github.com/HagiCode-org/vendered/releases/tag/v2026.0506.0026'],
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

assert.match(prepareScript, /installDesktopRuntimeComponents\(\['omniroute'\]\)/, 'prepare script delegates top-level staging to hagiscript');
assert.match(prepareScript, /normalizeResolvedRuntimeMetadata\(metadata\)/, 'prepare script normalizes cached OmniRoute metadata before staging');
assert.match(prepareScript, /bundledNodeRuntime:\s*true/, 'prepare script enforces bundledNodeRuntime=true');
assert.match(optionalPrepareScript, /resolveRequestedOmniRouteRuntimeVersion/, 'optional prepare script reuses the pinned runtime version contract');
assert.match(optionalPrepareScript, /resolveConfiguredOmniRouteReleaseUrls/, 'optional prepare script checks per-platform release URLs');

console.log('omniroute-runtime-config tests passed');
