import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { stringify } from 'yaml';
import { loadRuntimeManifest, resolveManagedServerStartupEnvironment } from '@hagicode/hagiscript-sdk';
import { buildDesktopHagiscriptRuntimeManifest } from '../hagiscript-desktop-manifest.js';

describe('node-less Desktop startup', () => {
  it('accepts an empty node runtime and resolves the released service through dotnet', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-node-less-'));
    const scriptsRoot = path.join(root, 'scripts');
    const payloadRoot = path.join(root, 'payload', 'lib');
    const runtimeDataRoot = path.join(root, 'runtime-data');
    const serverDataRoot = path.join(runtimeDataRoot, 'server-data');
    const dotnetRoot = path.join(root, 'dotnet');
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
      fs.mkdir(path.join(npmPrefix, 'lib', 'node_modules', 'pm2', 'bin'), { recursive: true }),
    ]);
    await Promise.all(scriptNames.map((name) => fs.writeFile(path.join(scriptsRoot, name), 'export {};\n')));
    await fs.writeFile(path.join(payloadRoot, 'PCode.Web.dll'), '');
    await fs.writeFile(path.join(dotnetRoot, 'current', 'dotnet'), '');
    await fs.writeFile(path.join(npmPrefix, 'lib', 'node_modules', 'pm2', 'bin', 'pm2'), '');
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
    assert.equal(loaded.paths.nodeRuntime, '');
    const environment = await resolveManagedServerStartupEnvironment({ manifestPath, runtimeRoot: root });
    assert.equal(environment.nodePath, '');
    assert.equal(environment.useManagedNodeRuntime, false);
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
