#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from 'js-yaml';
import {
  detectCodeServerRuntimePlatform,
  resolveConfiguredCodeServerReleaseUrls,
  resolveRequestedCodeServerRuntimeVersion,
  resolveCodeServerRuntimeTarget,
} from './code-server-runtime-contract.js';

const manifestStore = load(fs.readFileSync(new URL('../resources/manifest.yml', import.meta.url), 'utf8'));
const vendoredRuntime = manifestStore.vendoredRuntime;
const manifest = manifestStore.desktopExtensions.codeServerRuntime;
const targetPlatforms = ['linux-x64', 'osx-x64', 'osx-arm64', 'win-x64'];

assert.equal(detectCodeServerRuntimePlatform('linux', 'x64'), 'linux-x64');
assert.equal(detectCodeServerRuntimePlatform('darwin', 'arm64'), 'osx-arm64');
assert.equal(detectCodeServerRuntimePlatform('darwin', 'x64'), 'osx-x64');
assert.equal(detectCodeServerRuntimePlatform('win32', 'x64'), 'win-x64');
assert.throws(() => detectCodeServerRuntimePlatform('freebsd', 'x64'), /Unsupported vendored code-server platform/);

for (const platform of targetPlatforms) {
  assert.equal(resolveRequestedCodeServerRuntimeVersion(platform, manifest), vendoredRuntime.releaseVersion);
  assert.deepEqual(resolveConfiguredCodeServerReleaseUrls(platform, manifest), [vendoredRuntime.releaseTagUrl]);
  assert.ok(resolveCodeServerRuntimeTarget(platform, manifest));
  assert.equal(manifest.platforms[platform].archiveExtension, '.7z');
}

assert.equal(manifest.packagedLayout.archiveRelativePath, 'archives/code-server.7z');
assert.equal(manifest.packagedLayout.installMode, 'archive-7z-only');

const previousVersionOverride = process.env.HAGICODE_CODE_SERVER_RUNTIME_VERSION;
const previousReleaseOverride = process.env.HAGICODE_CODE_SERVER_RUNTIME_RELEASE_URL;

process.env.HAGICODE_CODE_SERVER_RUNTIME_VERSION = 'manual-override';
process.env.HAGICODE_CODE_SERVER_RUNTIME_RELEASE_URL = 'https://example.test/custom-release';

assert.equal(resolveRequestedCodeServerRuntimeVersion('linux-x64', manifest), 'manual-override');
assert.deepEqual(resolveConfiguredCodeServerReleaseUrls('linux-x64', manifest), ['https://example.test/custom-release']);

if (previousVersionOverride === undefined) {
  delete process.env.HAGICODE_CODE_SERVER_RUNTIME_VERSION;
} else {
  process.env.HAGICODE_CODE_SERVER_RUNTIME_VERSION = previousVersionOverride;
}

if (previousReleaseOverride === undefined) {
  delete process.env.HAGICODE_CODE_SERVER_RUNTIME_RELEASE_URL;
} else {
  process.env.HAGICODE_CODE_SERVER_RUNTIME_RELEASE_URL = previousReleaseOverride;
}

const prepareScript = fs.readFileSync(new URL('./prepare-code-server-runtime.js', import.meta.url), 'utf8');
const optionalPrepareScript = fs.readFileSync(new URL('./prepare-code-server-runtime-if-supported.js', import.meta.url), 'utf8');

assert.match(prepareScript, /updateDesktopRuntimeComponents\(\['code-server'\]/, 'prepare script delegates staging to hagiscript update');
assert.match(prepareScript, /validateCodeServerRuntimePayload/, 'prepare script validates the packaged archive-only payload');
assert.match(prepareScript, /archive payload/, 'prepare script reports archive payload staging');
assert.doesNotMatch(prepareScript, /extractArchive\(/, 'prepare script no longer extracts the vendored code-server runtime into the packaged tree');
assert.doesNotMatch(prepareScript, /cp\(/, 'prepare script no longer copies extracted runtime files into packaged current roots');
assert.match(optionalPrepareScript, /resolveRequestedCodeServerRuntimeVersion/, 'optional prepare script reuses the pinned runtime version contract');
assert.match(optionalPrepareScript, /resolveConfiguredCodeServerReleaseUrls/, 'optional prepare script checks per-platform release URLs');

console.log('code-server-runtime-config tests passed');
