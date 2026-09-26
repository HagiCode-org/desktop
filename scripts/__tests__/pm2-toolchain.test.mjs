import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validatePm2Toolchain } from '../pm2-toolchain.js';

async function createToolchain(root, platform) {
  const nodePath = path.join(
    root,
    'components',
    'node',
    'runtime',
    ...(platform === 'win32' ? ['node.exe'] : ['bin', 'node']),
  );
  const modulesRoot = path.join(root, 'npm-pm2', ...(platform === 'win32' ? ['node_modules'] : ['lib', 'node_modules']));
  const pm2Root = path.join(modulesRoot, 'pm2');
  const dependencyRoot = path.join(modulesRoot, '@pm2', 'fixture-dependency');
  await Promise.all([
    mkdir(path.dirname(nodePath), { recursive: true }),
    mkdir(path.join(pm2Root, 'bin'), { recursive: true }),
    mkdir(dependencyRoot, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(nodePath, ''),
    writeFile(path.join(pm2Root, 'bin', 'pm2'), ''),
    writeFile(
      path.join(pm2Root, 'package.json'),
      JSON.stringify({ name: 'pm2', version: '7.0.1', dependencies: { '@pm2/fixture-dependency': '1.0.0' } }),
    ),
    writeFile(path.join(dependencyRoot, 'index.js'), ''),
    writeFile(
      path.join(dependencyRoot, 'package.json'),
      JSON.stringify({ name: '@pm2/fixture-dependency', version: '1.0.0' }),
    ),
  ]);
  if (platform !== 'win32') {
    await chmod(nodePath, 0o755);
  }
}

test('validates the bundled Windows Node executable, PM2 entrypoint, and production dependency tree', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-toolchain-'));
  try {
    await createToolchain(root, 'win32');
    const result = await validatePm2Toolchain(root, 'win32');

    assert.equal(result.pm2Version, '7.0.1');
    assert.equal(result.nodePath, path.join(root, 'components', 'node', 'runtime', 'node.exe'));
    assert.ok(result.requiredFiles.includes('npm-pm2/node_modules/pm2/bin/pm2'));
    assert.ok(result.requiredFiles.includes('npm-pm2/node_modules/@pm2/fixture-dependency/package.json'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('validates the bundled Linux Node executable and executable mode', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-toolchain-linux-'));
  try {
    await createToolchain(root, 'linux');
    const result = await validatePm2Toolchain(root, 'linux');
    assert.equal(result.nodePath, path.join(root, 'components', 'node', 'runtime', 'bin', 'node'));
    assert.ok(result.requiredFiles.includes('components/node/runtime/bin/node'));
    assert.ok(result.requiredFiles.includes('npm-pm2/lib/node_modules/pm2/bin/pm2'));
    assert.ok(result.requiredFiles.includes('npm-pm2/lib/node_modules/@pm2/fixture-dependency/package.json'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ignores npm-generated .bin symlinks in PM2 dependencies', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-toolchain-bin-'));
  try {
    await createToolchain(root, 'linux');
    const pm2Root = path.join(root, 'npm-pm2', 'lib', 'node_modules', 'pm2');
    const binDirectory = path.join(pm2Root, 'node_modules', '.bin');
    const targetPath = path.join(pm2Root, 'node_modules', 'blessed', 'bin', 'blessed');
    await mkdir(path.dirname(targetPath), { recursive: true });
    await mkdir(binDirectory, { recursive: true });
    await writeFile(targetPath, '');
    await symlink(targetPath, path.join(binDirectory, 'blessed'));

    const result = await validatePm2Toolchain(root, 'linux');
    assert.ok(!result.requiredFiles.some((file) => file.includes('/.bin/')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('validates the bundled macOS Node executable and PM2 layout', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-toolchain-darwin-'));
  try {
    await createToolchain(root, 'darwin');
    const result = await validatePm2Toolchain(root, 'darwin');
    assert.equal(result.nodePath, path.join(root, 'components', 'node', 'runtime', 'bin', 'node'));
    assert.ok(result.requiredFiles.includes('npm-pm2/lib/node_modules/pm2/bin/pm2'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports a missing bundled Node executable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-toolchain-node-'));
  try {
    await createToolchain(root, 'win32');
    await rm(path.join(root, 'components', 'node', 'runtime', 'node.exe'));

    await assert.rejects(() => validatePm2Toolchain(root, 'win32'), /Bundled PM2 Node executable is missing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports a missing PM2 runtime dependency', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-toolchain-dependency-'));
  try {
    await createToolchain(root, 'win32');
    await rm(path.join(root, 'npm-pm2', 'node_modules', '@pm2'), { recursive: true, force: true });

    await assert.rejects(() => validatePm2Toolchain(root, 'win32'), /fixture-dependency.*missing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects npm CLI or npm cache content in the PM2-only runtime payload', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-toolchain-npm-'));
  try {
    await createToolchain(root, 'win32');
    await writeFile(path.join(root, 'components', 'node', 'runtime', 'npm.cmd'), '');

    await assert.rejects(
      () => validatePm2Toolchain(root, 'win32'),
      /unexpectedly includes npm\/corepack tooling/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
