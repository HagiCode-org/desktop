import assert from 'node:assert/strict';
import { chmod } from 'node:fs/promises';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { stringify } from 'yaml';
import { loadRuntimeManifest, resolveManagedServerStartupEnvironment } from '@hagicode/hagiscript-sdk';
import { buildDesktopHagiscriptRuntimeManifest } from '../hagiscript-desktop-manifest.js';

describe('Desktop managed Node startup', () => {
  it('uses bundled Node for PM2 and resolves the released service through dotnet', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-managed-node-'));
    const scriptsRoot = path.join(root, 'scripts');
    const payloadRoot = path.join(root, 'payload', 'lib');
    const runtimeDataRoot = path.join(root, 'runtime-data');
    const serverDataRoot = path.join(runtimeDataRoot, 'server-data');
    const dotnetRoot = path.join(root, 'dotnet');
    const nodeRuntimeRoot = path.join(root, 'components', 'node', 'runtime');
    const nodePath = path.join(nodeRuntimeRoot, 'bin', 'node');
    const npmPrefix = path.join(runtimeDataRoot, 'npm');
    const manifestPath = path.join(root, 'runtime.yml');
    const scriptNames = [
      'noop-install-node.mjs',
      'noop-verify-node.mjs',
      'noop-install-dotnet.mjs',
      'noop-verify-dotnet.mjs',
      'noop-install-server.mjs',
      'noop-configure-server.mjs',
      'noop-remove-server.mjs',
    ];

    await Promise.all([
      fs.mkdir(scriptsRoot, { recursive: true }),
      fs.mkdir(payloadRoot, { recursive: true }),
      fs.mkdir(path.join(serverDataRoot), { recursive: true }),
      fs.mkdir(path.join(dotnetRoot, 'current'), { recursive: true }),
      fs.mkdir(path.dirname(nodePath), { recursive: true }),
      fs.mkdir(path.join(npmPrefix, 'lib', 'node_modules', 'pm2', 'bin'), { recursive: true }),
    ]);
    await Promise.all(scriptNames.map((name) => fs.writeFile(path.join(scriptsRoot, name), 'export {};\n')));
    await fs.writeFile(path.join(payloadRoot, 'PCode.Web.dll'), '');
    await fs.writeFile(path.join(dotnetRoot, 'current', 'dotnet'), '');
    await fs.writeFile(nodePath, '');
    await chmod(nodePath, 0o755);
    await fs.writeFile(path.join(npmPrefix, 'lib', 'node_modules', 'pm2', 'bin', 'pm2'), '');
    await fs.writeFile(
      path.join(npmPrefix, 'lib', 'node_modules', 'pm2', 'package.json'),
      JSON.stringify({ name: 'pm2', version: '7.0.1' }),
    );
    await fs.writeFile(
      path.join(serverDataRoot, 'versions-state.json'),
      JSON.stringify({
        schemaVersion: 1,
        activeVersion: 'fixture',
        versions: {
          fixture: {
            version: 'fixture',
            installPath: path.join(root, 'payload'),
            installedAt: new Date().toISOString(),
            source: { kind: 'local-folder', locator: path.join(root, 'payload'), assetName: 'fixture' },
          },
        },
      }),
    );

    const manifest = buildDesktopHagiscriptRuntimeManifest({
      runtimeRoot: root,
      runtimeHome: root,
      runtimeDataRoot,
      serverProgramRoot: path.join(root, 'server'),
      serverDataRoot,
      npmPrefix,
      nodeRuntimeRoot,
      dotnetRuntimeRoot: dotnetRoot,
      server: {
        servicePayloadPath: path.join(payloadRoot, 'PCode.Web.dll'),
        serviceWorkingDirectory: payloadRoot,
      },
    });
    for (const component of manifest.components as Array<Record<string, unknown>>) {
      if (component.name === 'node') {
        component.installScript = path.join(scriptsRoot, 'noop-install-node.mjs');
        component.verifyScript = path.join(scriptsRoot, 'noop-verify-node.mjs');
      }
    }
    await fs.writeFile(manifestPath, stringify(manifest));

    const loaded = await loadRuntimeManifest({ manifestPath });
    assert.equal(loaded.paths.nodeRuntime, nodeRuntimeRoot);
    const environment = await resolveManagedServerStartupEnvironment({ manifestPath, runtimeRoot: root });
    assert.equal(environment.nodePath, nodePath);
    assert.equal(environment.useManagedNodeRuntime, true);
    assert.equal(environment.launchStrategy, 'released-service');
    assert.equal(environment.script, path.join(payloadRoot, 'PCode.Web.dll'));
    assert.equal(environment.dotnetPath, path.join(dotnetRoot, 'current', 'dotnet'));

    const invalidManifest = structuredClone(manifest) as { paths: { dotnetRuntime: string } };
    invalidManifest.paths.dotnetRuntime = '';
    const invalidManifestPath = path.join(root, 'invalid-runtime.yml');
    await fs.writeFile(invalidManifestPath, stringify(invalidManifest));
    await assert.rejects(
      () => loadRuntimeManifest({ manifestPath: invalidManifestPath }),
      /paths\.dotnetRuntime/,
    );
  });
});
