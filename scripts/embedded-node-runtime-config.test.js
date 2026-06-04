#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import {
  detectNodeRuntimePlatform,
  getGovernedNodeRuntimeMajor,
  getNodeExecutableRelativePath,
  getNpmExecutableRelativePath,
  getNpmExecutableRelativePathCandidates,
  nodeVersionMatchesGovernedMajor,
  resolvePinnedNodeRuntimeTarget,
} from './embedded-node-runtime-config.js';

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function assertCandidateContract(platform, expected) {
  assert.equal(normalize(getNodeExecutableRelativePath(platform)), expected.node);
  assert.equal(normalize(getNpmExecutableRelativePath(platform)), expected.npmCompatibility);
  assert.deepEqual(getNpmExecutableRelativePathCandidates(platform).map(normalize), expected.npmCandidates);
}

assertCandidateContract('linux-x64', {
  node: 'bin/node',
  npmCompatibility: 'bin/npm',
  npmCandidates: [
    'bin/npm',
    'lib/node_modules/npm/bin/npm-cli.js',
    'lib/node_modules/npm/bin/npm',
  ],
});

assertCandidateContract('osx-arm64', {
  node: 'bin/node',
  npmCompatibility: 'bin/npm',
  npmCandidates: [
    'bin/npm',
    'lib/node_modules/npm/bin/npm-cli.js',
    'lib/node_modules/npm/bin/npm',
  ],
});

assertCandidateContract('win-x64', {
  node: 'node.exe',
  npmCompatibility: 'npm.cmd',
  npmCandidates: [
    'npm.cmd',
    'node_modules/npm/bin/npm-cli.js',
    'npm',
  ],
});

assert.equal(detectNodeRuntimePlatform('win32', 'x64'), 'win-x64');
assert.equal(detectNodeRuntimePlatform('win32', 'arm64'), 'win-x64');
assert.equal(detectNodeRuntimePlatform('linux', 'x64'), 'linux-x64');
assert.equal(detectNodeRuntimePlatform('linux', 'arm64'), 'linux-arm64');
assert.equal(detectNodeRuntimePlatform('darwin', 'x64'), 'osx-x64');
assert.equal(detectNodeRuntimePlatform('darwin', 'arm64'), 'osx-arm64');
assert.throws(() => detectNodeRuntimePlatform('freebsd', 'x64'), /Unsupported Node runtime platform/);

const manifestStore = load(fs.readFileSync(new URL('../resources/manifest.yml', import.meta.url), 'utf8'));
const manifest = manifestStore.desktopExtensions.embeddedNodeRuntime;
assert.equal(getGovernedNodeRuntimeMajor(manifest), '22');
assert.equal(nodeVersionMatchesGovernedMajor('22.22.2', manifest), true);
assert.equal(nodeVersionMatchesGovernedMajor('v22.0.0', manifest), true);
assert.equal(nodeVersionMatchesGovernedMajor('23.0.0', manifest), false);
for (const platform of ['win-x64', 'linux-x64', 'osx-x64', 'osx-arm64']) {
  const target = resolvePinnedNodeRuntimeTarget(platform, manifest);
  assert.equal(target.rid, platform);
  assert.match(target.archiveName, new RegExp(`node-v${manifest.releaseVersion}`));
  assert.match(target.downloadUrl, /^https:\/\/nodejs\.org\//);
}
assert.equal('linux-arm64' in manifest.platforms, false, 'linux-arm64 is unsupported until a pinned archive is added');
assert.throws(() => resolvePinnedNodeRuntimeTarget('linux-arm64', manifest), /not configured for linux-arm64/);

const prepareScript = fs.readFileSync(new URL('./prepare-bundled-toolchain.js', import.meta.url), 'utf8');
const optionalPrepareScript = fs.readFileSync(new URL('./prepare-bundled-toolchain-if-supported.js', import.meta.url), 'utf8');
assert.match(prepareScript, /updateDesktopRuntimeComponents\(\['node'\](?:,\s*\{[\s\S]*?\})?\)/, 'prepare script delegates top-level staging to hagiscript update');
assert.match(prepareScript, /installNodeRuntime\(/, 'prepare script uses hagiscript Node installer for the runtime payload');
assert.match(prepareScript, /materializeNpmCompatibilityPath/, 'prepare script materializes the Desktop npm compatibility path');
assert.match(prepareScript, /pathExistsOrIsSymlink/, 'prepare script detects dangling compatibility-path symlinks');
assert.match(prepareScript, /fs\.rmSync\(shimPath, \{ force: true \}\)/, 'prepare script removes stale npm compatibility entries before writing the shim');
assert.match(prepareScript, /buildDeferredPackageMetadata/, 'prepare script writes deferred package metadata');
assert.equal(prepareScript.includes('installCorePackages('), false, 'prepare script no longer auto-installs bundled CLI packages');
assert.equal(prepareScript.includes('stagePackageCommands('), false, 'prepare script no longer writes bundled CLI shims during staging');
assert.match(optionalPrepareScript, /canReuseExistingToolchain/, 'optional prepare script can reuse an existing valid staged toolchain');
assert.match(optionalPrepareScript, /validateToolchainPayload/, 'optional prepare script validates the existing staged toolchain before reuse');
assert.match(optionalPrepareScript, /Reusing existing staged Node toolchain/, 'optional prepare script logs when it preserves the existing toolchain');
assert.match(optionalPrepareScript, /HAGICODE_FORCE_BUNDLED_TOOLCHAIN_RESTAGE/, 'optional prepare script supports forcing a restage');

assert.equal(fs.existsSync(new URL('./install-dev-node-runtime.js', import.meta.url)), false, 'source mode uses the bundled portable toolchain instead of a separate dev installer');
assert.equal(fs.existsSync(new URL('./dev-node-runtime-config.js', import.meta.url)), false, 'source mode no longer has a .runtime/node-dev config');

console.log('embedded-node-runtime-config tests passed');
