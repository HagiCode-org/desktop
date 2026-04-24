#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  getNodeExecutableRelativePath,
  getNpmExecutableRelativePath,
  getNpmExecutableRelativePathCandidates,
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
  node: 'node/bin/node',
  npmCompatibility: 'node/bin/npm',
  npmCandidates: [
    'node/bin/npm',
    'node/lib/node_modules/npm/bin/npm-cli.js',
    'node/lib/node_modules/npm/bin/npm',
  ],
});

assertCandidateContract('osx-arm64', {
  node: 'node/bin/node',
  npmCompatibility: 'node/bin/npm',
  npmCandidates: [
    'node/bin/npm',
    'node/lib/node_modules/npm/bin/npm-cli.js',
    'node/lib/node_modules/npm/bin/npm',
  ],
});

assertCandidateContract('win-x64', {
  node: 'node/node.exe',
  npmCompatibility: 'node/npm.cmd',
  npmCandidates: [
    'node/npm.cmd',
    'node/npm',
  ],
});

const prepareScript = fs.readFileSync(new URL('./prepare-bundled-toolchain.js', import.meta.url), 'utf8');
assert.match(prepareScript, /materializeNpmCompatibilityPath/, 'prepare script materializes the Desktop npm compatibility path');
assert.match(prepareScript, /pathExistsOrIsSymlink/, 'prepare script detects dangling compatibility-path symlinks');
assert.match(prepareScript, /fs\.rmSync\(shimPath, \{ force: true \}\)/, 'prepare script removes stale npm compatibility entries before writing the shim');
assert.match(prepareScript, /printStagingDiagnostics/, 'prepare script emits staging diagnostics on failure');
assert.match(prepareScript, /attempted command candidates/, 'diagnostics include attempted command candidates');
assert.match(prepareScript, /shallow snapshot/, 'diagnostics include a shallow staged directory snapshot');

console.log('embedded-node-runtime-config tests passed');
