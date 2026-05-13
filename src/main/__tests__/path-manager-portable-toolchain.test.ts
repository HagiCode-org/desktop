import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildNodeMajorNpmGlobalPaths,
  buildPm2MajorHomePaths,
  buildNpmGlobalCommandArtifactPaths,
  buildPortableToolchainPaths,
  resolvePortableToolchainRoot,
} from '../portable-toolchain-paths.js';

describe('path-manager portable toolchain paths', () => {
  it('resolves development mode toolchain paths from the shared desktop runtime on unix', () => {
    const paths = buildPortableToolchainPaths({
      cwd: '/workspace/hagicode-desktop',
      resourcesPath: '/ignored/resources',
      isPackaged: false,
      platform: 'linux',
    });

    assert.equal(paths.toolchainRoot, '/workspace/hagicode-desktop/build/desktop-runtime/current/components/node/runtime');
    assert.equal(paths.nodeRoot, '/workspace/hagicode-desktop/build/desktop-runtime/current/components/node/runtime');
    assert.equal(paths.toolchainBinRoot, '/workspace/hagicode-desktop/build/desktop-runtime/current/components/node/runtime/bin');
    assert.equal(paths.nodeBinRoot, '/workspace/hagicode-desktop/build/desktop-runtime/current/components/node/runtime/bin');
    assert.equal(paths.nodeExecutablePath, '/workspace/hagicode-desktop/build/desktop-runtime/current/components/node/runtime/bin/node');
    assert.equal(paths.npmExecutablePath, '/workspace/hagicode-desktop/build/desktop-runtime/current/components/node/runtime/bin/npm');
    assert.equal(paths.toolchainManifestPath, '/workspace/hagicode-desktop/build/desktop-runtime/current/components/node/runtime/toolchain-manifest.json');
    assert.notEqual(paths.toolchainRoot, '/workspace/hagicode-desktop/resources/toolchain');
    assert.equal('openspecExecutablePath' in paths, false);
  });

  it('resolves packaged mode toolchain paths from resources on windows', () => {
    const paths = buildPortableToolchainPaths({
      cwd: 'C:/workspace/hagicode-desktop',
      resourcesPath: 'C:/Program Files/HagiCode/resources',
      isPackaged: true,
      platform: 'win32',
    });

    assert.equal(paths.toolchainRoot, path.join('C:/Program Files/HagiCode/resources', 'extra', 'runtime', 'components', 'node', 'runtime'));
    assert.equal(paths.nodeRoot, paths.toolchainRoot);
    assert.equal(paths.nodeBinRoot, paths.toolchainRoot);
    assert.equal(paths.nodeExecutablePath, path.join(paths.toolchainRoot, 'node.exe'));
    assert.equal(paths.npmExecutablePath, path.join(paths.toolchainRoot, 'npm.cmd'));
    assert.equal('openspecExecutablePath' in paths, false);
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
    assert.equal(paths.nodeExecutablePath, path.join(toolchainRoot, 'bin', 'node'));
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
      '/Applications/HagiCode Desktop.app/Contents/Resources/extra/runtime/components/node/runtime',
    );
    assert.equal(paths.nodeExecutablePath, '/Applications/HagiCode Desktop.app/Contents/Resources/extra/runtime/components/node/runtime/bin/node');
  });

  it('resolves Node-major npm global paths under userData on linux and macOS', () => {
    const node22 = buildNodeMajorNpmGlobalPaths({
      userDataPath: '/home/user/.config/HagiCode Desktop',
      nodeVersion: 'v22.12.0',
      platform: 'linux',
    });
    const node24 = buildNodeMajorNpmGlobalPaths({
      userDataPath: '/home/user/.config/HagiCode Desktop',
      nodeVersion: '24.1.0',
      platform: 'linux',
    });
    const mac = buildNodeMajorNpmGlobalPaths({
      userDataPath: '/Users/user/Library/Application Support/HagiCode Desktop',
      nodeVersion: '22.12.0',
      platform: 'darwin',
    });

    assert.equal(node22.npmGlobalPrefix, '/home/user/.config/HagiCode Desktop/runtimeData/node/node22/npmGlobal');
    assert.equal(node22.npmGlobalBinRoot, '/home/user/.config/HagiCode Desktop/runtimeData/node/node22/npmGlobal/bin');
    assert.equal(node22.npmGlobalModulesRoot, '/home/user/.config/HagiCode Desktop/runtimeData/node/node22/npmGlobal/lib/node_modules');
    assert.equal(node22.npmCacheRoot, '/home/user/.config/HagiCode Desktop/runtimeData/node/node22/npmCache');
    assert.equal(node24.npmGlobalPrefix, '/home/user/.config/HagiCode Desktop/runtimeData/node/node24/npmGlobal');
    assert.notEqual(node24.npmGlobalPrefix, node22.npmGlobalPrefix);
    assert.equal(mac.npmGlobalPrefix, '/Users/user/Library/Application Support/HagiCode Desktop/runtimeData/node/node22/npmGlobal');
  });

  it('resolves Windows npm global paths and command wrapper artifacts under prefix root', () => {
    const paths = buildNodeMajorNpmGlobalPaths({
      userDataPath: 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop',
      nodeVersion: '22.12.0',
      platform: 'win32',
    });

    assert.equal(paths.npmGlobalPrefix, 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\node\\node22\\npmGlobal');
    assert.equal(paths.npmGlobalBinRoot, paths.npmGlobalPrefix);
    assert.equal(paths.npmGlobalModulesRoot, 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\node\\node22\\npmGlobal\\node_modules');
    assert.deepEqual(buildNpmGlobalCommandArtifactPaths(paths.npmGlobalBinRoot, 'hagiscript', 'win32'), [
      'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\node\\node22\\npmGlobal\\hagiscript',
      'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\node\\node22\\npmGlobal\\hagiscript.cmd',
      'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\node\\node22\\npmGlobal\\hagiscript.ps1',
    ]);
  });

  it('derives Desktop-managed PM2 homes under userData by PM2 major version', () => {
    const linuxPaths = buildPm2MajorHomePaths({
      userDataPath: '/home/user/.config/HagiCode Desktop',
      pm2Version: '6.0.14',
      platform: 'linux',
    });
    const windowsPaths = buildPm2MajorHomePaths({
      userDataPath: 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop',
      pm2Version: '7.0.1',
      platform: 'win32',
    });

    assert.equal(linuxPaths.pm2Home, '/home/user/.config/HagiCode Desktop/runtimeData/pm2/6');
    assert.equal(windowsPaths.pm2Home, 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\pm2\\7');
  });

  it('falls back to a deterministic PM2 home when the PM2 version is invalid', () => {
    const paths = buildPm2MajorHomePaths({
      userDataPath: '/home/user/.config/HagiCode Desktop',
      pm2Version: 'not-a-version',
      pm2MajorVersion: 'bad-input',
      platform: 'linux',
    });

    assert.equal(
      paths.pm2Home,
      '/home/user/.config/HagiCode Desktop/runtimeData/pm2/7',
    );
  });
});
