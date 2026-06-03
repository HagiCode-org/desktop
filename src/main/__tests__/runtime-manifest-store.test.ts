import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { load } from 'js-yaml';
import {
  getUserDataRuntimeManifestPath,
  materializeRuntimeManifestContent,
  readRuntimeManifestSection,
  resolveRuntimeManifestDataScopePath,
} from '../runtime-manifest-store.js';

describe('runtime manifest store data scope resolution', () => {
  it('uses userData/dev when hagicode_dev is the active desktop instance', () => {
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

  it('keeps the prod-compatible scope for non-dev instances', () => {
    assert.equal(
      resolveRuntimeManifestDataScopePath('/tmp/hagicode-user-data', {
        HAGICODE_DESKTOP_INSTANCE_NAME: 'hagicode_prod',
      }),
      '/tmp/hagicode-user-data',
    );
  });

  it('rewrites runtime and server data roots into the active data scope', () => {
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

    const parsed = load(materialized) as {
      paths: {
        runtimeDataRoot: string;
        serverProgramRoot: string;
        serverDataRoot: string;
      };
    };

    const runtimeDataRoot = path.join(homedir(), '.hagicode', 'runtime-data');
    assert.equal(parsed.paths.runtimeDataRoot, runtimeDataRoot);
    assert.equal(parsed.paths.serverProgramRoot, path.join(runtimeDataRoot, 'apps', 'installed'));
    assert.equal(parsed.paths.serverDataRoot, path.join(runtimeDataRoot, 'apps', 'data'));
  });

  it('surfaces the synthesized node optional policy in desktopRuntime', () => {
    const desktopRuntime = readRuntimeManifestSection<{
      components: {
        node: {
          optionalPolicy?: {
            rules: Array<{
              id?: string;
              dependencyManagementModes?: string[];
            }>;
          };
        };
      };
    }>('desktopRuntime');

    assert.deepEqual(desktopRuntime.components.node.optionalPolicy, {
      rules: [
        {
          id: 'external-managed',
          dependencyManagementModes: ['external-managed'],
        },
      ],
    });
  });
});
