import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('smoke-test macOS resource roots include flattened app bundles', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-smoke-mac-'));
  const originalCwd = process.cwd();

  try {
    await fs.mkdir(path.join(tmpRoot, 'pkg', 'mac', 'Contents', 'Resources'), { recursive: true });
    process.chdir(tmpRoot);

    const smokeHelpers = await import(new URL(`../smoke-test.js?t=${Date.now()}`, import.meta.url));
    const resourceRoots = smokeHelpers.resolvePackagedMacResourceRoots('x64');

    assert(resourceRoots.includes(path.join(tmpRoot, 'pkg', 'mac', 'Contents', 'Resources')));
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('linux unpacked verification resolves nested application roots', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-linux-unpacked-'));
  const originalCwd = process.cwd();

  try {
    const nestedRoot = path.join(tmpRoot, 'pkg', 'linux-unpacked', 'Hagicode Desktop');
    await fs.mkdir(path.join(nestedRoot, 'resources'), { recursive: true });
    await fs.writeFile(path.join(nestedRoot, 'resources', 'app.asar'), 'asar', 'utf8');
    process.chdir(tmpRoot);

    const smokeHelpers = await import(new URL(`../smoke-test.js?t=${Date.now()}`, import.meta.url));
    const resolvedRoots = smokeHelpers.resolvePackagedLinuxUnpackedRoots();

    assert(resolvedRoots.includes(nestedRoot));
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
