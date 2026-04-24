import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildPortableToolchainPaths,
  resolvePortableToolchainRoot,
} from '../portable-toolchain-paths.js';

describe('path-manager portable toolchain paths', () => {
  it('resolves development mode toolchain paths from workspace resources on unix', () => {
    const paths = buildPortableToolchainPaths({
      cwd: '/workspace/hagicode-desktop',
      resourcesPath: '/ignored/resources',
      isPackaged: false,
      platform: 'linux',
    });

    assert.equal(paths.toolchainRoot, '/workspace/hagicode-desktop/resources/portable-fixed/toolchain');
    assert.equal(paths.nodeRoot, '/workspace/hagicode-desktop/resources/portable-fixed/toolchain/node');
    assert.equal(paths.toolchainBinRoot, '/workspace/hagicode-desktop/resources/portable-fixed/toolchain/bin');
    assert.equal(paths.nodeBinRoot, '/workspace/hagicode-desktop/resources/portable-fixed/toolchain/node/bin');
    assert.equal(paths.npmGlobalBinRoot, '/workspace/hagicode-desktop/resources/portable-fixed/toolchain/npm-global/bin');
    assert.equal(paths.nodeExecutablePath, '/workspace/hagicode-desktop/resources/portable-fixed/toolchain/node/bin/node');
    assert.equal(paths.npmExecutablePath, '/workspace/hagicode-desktop/resources/portable-fixed/toolchain/node/bin/npm');
    assert.equal(paths.openspecExecutablePath, '/workspace/hagicode-desktop/resources/portable-fixed/toolchain/bin/openspec');
    assert.equal(paths.skillsExecutablePath, '/workspace/hagicode-desktop/resources/portable-fixed/toolchain/bin/skills');
    assert.equal(paths.omnirouteExecutablePath, '/workspace/hagicode-desktop/resources/portable-fixed/toolchain/bin/omniroute');
    assert.equal(paths.toolchainManifestPath, '/workspace/hagicode-desktop/resources/portable-fixed/toolchain/toolchain-manifest.json');
  });

  it('resolves packaged mode toolchain paths from resources on windows', () => {
    const paths = buildPortableToolchainPaths({
      cwd: 'C:/workspace/hagicode-desktop',
      resourcesPath: 'C:/Program Files/HagiCode/resources',
      isPackaged: true,
      platform: 'win32',
    });

    assert.equal(paths.toolchainRoot, path.join('C:/Program Files/HagiCode/resources', 'extra', 'portable-fixed', 'toolchain'));
    assert.equal(paths.nodeRoot, path.join(paths.toolchainRoot, 'node'));
    assert.equal(paths.nodeBinRoot, paths.nodeRoot);
    assert.equal(paths.nodeExecutablePath, path.join(paths.nodeRoot, 'node.exe'));
    assert.equal(paths.npmExecutablePath, path.join(paths.nodeRoot, 'npm.cmd'));
    assert.equal(paths.openspecExecutablePath, path.join(paths.toolchainBinRoot, 'openspec.cmd'));
    assert.equal(paths.skillsExecutablePath, path.join(paths.toolchainBinRoot, 'skills.cmd'));
    assert.equal(paths.omnirouteExecutablePath, path.join(paths.toolchainBinRoot, 'omniroute.cmd'));
  });

  it('supports explicit toolchain root override for all derived paths', () => {
    const toolchainRoot = resolvePortableToolchainRoot({
      cwd: '/workspace/hagicode-desktop',
      resourcesPath: '/ignored/resources',
      isPackaged: true,
      platform: 'linux',
      overrideRoot: ' ../portable/toolchain ',
    });
    const paths = buildPortableToolchainPaths({
      cwd: '/workspace/hagicode-desktop',
      resourcesPath: '/ignored/resources',
      isPackaged: true,
      platform: 'linux',
      overrideRoot: ' ../portable/toolchain ',
    });

    assert.equal(toolchainRoot, path.resolve('../portable/toolchain'));
    assert.equal(paths.toolchainRoot, toolchainRoot);
    assert.equal(paths.nodeExecutablePath, path.join(toolchainRoot, 'node', 'bin', 'node'));
    assert.equal(paths.npmGlobalBinRoot, path.join(toolchainRoot, 'npm-global', 'bin'));
  });

  it('keeps macOS packaged root under Contents/Resources via process.resourcesPath', () => {
    const paths = buildPortableToolchainPaths({
      cwd: '/workspace/hagicode-desktop',
      resourcesPath: '/Applications/HagiCode Desktop.app/Contents/Resources',
      isPackaged: true,
      platform: 'darwin',
    });

    assert.equal(
      paths.toolchainRoot,
      '/Applications/HagiCode Desktop.app/Contents/Resources/extra/portable-fixed/toolchain',
    );
    assert.equal(paths.nodeExecutablePath, '/Applications/HagiCode Desktop.app/Contents/Resources/extra/portable-fixed/toolchain/node/bin/node');
  });
});
