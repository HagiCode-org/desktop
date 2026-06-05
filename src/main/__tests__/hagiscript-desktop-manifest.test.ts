import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DESKTOP_HAGISCRIPT_DEV_INSTANCE_NAME,
  buildDesktopHagiscriptRuntimeManifest,
  DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
  DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV,
  DESKTOP_HAGISCRIPT_PROD_INSTANCE_NAME,
  DESKTOP_HAGISCRIPT_SERVER_BASE_APP_NAME,
  DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME,
  DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR,
  DESKTOP_HAGISCRIPT_SERVER_RUNTIME_FILES_DIR,
  resolveDesktopHagiscriptInstanceName,
  resolveDesktopManagedPm2AppName,
} from '../hagiscript-desktop-manifest.js';

describe('hagiscript desktop manifest builder', () => {
  it('builds the full Desktop manifest when a server payload is provided', () => {
    const manifest = buildDesktopHagiscriptRuntimeManifest({
      runtimeRoot: '/tmp/hagicode-user-data',
      runtimeHome: '/opt/HagiCode/resources/extra/runtime',
      runtimeDataRoot: '/tmp/home/.hagicode/runtime-data',
      serverProgramRoot: '/tmp/home/.hagicode/runtime-data/apps/installed',
      serverDataRoot: '/tmp/home/.hagicode/runtime-data/apps/data',
      npmPrefix: '/tmp/home/.hagicode/runtime-data/node/node22/npmGlobal',
      dotnetRuntimeRoot: '/opt/HagiCode/resources/extra/runtime/components/dotnet/runtime/linux-x64',
      dotnetPlatform: 'linux-x64',
      server: {
        servicePayloadPath: '/tmp/hagicode-active/lib/PCode.Web.dll',
        serviceWorkingDirectory: '/tmp/hagicode-active/lib',
        startScript: '/opt/HagiCode/PsfLauncher64.exe',
        launcherArgs: ['--hagicode-managed-server-launcher'],
        serviceEnv: {
          ASPNETCORE_URLS: 'http://127.0.0.1:36556',
        },
        activeVersion: 'hagicode-0.1.0-linux-x64-nort',
      },
    }) as {
      runtime: { hagicodeInstance?: string };
      paths: Record<string, string>;
      phases: Record<string, { order: string[] }>;
      components: Array<Record<string, unknown>>;
    };

    assert.equal(manifest.paths.runtimeDataRoot, '/tmp/home/.hagicode/runtime-data');
    assert.equal(manifest.paths.serverProgramRoot, '/tmp/home/.hagicode/runtime-data/apps/installed');
    assert.equal(manifest.paths.serverDataRoot, '/tmp/home/.hagicode/runtime-data/apps/data');
    assert.equal(
      manifest.paths.componentDataRoot,
      '/tmp/home/.hagicode/runtime-data/components',
    );
    assert.deepEqual(manifest.phases.install.order.slice(0, 3), [
      DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
      'dotnet/runtime/linux-x64',
      DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME,
    ]);
    assert.equal(
      manifest.runtime.hagicodeInstance,
      DESKTOP_HAGISCRIPT_PROD_INSTANCE_NAME,
    );

    const serverComponent = manifest.components.find(
      (component) => component.name === DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME,
    ) as Record<string, unknown> | undefined;
    const nodeComponent = manifest.components.find(
      (component) => component.name === DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
    ) as Record<string, unknown> | undefined;
    assert.ok(nodeComponent);
    assert.ok(serverComponent);
    assert.equal(nodeComponent.optionalPolicy, undefined);
    assert.deepEqual(serverComponent.lifecycleDependencies, [
      DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
      'dotnet/runtime/linux-x64',
    ]);
    assert.equal(
      (serverComponent.pm2 as { pm2Home?: string }).pm2Home,
      '/tmp/home/.hagicode/runtime-data/pm2',
    );
    assert.equal(
      (serverComponent.pm2 as { nameIdentifierEnv?: string }).nameIdentifierEnv,
      DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV,
    );
    assert.deepEqual(
      (serverComponent.pm2 as { args?: string[] }).args,
      ['--hagicode-managed-server-launcher'],
    );
    assert.equal(
      (serverComponent.pm2 as { env?: Record<string, string> }).env?.[DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV],
      undefined,
    );
    assert.equal(
      (serverComponent.releasedService as { runtimeFilesDir?: string }).runtimeFilesDir,
      DESKTOP_HAGISCRIPT_SERVER_RUNTIME_FILES_DIR,
    );
    assert.equal(
      (serverComponent.releasedService as { activeVersion?: string }).activeVersion,
      'hagicode-0.1.0-linux-x64-nort',
    );
    assert.equal(
      (serverComponent.releasedService as { startScript?: string }).startScript,
      '/opt/HagiCode/PsfLauncher64.exe',
    );
    assert.deepEqual(
      Object.keys((manifest as { npmSync?: { packages: Record<string, unknown> } }).npmSync?.packages ?? {}),
      [
        '@anthropic-ai/claude-code',
        '@github/copilot',
        '@google/gemini-cli',
        '@qoder-ai/qodercli',
        '@tencent-ai/codebuddy-code',
        '@fission-ai/openspec',
        '@openai/codex',
        'impeccable',
        'opencode-ai',
        'skills',
      ],
    );
  });

  it('keeps the runtime-only staging manifest free of the server component when no payload is supplied', () => {
    const manifest = buildDesktopHagiscriptRuntimeManifest({
      runtimeRoot: '.',
      runtimeHome: '.',
      runtimeDataRoot: '../runtime-data',
      serverProgramRoot: '../apps/installed',
      serverDataRoot: '../apps/data',
      npmPrefix: 'npm',
      dotnetPlatform: 'linux-x64',
    }) as {
      runtime: { hagicodeInstance?: string };
      components: Array<Record<string, unknown>>;
    };

    assert.equal(
      manifest.components.some(
        (component) => component.name === DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME,
      ),
      false,
    );
    assert.equal(
      manifest.runtime.hagicodeInstance,
      DESKTOP_HAGISCRIPT_PROD_INSTANCE_NAME,
    );
  });

  it('drops hagicode_instance from server pm2 env because runtime.hagicodeInstance is authoritative', () => {
    const manifest = buildDesktopHagiscriptRuntimeManifest({
      runtimeRoot: '/tmp/hagicode-user-data',
      runtimeHome: '/opt/HagiCode/resources/extra/runtime',
      runtimeDataRoot: '/tmp/home/.hagicode/runtime-data',
      serverProgramRoot: '/tmp/home/.hagicode/runtime-data/apps/installed',
      serverDataRoot: '/tmp/home/.hagicode/runtime-data/apps/data',
      npmPrefix: '/tmp/home/.hagicode/runtime-data/node/node22/npmGlobal',
      dotnetRuntimeRoot: '/opt/HagiCode/resources/extra/runtime/components/dotnet/runtime/linux-x64',
      dotnetPlatform: 'linux-x64',
      server: {
        servicePayloadPath: '/tmp/hagicode-active/lib/PCode.Web.dll',
        serviceWorkingDirectory: '/tmp/hagicode-active/lib',
        serviceEnv: {
          [DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV]: 'hagicode-secondary',
        },
      },
    }) as {
      components: Array<Record<string, unknown>>;
    };

    const serverComponent = manifest.components.find(
      (component) => component.name === DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME,
    ) as Record<string, unknown> | undefined;
    assert.ok(serverComponent);
    assert.equal(
      (serverComponent.pm2 as { env?: Record<string, string> }).env?.[DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV],
      undefined,
    );
  });

  it('resolves hagicode_dev during development', () => {
    assert.equal(
      resolveDesktopHagiscriptInstanceName({ NODE_ENV: 'development' }),
      DESKTOP_HAGISCRIPT_DEV_INSTANCE_NAME,
    );
  });

  it('prefers an explicit desktop instance override', () => {
    assert.equal(
      resolveDesktopHagiscriptInstanceName({
        NODE_ENV: 'development',
        HAGICODE_DESKTOP_INSTANCE_NAME: 'custom_instance',
      }),
      'custom_instance',
    );
  });

  it('derives Desktop-managed PM2 app names from the shared instance contract', () => {
    assert.equal(
      resolveDesktopManagedPm2AppName(DESKTOP_HAGISCRIPT_SERVER_BASE_APP_NAME, { NODE_ENV: 'production' }),
      'hagicode-server-hagicode_prod',
    );
    assert.equal(
      resolveDesktopManagedPm2AppName(DESKTOP_HAGISCRIPT_SERVER_BASE_APP_NAME, { NODE_ENV: 'development' }),
      'hagicode-server-hagicode_dev',
    );
    assert.equal(
      resolveDesktopManagedPm2AppName(DESKTOP_HAGISCRIPT_SERVER_BASE_APP_NAME, { HAGICODE_DESKTOP_INSTANCE_NAME: 'custom_instance' }),
      'hagicode-server-custom_instance',
    );
  });
});
