import assert from 'node:assert/strict';
import { chmod } from 'node:fs/promises';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { load } from 'js-yaml';
import {
  HagiscriptRuntimeContextResolver,
  validateDesktopPm2Toolchain,
} from '../hagiscript-runtime-context.js';

async function createWindowsRuntimeFixture(root: string) {
  const runtimeHome = path.join(root, 'resources', 'extra', 'runtime');
  const runtimeDataRoot = path.join(root, 'runtime-data');
  const userDataRoot = path.join(root, 'user-data');
  const serverProgramRoot = path.join(root, 'server-program');
  const dotnetRuntimeRoot = path.join(runtimeHome, 'components', 'dotnet', 'runtime', 'win-x64');
  const nodeRuntimeRoot = path.join(runtimeHome, 'components', 'node', 'runtime');
  const npmPrefix = path.join(runtimeHome, 'npm-pm2');
  const payloadRoot = path.join(root, 'payload', 'lib');
  const pm2Root = path.join(npmPrefix, 'node_modules', 'pm2');

  await Promise.all([
    fs.mkdir(path.join(dotnetRuntimeRoot, 'current'), { recursive: true }),
    fs.mkdir(nodeRuntimeRoot, { recursive: true }),
    fs.mkdir(path.join(pm2Root, 'bin'), { recursive: true }),
    fs.mkdir(payloadRoot, { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(path.join(nodeRuntimeRoot, 'node.exe'), ''),
    fs.writeFile(path.join(dotnetRuntimeRoot, 'current', 'dotnet.exe'), ''),
    fs.writeFile(path.join(pm2Root, 'bin', 'pm2'), ''),
    fs.writeFile(path.join(pm2Root, 'package.json'), JSON.stringify({ name: 'pm2', version: '7.0.1' })),
    fs.writeFile(path.join(payloadRoot, 'PCode.Web.dll'), ''),
  ]);

  const pathManager = {
    getRuntimeProgramHome: () => runtimeHome,
    getBundledRuntimeProgramHome: () => runtimeHome,
    getRuntimeDataHome: () => runtimeDataRoot,
    getUserDataPath: () => userDataRoot,
    getManagedServerProgramHome: () => serverProgramRoot,
    getEmbeddedRuntimeContainerRoot: () => dotnetRuntimeRoot,
    getEmbeddedRuntimeRoot: () => path.join(dotnetRuntimeRoot, 'current'),
    getCurrentPlatform: () => 'win-x64' as const,
  };
  return {
    nodeRuntimeRoot,
    npmPrefix,
    pathManager,
    payloadRoot,
    runtimeDataRoot,
    runtimeHome,
  };
}

describe('Desktop HagiScript runtime context', () => {
  it('resolves the bundled Windows Node and PM2 prefix without external dependency context', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-managed-pm2-context-'));
    try {
      const fixture = await createWindowsRuntimeFixture(root);
      const resolver = new HagiscriptRuntimeContextResolver({
        pathManager: fixture.pathManager,
      });
      const context = await resolver.resolve({
        activeRuntime: {
          kind: 'installed-version',
          rootPath: path.join(root, 'server', '1.0.0'),
          versionId: '1.0.0',
          versionLabel: '1.0.0',
          displayName: 'HagiCode Server',
          isReadOnly: false,
        },
        servicePayloadPath: path.join(fixture.payloadRoot, 'PCode.Web.dll'),
        serviceWorkingDirectory: fixture.payloadRoot,
      });

      const manifest = load(await fs.readFile(context.manifestPath, 'utf8')) as {
        paths: { nodeRuntime: string; npmPrefix: string; dotnetRuntime: string };
        components: Array<Record<string, unknown>>;
      };
      assert.equal(manifest.paths.nodeRuntime, fixture.nodeRuntimeRoot);
      assert.equal(manifest.paths.npmPrefix, fixture.npmPrefix);
      assert.equal(manifest.paths.dotnetRuntime, path.join(fixture.runtimeHome, 'components', 'dotnet', 'runtime', 'win-x64'));
      assert.equal(
        (manifest.components.find((component) => component.name === 'node') as { required: boolean }).required,
        true,
      );
      await context.cleanup();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('resolves bundled Node and PM2 paths for Linux without external dependency discovery', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-linux-pm2-context-'));
    try {
      const runtimeHome = path.join(root, 'external-runtime');
      const bundledRuntimeHome = path.join(root, 'resources');
      const runtimeDataRoot = path.join(root, 'runtime-data');
      const userDataRoot = path.join(root, 'user-data');
      const serverProgramRoot = path.join(root, 'server-program');
      const dotnetRuntimeRoot = path.join(runtimeHome, 'components', 'dotnet', 'runtime', 'linux-x64');
      const nodeRuntimeRoot = path.join(bundledRuntimeHome, 'components', 'node', 'runtime');
      const nodePath = path.join(nodeRuntimeRoot, 'bin', 'node');
      const npmPrefix = path.join(bundledRuntimeHome, 'npm-pm2');
      const pm2Root = path.join(npmPrefix, 'lib', 'node_modules', 'pm2');
      await Promise.all([
        fs.mkdir(path.dirname(nodePath), { recursive: true }),
        fs.mkdir(path.join(pm2Root, 'bin'), { recursive: true }),
      ]);
      await Promise.all([
        fs.writeFile(nodePath, ''),
        fs.writeFile(path.join(pm2Root, 'bin', 'pm2'), ''),
        fs.writeFile(path.join(pm2Root, 'package.json'), JSON.stringify({ name: 'pm2', version: '7.0.1' })),
      ]);
      await chmod(nodePath, 0o755);
      const resolver = new HagiscriptRuntimeContextResolver({
        pathManager: {
          getRuntimeProgramHome: () => runtimeHome,
          getBundledRuntimeProgramHome: () => bundledRuntimeHome,
          getRuntimeDataHome: () => runtimeDataRoot,
          getUserDataPath: () => userDataRoot,
          getManagedServerProgramHome: () => serverProgramRoot,
          getEmbeddedRuntimeContainerRoot: () => dotnetRuntimeRoot,
          getEmbeddedRuntimeRoot: () => dotnetRuntimeRoot,
          getCurrentPlatform: () => 'linux-x64' as const,
        },
      });

      const context = await resolver.resolve({
        activeRuntime: {
          kind: 'installed-version',
          rootPath: path.join(root, 'server', '1.0.0'),
          versionId: '1.0.0',
          versionLabel: '1.0.0',
          displayName: 'HagiCode Server',
          isReadOnly: false,
        },
        servicePayloadPath: path.join(root, 'payload', 'PCode.Web.dll'),
        serviceWorkingDirectory: path.join(root, 'payload'),
      });

      const manifest = load(await fs.readFile(context.manifestPath, 'utf8')) as {
        paths: { nodeRuntime: string; npmPrefix: string; dotnetRuntime: string };
        components: Array<{ name: string; required?: boolean; source?: string }>;
      };
      assert.equal(manifest.paths.nodeRuntime, nodeRuntimeRoot);
      assert.equal(manifest.paths.npmPrefix, npmPrefix);
      assert.equal(manifest.paths.dotnetRuntime, dotnetRuntimeRoot);
      assert.equal(manifest.components.find((component) => component.name === 'node')?.required, true);
      assert.equal(manifest.components.find((component) => component.name === 'node')?.source, 'desktop-bundled-pm2-node');
      await context.cleanup();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('validates bundled Node and PM2 paths for macOS', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-macos-pm2-context-'));
    try {
      const nodeRuntimeRoot = path.join(root, 'components', 'node', 'runtime');
      const npmPrefix = path.join(root, 'npm-pm2');
      const pm2Root = path.join(npmPrefix, 'lib', 'node_modules', 'pm2');
      const nodePath = path.join(nodeRuntimeRoot, 'bin', 'node');
      await Promise.all([
        fs.mkdir(path.dirname(nodePath), { recursive: true }),
        fs.mkdir(path.join(pm2Root, 'bin'), { recursive: true }),
      ]);
      await Promise.all([
        fs.writeFile(nodePath, ''),
        fs.writeFile(path.join(pm2Root, 'bin', 'pm2'), ''),
        fs.writeFile(path.join(pm2Root, 'package.json'), JSON.stringify({ name: 'pm2', version: '7.0.1' })),
      ]);
      await chmod(nodePath, 0o755);

      await validateDesktopPm2Toolchain(nodeRuntimeRoot, npmPrefix, path.join('bin', 'node'), 'mac-arm64');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('fails with the missing bundled asset path instead of falling back to external Node', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-missing-managed-pm2-'));
    try {
      const fixture = await createWindowsRuntimeFixture(root);
      await fs.rm(path.join(fixture.nodeRuntimeRoot, 'node.exe'));

      await assert.rejects(
        () => validateDesktopPm2Toolchain(fixture.nodeRuntimeRoot, fixture.npmPrefix, 'node.exe', 'win-x64'),
        /Bundled PM2 Node executable is missing/,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('reports a missing managed PM2 entrypoint', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-missing-managed-pm2-entry-'));
    try {
      const fixture = await createWindowsRuntimeFixture(root);
      await fs.rm(path.join(fixture.npmPrefix, 'node_modules', 'pm2', 'bin', 'pm2'));

      await assert.rejects(
        () => validateDesktopPm2Toolchain(fixture.nodeRuntimeRoot, fixture.npmPrefix, 'node.exe', 'win-x64'),
        /Managed PM2 entrypoint is missing/,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
