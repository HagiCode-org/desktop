#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from 'js-yaml';
import {
  detectOmniRouteRuntimePlatform,
  resolveConfiguredOmniRouteReleaseUrls,
  resolveOmniRouteRuntimeTarget,
  resolveRequestedOmniRouteRuntimeVersion,
} from './omniroute-runtime-contract.js';

const manifestStore = load(fs.readFileSync(new URL('../resources/manifest.yml', import.meta.url), 'utf8'));
const vendoredRuntime = manifestStore.vendoredRuntime;
const manifest = manifestStore.desktopExtensions.omniRouteRuntime;
const targetPlatforms = ['linux-x64', 'osx-x64', 'osx-arm64', 'win-x64'];

assert.equal(detectOmniRouteRuntimePlatform('linux', 'x64'), 'linux-x64');
assert.equal(detectOmniRouteRuntimePlatform('darwin', 'arm64'), 'osx-arm64');
assert.equal(detectOmniRouteRuntimePlatform('darwin', 'x64'), 'osx-x64');
assert.equal(detectOmniRouteRuntimePlatform('win32', 'x64'), 'win-x64');
assert.throws(() => detectOmniRouteRuntimePlatform('freebsd', 'x64'), /Unsupported vendored OmniRoute platform/);

for (const platform of targetPlatforms) {
  assert.equal(resolveRequestedOmniRouteRuntimeVersion(platform, manifest), vendoredRuntime.releaseVersion);
  assert.deepEqual(resolveConfiguredOmniRouteReleaseUrls(platform, manifest), [vendoredRuntime.releaseTagUrl]);
  assert.ok(resolveOmniRouteRuntimeTarget(platform, manifest));
  assert.equal(manifest.platforms[platform].archiveExtension, '.7z');
}

assert.deepEqual(resolveOmniRouteRuntimeTarget('linux-x64', manifest), {
  platform: 'linux',
  arch: 'amd64',
  archiveExtension: '.7z',
});
assert.equal(manifest.packagedLayout.archiveRelativePath, 'archives/omniroute.7z');
assert.equal(manifest.packagedLayout.installMode, 'archive-7z-only');

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
const runtimeContractScript = fs.readFileSync(new URL('./omniroute-runtime-contract.js', import.meta.url), 'utf8');

assert.match(prepareScript, /updateDesktopRuntimeComponents\(\['omniroute'\]/, 'prepare script delegates staging to hagiscript update');
assert.match(prepareScript, /validateOmniRouteRuntimePayload/, 'prepare script validates the packaged archive-only payload');
assert.match(prepareScript, /archive payload/, 'prepare script reports archive payload staging');
assert.doesNotMatch(prepareScript, /extractArchive\(/, 'prepare script no longer extracts vendored OmniRoute into the packaged tree');
assert.doesNotMatch(prepareScript, /rebuildBetterSqlite3ForDesktopNode\(/, 'prepare script no longer mutates packaged OmniRoute runtime contents');
assert.match(optionalPrepareScript, /resolveRequestedOmniRouteRuntimeVersion/, 'optional prepare script reuses the pinned runtime version contract');
assert.match(optionalPrepareScript, /resolveConfiguredOmniRouteReleaseUrls/, 'optional prepare script checks per-platform release URLs');
assert.match(runtimeContractScript, /archiveRelativePath/, 'runtime contract resolves the packaged 7z archive path');
assert.match(runtimeContractScript, /marker bundledInstallMode expected/, 'runtime contract validates the archive-only marker mode');

console.log('omniroute-runtime-config tests passed');
