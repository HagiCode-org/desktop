import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { materializeForgePackagingResources } from '../forge-packaging-hooks.js';

test('stages .NET and removes Desktop-managed Node/PM2 assets on supported platforms', async () => {
  const fixtureRoot = path.join(process.cwd(), 'build', 'test-fixtures');
  await mkdir(fixtureRoot, { recursive: true });
  const tempRoot = await mkdtemp(path.join(fixtureRoot, 'hagicode-forge-runtime-'));
  const resourceSourceRoot = path.join(tempRoot, 'source');
  const dotnetPath = path.join(resourceSourceRoot, 'components', 'dotnet', 'runtime', 'win-x64', 'current', 'dotnet.exe');
  const nodePath = path.join(resourceSourceRoot, 'components', 'node', 'runtime', 'node.exe');
  const pm2Path = path.join(resourceSourceRoot, 'npm-pm2', 'node_modules', 'pm2', 'bin', 'pm2');

  try {
    await Promise.all([
      mkdir(path.dirname(dotnetPath), { recursive: true }),
      mkdir(path.dirname(nodePath), { recursive: true }),
      mkdir(path.dirname(pm2Path), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(dotnetPath, ''),
      writeFile(nodePath, ''),
      writeFile(pm2Path, ''),
    ]);

    for (const platform of ['win32', 'linux', 'darwin']) {
      const packageRoot = path.join(tempRoot, `package-${platform}`);
      const buildPath = platform === 'darwin' ? path.join(packageRoot, 'Hagicode.app') : packageRoot;
      const resourcesRoot = platform === 'darwin'
        ? path.join(buildPath, 'Contents', 'Resources')
        : path.join(buildPath, 'resources');
      const runtimeRoot = path.join(resourcesRoot, 'extra', 'runtime');
      const packagedDotnet = path.join(runtimeRoot, 'components', 'dotnet', 'runtime', 'win-x64', 'current', 'dotnet.exe');
      await materializeForgePackagingResources(buildPath, platform, resourceSourceRoot);

      assert.equal((await stat(packagedDotnet)).isFile(), true);
      assert.equal(existsSync(path.join(runtimeRoot, 'components', 'node')), false);
      assert.equal(existsSync(path.join(runtimeRoot, 'npm-pm2')), false);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
