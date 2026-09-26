import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  assertPackagedDesktopManagedNodePm2AssetsAbsent,
  findPackagedDesktopManagedNodePm2Assets,
} from './non-interactive-integration-test.mjs';

test('packaged integration rejects Desktop-managed Node and PM2 assets on all package layouts', async () => {
  const fixtureRoot = path.join(process.cwd(), 'build', 'test-fixtures');
  await mkdir(fixtureRoot, { recursive: true });
  const root = await mkdtemp(path.join(fixtureRoot, 'packaged-node-pm2-'));

  try {
    const linuxRuntimeRoot = path.join(root, 'linux', 'resources', 'extra', 'runtime');
    await mkdir(path.join(linuxRuntimeRoot, 'components', 'dotnet'), { recursive: true });
    assert.doesNotThrow(() => assertPackagedDesktopManagedNodePm2AssetsAbsent(path.join(root, 'linux')));

    const nodePath = path.join(linuxRuntimeRoot, 'components', 'node', 'runtime', 'bin', 'node');
    const pm2Path = path.join(linuxRuntimeRoot, 'npm-pm2', 'lib', 'node_modules', 'pm2', 'bin', 'pm2');
    await mkdir(path.dirname(nodePath), { recursive: true });
    await mkdir(path.dirname(pm2Path), { recursive: true });
    await Promise.all([writeFile(nodePath, ''), writeFile(pm2Path, '')]);
    assert.equal(findPackagedDesktopManagedNodePm2Assets(path.join(root, 'linux')).length, 2);
    assert.throws(
      () => assertPackagedDesktopManagedNodePm2AssetsAbsent(path.join(root, 'linux')),
      /forbidden managed Node\/PM2 assets/,
    );

    const macResources = path.join(root, 'mac', 'Hagicode Desktop.app', 'Contents', 'Resources');
    await mkdir(path.join(macResources, 'extra', 'runtime', 'npm-pm2'), { recursive: true });
    await writeFile(path.join(macResources, 'app.asar'), '');
    assert.equal(findPackagedDesktopManagedNodePm2Assets(path.join(root, 'mac')).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('only the canonical packaged integration command remains available', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.scripts['package:non-interactive-integration'], 'node scripts/non-interactive-integration-test.mjs');
  assert.equal(Object.hasOwn(packageJson.scripts, 'package:runtime-pm2-integration'), false);
});
