import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { materializeForgePackagingResources } from '../forge-packaging-hooks.js';

test('stages the PM2 toolchain into Windows resources outside app.asar', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hagicode-forge-pm2-'));
  const resourceSourceRoot = path.join(tempRoot, 'source');
  const buildPath = path.join(tempRoot, 'package');
  const runtimeRoot = path.join(buildPath, 'resources', 'extra', 'runtime');
  const nodePath = path.join(resourceSourceRoot, 'components', 'node', 'runtime', 'node.exe');
  const pm2Root = path.join(resourceSourceRoot, 'npm-pm2', 'node_modules', 'pm2');

  try {
    await Promise.all([
      mkdir(path.dirname(nodePath), { recursive: true }),
      mkdir(path.join(pm2Root, 'bin'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(nodePath, ''),
      writeFile(path.join(pm2Root, 'bin', 'pm2'), ''),
      writeFile(path.join(pm2Root, 'package.json'), JSON.stringify({ name: 'pm2', version: '7.0.1' })),
    ]);

    await materializeForgePackagingResources(buildPath, 'win32', resourceSourceRoot);

    const packagedNode = path.join(runtimeRoot, 'components', 'node', 'runtime', 'node.exe');
    const packagedPm2 = path.join(runtimeRoot, 'npm-pm2', 'node_modules', 'pm2', 'bin', 'pm2');
    assert.equal(path.relative(buildPath, packagedNode).includes('app.asar'), false);
    assert.equal(path.relative(buildPath, packagedPm2).includes('app.asar'), false);
    assert.equal((await stat(packagedNode)).isFile(), true);
    assert.equal((await stat(packagedPm2)).isFile(), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('stages executable bundled Node and PM2 resources into Linux packages', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hagicode-forge-pm2-linux-'));
  const resourceSourceRoot = path.join(tempRoot, 'source');
  const buildPath = path.join(tempRoot, 'package');
  const runtimeRoot = path.join(buildPath, 'resources', 'extra', 'runtime');
  const nodePath = path.join(resourceSourceRoot, 'components', 'node', 'runtime', 'bin', 'node');
  const pm2Root = path.join(resourceSourceRoot, 'npm-pm2', 'lib', 'node_modules', 'pm2');

  try {
    await Promise.all([
      mkdir(path.dirname(nodePath), { recursive: true }),
      mkdir(path.join(pm2Root, 'bin'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(nodePath, ''),
      writeFile(path.join(pm2Root, 'bin', 'pm2'), ''),
      writeFile(path.join(pm2Root, 'package.json'), JSON.stringify({ name: 'pm2', version: '7.0.1' })),
    ]);
    await chmod(nodePath, 0o755);

    await materializeForgePackagingResources(buildPath, 'linux', resourceSourceRoot);

    const packagedNode = path.join(runtimeRoot, 'components', 'node', 'runtime', 'bin', 'node');
    const packagedPm2 = path.join(runtimeRoot, 'npm-pm2', 'lib', 'node_modules', 'pm2', 'bin', 'pm2');
    assert.equal((await stat(packagedNode)).mode & 0o111, 0o111);
    assert.equal((await stat(packagedPm2)).isFile(), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('stages executable bundled Node and PM2 resources into macOS app bundles', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hagicode-forge-pm2-darwin-'));
  const resourceSourceRoot = path.join(tempRoot, 'source');
  const buildPath = path.join(tempRoot, 'Hagicode.app');
  const runtimeRoot = path.join(buildPath, 'Contents', 'Resources', 'extra', 'runtime');
  const nodePath = path.join(resourceSourceRoot, 'components', 'node', 'runtime', 'bin', 'node');
  const pm2Root = path.join(resourceSourceRoot, 'npm-pm2', 'lib', 'node_modules', 'pm2');

  try {
    await Promise.all([
      mkdir(path.dirname(nodePath), { recursive: true }),
      mkdir(path.join(pm2Root, 'bin'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(nodePath, ''),
      writeFile(path.join(pm2Root, 'bin', 'pm2'), ''),
      writeFile(path.join(pm2Root, 'package.json'), JSON.stringify({ name: 'pm2', version: '7.0.1' })),
    ]);
    await chmod(nodePath, 0o755);

    await materializeForgePackagingResources(buildPath, 'darwin', resourceSourceRoot);

    const packagedNode = path.join(runtimeRoot, 'components', 'node', 'runtime', 'bin', 'node');
    const packagedPm2 = path.join(runtimeRoot, 'npm-pm2', 'lib', 'node_modules', 'pm2', 'bin', 'pm2');
    assert.equal((await stat(packagedNode)).mode & 0o111, 0o111);
    assert.equal((await stat(packagedPm2)).isFile(), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('rejects Windows package staging when the PM2 toolchain is incomplete', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hagicode-forge-pm2-missing-'));
  try {
    await assert.rejects(
      () => materializeForgePackagingResources(
        path.join(tempRoot, 'package'),
        'win32',
        path.join(tempRoot, 'empty-source'),
      ),
      /Bundled PM2 Node executable is missing/,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
