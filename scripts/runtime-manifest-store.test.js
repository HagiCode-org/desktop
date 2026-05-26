import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { load } from 'js-yaml';
import {
  ensureRuntimeManifestPath,
  getUserDataRuntimeManifestPath,
  materializeRuntimeManifestContent,
  resolveRuntimeManifestDataScopePath,
} from './runtime-manifest-store.js';

describe('script runtime manifest store data scope resolution', () => {
  it('uses userData/dev when hagicode_dev is active', () => {
    assert.equal(
      resolveRuntimeManifestDataScopePath('/tmp/hagicode-user-data', {
        HAGICODE_DESKTOP_INSTANCE_NAME: 'hagicode_dev',
      }),
      path.join('/tmp/hagicode-user-data', 'dev'),
    );
    assert.equal(
      getUserDataRuntimeManifestPath('/tmp/hagicode-user-data', {
        HAGICODE_DESKTOP_INSTANCE_NAME: 'hagicode_dev',
      }),
      path.join('/tmp/hagicode-user-data', 'dev', 'manifest.yml'),
    );
  });

  it('rewrites runtime and server data roots into the active scope', () => {
    const materialized = materializeRuntimeManifestContent(
      [
        'runtime:',
        '  name: hagicode-desktop-runtime',
        '  version: 0.1.0',
        'paths:',
        '  runtimeRoot: .',
        '  runtimeHome: .',
        '  runtimeDataRoot: ../runtime-data',
        '  serverProgramRoot: ../apps/installed',
        '  serverDataRoot: ../apps/data',
        '  bin: bin',
        '  config: config',
        '  logs: logs',
        '  data: data',
        '  stateFile: state.json',
        '  componentsRoot: components',
        '  componentDataRoot: components',
        '  defaultPm2Home: pm2',
        '  npmPrefix: npm',
        '  nodeRuntime: components/node/runtime',
        '  dotnetRuntime: components/dotnet/runtime',
        '  vendoredRoot: components/bundled',
      ].join('\n'),
      '/tmp/hagicode-user-data/dev',
    );

    const parsed = load(materialized);
    assert.equal(parsed.paths.runtimeDataRoot, path.join('/tmp/hagicode-user-data/dev', 'runtimeData'));
    assert.equal(parsed.paths.serverProgramRoot, path.join('/tmp/hagicode-user-data/dev', 'apps', 'installed'));
    assert.equal(parsed.paths.serverDataRoot, path.join('/tmp/hagicode-user-data/dev', 'apps', 'data'));
  });
});


describe('script runtime manifest store template materialization', () => {
  it('copies bundled runtime templates into the active userData scope', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hagicode-runtime-manifest-'));
    const userDataRoot = path.join(workspaceRoot, 'user-data');
    const resourcesRoot = path.join(workspaceRoot, 'resources');
    const templateSourceRoot = path.join(resourcesRoot, 'components', 'bundled', 'code-server', 'current', 'templates');

    try {
      fs.mkdirSync(templateSourceRoot, { recursive: true });
      fs.writeFileSync(
        path.join(resourcesRoot, 'manifest.yml'),
        [
          'runtime:',
          '  name: hagicode-desktop-runtime',
          '  version: 0.1.0',
          'paths:',
          '  runtimeRoot: .',
          '  runtimeHome: .',
          '  runtimeDataRoot: ../runtime-data',
          '  serverProgramRoot: ../apps/installed',
          '  serverDataRoot: ../apps/data',
          '  bin: bin',
          '  config: config',
          '  logs: logs',
          '  data: data',
          '  stateFile: state.json',
          '  componentsRoot: components',
          '  componentDataRoot: components',
          '  defaultPm2Home: pm2',
          '  npmPrefix: npm',
          '  nodeRuntime: components/node/runtime',
          '  dotnetRuntime: components/dotnet/runtime',
          '  vendoredRoot: components/bundled',
          'components:',
          '  - name: code-server',
          '    type: bundled-runtime',
        ].join('\n'),
        'utf8',
      );
      fs.writeFileSync(
        path.join(templateSourceRoot, 'code-server-config.yaml'),
        'bind-addr: {{BIND_ADDR}}\n',
        'utf8',
      );

      const manifestPath = ensureRuntimeManifestPath(userDataRoot, workspaceRoot, {});
      const templatePath = path.join(userDataRoot, 'templates', 'code-server-config.yaml');

      assert.equal(manifestPath, path.join(userDataRoot, 'manifest.yml'));
      assert.equal(fs.existsSync(templatePath), true);
      assert.equal(fs.readFileSync(templatePath, 'utf8'), 'bind-addr: {{BIND_ADDR}}\n');
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
