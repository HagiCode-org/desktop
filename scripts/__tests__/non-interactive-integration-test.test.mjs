import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function importHarnessWithProjectRoot(projectRoot, cacheBuster) {
  const previousCwd = process.cwd();
  const previousSkipFlag = process.env.HAGICODE_SKIP_NON_INTERACTIVE_MAIN;
  process.chdir(projectRoot);
  process.env.HAGICODE_SKIP_NON_INTERACTIVE_MAIN = '1';
  try {
    const moduleUrl = new URL(`../non-interactive-integration-test.mjs?${cacheBuster}`, import.meta.url);
    return await import(moduleUrl.href);
  } finally {
    if (previousSkipFlag === undefined) {
      delete process.env.HAGICODE_SKIP_NON_INTERACTIVE_MAIN;
    } else {
      process.env.HAGICODE_SKIP_NON_INTERACTIVE_MAIN = previousSkipFlag;
    }
    process.chdir(previousCwd);
  }
}

test('findZipArtifact discovers nested workflow artifacts under pkg/', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-non-interactive-test-'));
  try {
    const nestedArtifactRoot = path.join(projectRoot, 'pkg', 'pkg');
    await fs.mkdir(nestedArtifactRoot, { recursive: true });
    const nestedZip = path.join(nestedArtifactRoot, 'Hagicode Desktop 0.1.69-unpacked.zip');
    await fs.writeFile(nestedZip, 'zip placeholder', 'utf8');

    const { findZipArtifact } = await importHarnessWithProjectRoot(projectRoot, `nested-zip=${Date.now()}`);
    assert.equal(findZipArtifact(), nestedZip);
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

test('findTarGzArtifact discovers nested workflow artifacts under pkg/', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-non-interactive-test-'));
  try {
    const nestedArtifactRoot = path.join(projectRoot, 'pkg', 'pkg');
    await fs.mkdir(nestedArtifactRoot, { recursive: true });
    const nestedTarball = path.join(nestedArtifactRoot, 'Hagicode-Desktop-0.1.69-linux-x64.tar.gz');
    await fs.writeFile(nestedTarball, 'tar placeholder', 'utf8');

    const { findTarGzArtifact } = await importHarnessWithProjectRoot(projectRoot, `nested-tgz=${Date.now()}`);
    assert.equal(findTarGzArtifact(), nestedTarball);
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});
