import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  generateBuildMetadata,
  renderBuildMetadataModule,
  resolveBuildBranch,
  resolveBuildCommit,
} from '../generate-build-metadata.js';

const FULL_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

function fakeGit(answers) {
  return (args) => {
    const key = args.join(' ');
    const answer = answers[key];
    if (answer instanceof Error) {
      throw answer;
    }
    if (answer === undefined) {
      throw new Error(`unexpected git call: ${key}`);
    }
    return answer;
  };
}

function silentWarn() {
  const warnings = [];
  return { warnings, warn: (message) => warnings.push(message) };
}

describe('resolveBuildBranch', () => {
  it('uses the explicit branch over the checkout branch', () => {
    const branch = resolveBuildBranch({
      env: { HAGICODE_DESKTOP_BUILD_BRANCH: 'release/2026-10' },
      runGit: fakeGit({ 'rev-parse --abbrev-ref HEAD': 'main' }),
    });
    assert.equal(branch, 'release/2026-10');
  });

  it('ignores a blank explicit branch and resolves from Git', () => {
    const branch = resolveBuildBranch({
      env: { HAGICODE_DESKTOP_BUILD_BRANCH: '   ' },
      runGit: fakeGit({ 'rev-parse --abbrev-ref HEAD': 'feature/footer' }),
    });
    assert.equal(branch, 'feature/footer');
  });

  it('uses the named branch Git reports for the checkout', () => {
    const branch = resolveBuildBranch({
      env: {},
      runGit: fakeGit({ 'rev-parse --abbrev-ref HEAD': 'main' }),
    });
    assert.equal(branch, 'main');
  });

  it('never uses the detached-HEAD marker as a branch name', () => {
    const branch = resolveBuildBranch({
      env: {},
      runGit: fakeGit({ 'rev-parse --abbrev-ref HEAD': 'HEAD' }),
    });
    assert.equal(branch, 'unknown');
  });

  it('falls back to unknown and warns when Git fails', () => {
    const { warnings, warn } = silentWarn();
    const branch = resolveBuildBranch({
      env: {},
      runGit: fakeGit({ 'rev-parse --abbrev-ref HEAD': new Error('not a git repository') }),
      warn,
    });
    assert.equal(branch, 'unknown');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /not a git repository/);
  });
});

describe('resolveBuildCommit', () => {
  it('uses a valid explicit commit over the Git HEAD and lowercases it', () => {
    const commit = resolveBuildCommit({
      env: { HAGICODE_DESKTOP_BUILD_COMMIT: 'ABCDEF1' },
      runGit: fakeGit({ 'rev-parse HEAD': FULL_HASH }),
    });
    assert.equal(commit, 'abcdef1');
  });

  it('ignores a malformed explicit commit and resolves from Git', () => {
    const commit = resolveBuildCommit({
      env: { HAGICODE_DESKTOP_BUILD_COMMIT: 'not-a-hash' },
      runGit: fakeGit({ 'rev-parse HEAD': FULL_HASH }),
    });
    assert.equal(commit, FULL_HASH);
  });

  it('ignores an explicit commit that is too short', () => {
    const commit = resolveBuildCommit({
      env: { HAGICODE_DESKTOP_BUILD_COMMIT: 'abc12' },
      runGit: fakeGit({ 'rev-parse HEAD': FULL_HASH }),
    });
    assert.equal(commit, FULL_HASH);
  });

  it('ignores a blank explicit commit and resolves from Git', () => {
    const commit = resolveBuildCommit({
      env: { HAGICODE_DESKTOP_BUILD_COMMIT: '' },
      runGit: fakeGit({ 'rev-parse HEAD': FULL_HASH }),
    });
    assert.equal(commit, FULL_HASH);
  });

  it('falls back to unknown and warns when Git fails', () => {
    const { warnings, warn } = silentWarn();
    const commit = resolveBuildCommit({
      env: {},
      runGit: fakeGit({ 'rev-parse HEAD': new Error('git not found') }),
      warn,
    });
    assert.equal(commit, 'unknown');
    assert.equal(warnings.length, 1);
  });
});

describe('generateBuildMetadata', () => {
  it('resolves each field independently and writes the generated module', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-build-metadata-'));
    try {
      const outputPath = path.join(tempDir, 'nested', 'build-metadata.ts');
      const { warn } = silentWarn();
      const result = generateBuildMetadata({
        env: { HAGICODE_DESKTOP_BUILD_BRANCH: 'release/"quoted"' },
        runGit: fakeGit({
          'rev-parse --abbrev-ref HEAD': 'main',
          'rev-parse HEAD': FULL_HASH,
        }),
        warn,
        outputPath,
      });

      assert.deepEqual(result, { branch: 'release/"quoted"', commit: FULL_HASH, outputPath });

      const content = await fs.readFile(outputPath, 'utf8');
      assert.equal(content, renderBuildMetadataModule({ branch: 'release/"quoted"', commit: FULL_HASH }));
      assert.match(content, /export const BUILD_BRANCH = "release\/\\"quoted\\"";/);
      assert.match(content, new RegExp(`export const BUILD_COMMIT = "${FULL_HASH}";`));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('writes unknown for both fields and does not throw when Git is unavailable', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-build-metadata-'));
    try {
      const outputPath = path.join(tempDir, 'build-metadata.ts');
      const { warnings, warn } = silentWarn();
      const gitError = new Error('spawn git ENOENT');
      const result = generateBuildMetadata({
        env: {},
        runGit: fakeGit({
          'rev-parse --abbrev-ref HEAD': gitError,
          'rev-parse HEAD': gitError,
        }),
        warn,
        outputPath,
      });

      assert.deepEqual(result, { branch: 'unknown', commit: 'unknown', outputPath });
      assert.equal(warnings.length, 2);
      const content = await fs.readFile(outputPath, 'utf8');
      assert.match(content, /export const BUILD_BRANCH = "unknown";/);
      assert.match(content, /export const BUILD_COMMIT = "unknown";/);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
