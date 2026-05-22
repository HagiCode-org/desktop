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
const manifest = manifestStore.desktopExtensions.codeServerRuntime;
const targetPlatforms = ['linux-x64', 'osx-x64', 'osx-arm64', 'win-x64'];

assert.equal(detectCodeServerRuntimePlatform('linux', 'x64'), 'linux-x64');
assert.equal(detectCodeServerRuntimePlatform('darwin', 'arm64'), 'osx-arm64');
assert.equal(detectCodeServerRuntimePlatform('darwin', 'x64'), 'osx-x64');
assert.equal(detectCodeServerRuntimePlatform('win32', 'x64'), 'win-x64');
assert.throws(() => detectCodeServerRuntimePlatform('freebsd', 'x64'), /Unsupported vendored code-server platform/);

for (const platform of targetPlatforms) {
  assert.equal(resolveRequestedCodeServerRuntimeVersion(platform, manifest), '2026.0522.0073');
  assert.deepEqual(
    resolveConfiguredCodeServerReleaseUrls(platform, manifest),
    ['https://github.com/HagiCode-org/vendered/releases/tag/v2026.0522.0073'],
  );
  assert.ok(resolveCodeServerRuntimeTarget(platform, manifest));
}

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

assert.match(prepareScript, /updateDesktopRuntimeComponents\(\['code-server'\](?:,\s*\{[\s\S]*?\})?\)/, 'prepare script delegates top-level staging to hagiscript update');
assert.match(prepareScript, /resolveRequestedCodeServerRuntimeVersion/, 'prepare script resolves the pinned code-server runtime version');
assert.match(prepareScript, /resolveConfiguredCodeServerReleaseUrls/, 'prepare script resolves per-platform release URLs');
assert.match(optionalPrepareScript, /resolveRequestedCodeServerRuntimeVersion/, 'optional prepare script reuses the pinned runtime version contract');
assert.match(optionalPrepareScript, /resolveConfiguredCodeServerReleaseUrls/, 'optional prepare script checks per-platform release URLs');

console.log('code-server-runtime-config tests passed');
