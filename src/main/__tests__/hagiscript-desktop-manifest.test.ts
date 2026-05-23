import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DESKTOP_HAGISCRIPT_DEV_INSTANCE_NAME,
  buildDesktopHagiscriptRuntimeManifest,
  DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
  DESKTOP_HAGISCRIPT_OMNIROUTE_BASE_APP_NAME,
  DESKTOP_HAGISCRIPT_CODE_SERVER_BASE_APP_NAME,
  DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV,
  DESKTOP_HAGISCRIPT_PROD_INSTANCE_NAME,
  DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME,
  DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR,
  DESKTOP_HAGISCRIPT_SERVER_RUNTIME_FILES_DIR,
  resolveDesktopHagiscriptInstanceName,
  resolveDesktopManagedPm2AppName,
} from '../hagiscript-desktop-manifest.js';

describe('hagiscript desktop manifest builder', () => {
  it('builds the full four-directory Desktop manifest when a server payload is provided', () => {
    const manifest = buildDesktopHagiscriptRuntimeManifest({
      runtimeRoot: '/tmp/hagicode-user-data',
      runtimeHome: '/opt/HagiCode/resources/extra/runtime',
      runtimeDataRoot: '/tmp/hagicode-user-data/runtimeData',
      serverProgramRoot: '/tmp/hagicode-user-data/apps/installed',
      serverDataRoot: '/tmp/hagicode-user-data/apps/data',
      npmPrefix: '/tmp/hagicode-user-data/runtimeData/node/node22/npmGlobal',
      hagiscriptPackageRoot: '/opt/hagiscript',
      dotnetRuntimeRoot: '/opt/HagiCode/resources/extra/runtime/components/dotnet/runtime/linux-x64',
      dotnetPlatform: 'linux-x64',
      codeServerPlatform: 'linux-x64',
      omniRoutePlatform: 'linux-x64',
      server: {
        servicePayloadPath: '/tmp/hagicode-active/lib/PCode.Web.dll',
        serviceWorkingDirectory: '/tmp/hagicode-active/lib',
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

    assert.equal(manifest.paths.runtimeDataRoot, '/tmp/hagicode-user-data/runtimeData');
    assert.equal(manifest.paths.serverProgramRoot, '/tmp/hagicode-user-data/apps/installed');
    assert.equal(manifest.paths.serverDataRoot, '/tmp/hagicode-user-data/apps/data');
    assert.equal(
      manifest.paths.componentDataRoot,
      '/tmp/hagicode-user-data/runtimeData/components',
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
    assert.ok(serverComponent);
    assert.deepEqual(serverComponent.lifecycleDependencies, [
      DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
      'dotnet/runtime/linux-x64',
    ]);
    assert.equal((serverComponent.pm2 as { pm2Home?: string }).pm2Home, DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR);
    assert.equal(
      (serverComponent.pm2 as { nameIdentifierEnv?: string }).nameIdentifierEnv,
      DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV,
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
    assert.deepEqual(
      Object.keys((manifest as { npmSync?: { packages: Record<string, unknown> } }).npmSync?.packages ?? {}),
      ['@anthropic-ai/claude-code', '@fission-ai/openspec', '@openai/codex', 'impeccable', 'skills'],
    );

    const bundledPm2Definitions = manifest.components
      .filter((component) => component.name === 'omniroute' || component.name === 'code-server')
      .map((component) => (component.pm2 as { nameIdentifierEnv?: string }).nameIdentifierEnv);
    assert.deepEqual(
      bundledPm2Definitions,
      [DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV, DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV],
    );
    assert.deepEqual(
      manifest.components
        .filter((component) => component.name === 'omniroute' || component.name === 'code-server')
        .map((component) => component.runtimeDataDir),
      ['services/omniroute', 'services/code-server'],
    );
    assert.deepEqual(
      manifest.components
        .filter((component) => component.name === 'omniroute' || component.name === 'code-server')
        .map((component) => (component.pm2 as { appName?: string }).appName),
      [DESKTOP_HAGISCRIPT_OMNIROUTE_BASE_APP_NAME, DESKTOP_HAGISCRIPT_CODE_SERVER_BASE_APP_NAME],
    );
  });

  it('applies bundled runtime overrides for OmniRoute PM2 metadata and runtime-data directory', () => {
    const manifest = buildDesktopHagiscriptRuntimeManifest({
      runtimeRoot: '/tmp/hagicode-user-data',
      runtimeHome: '/opt/HagiCode/resources/extra/runtime',
      runtimeDataRoot: '/tmp/hagicode-user-data/runtimeData',
      serverProgramRoot: '/tmp/hagicode-user-data/apps/installed',
      serverDataRoot: '/tmp/hagicode-user-data/apps/data',
      npmPrefix: '/tmp/hagicode-user-data/runtimeData/node/node22/npmGlobal',
      hagiscriptPackageRoot: '/opt/hagiscript',
      dotnetPlatform: 'linux-x64',
      codeServerPlatform: 'linux-x64',
      omniRoutePlatform: 'linux-x64',
      bundledRuntimeOverrides: {
        omniroute: {
          runtimeDataDir: 'services/custom-omniroute',
          pm2: {
            appName: 'custom-omniroute',
            cwd: '/opt/custom-omniroute/current',
            script: '/opt/custom-omniroute/current/bin/omniroute.mjs',
            args: ['--no-open', '--desktop-test'],
            pm2Home: '/tmp/hagicode-user-data/runtimeData/components/services/custom-omniroute/pm2/7',
            env: { OMNIROUTE_DESKTOP_MANAGED: 'true' },
          },
        },
      },
    }) as {
      components: Array<Record<string, unknown>>;
    };

    const omniRouteComponent = manifest.components.find(
      (component) => component.name === 'omniroute',
    ) as Record<string, unknown> | undefined;
    assert.ok(omniRouteComponent);
    assert.equal(omniRouteComponent.runtimeDataDir, 'services/custom-omniroute');
    assert.deepEqual(omniRouteComponent.pm2, {
      appName: 'custom-omniroute',
      nameIdentifierEnv: DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV,
      cwd: '/opt/custom-omniroute/current',
      script: '/opt/custom-omniroute/current/bin/omniroute.mjs',
      args: ['--no-open', '--desktop-test'],
      pm2Home: '/tmp/hagicode-user-data/runtimeData/components/services/custom-omniroute/pm2/7',
      env: { OMNIROUTE_DESKTOP_MANAGED: 'true' },
    });
  });

  it('keeps the runtime-only staging manifest free of the server component when no payload is supplied', () => {
    const manifest = buildDesktopHagiscriptRuntimeManifest({
      runtimeRoot: '.',
      runtimeHome: '.',
      runtimeDataRoot: '../runtime-data',
      serverProgramRoot: '../apps/installed',
      serverDataRoot: '../apps/data',
      npmPrefix: 'npm',
      hagiscriptPackageRoot: '/opt/hagiscript',
      dotnetPlatform: 'linux-x64',
      codeServerPlatform: 'linux-x64',
      omniRoutePlatform: 'linux-x64',
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
      runtimeDataRoot: '/tmp/hagicode-user-data/runtimeData',
      serverProgramRoot: '/tmp/hagicode-user-data/apps/installed',
      serverDataRoot: '/tmp/hagicode-user-data/apps/data',
      npmPrefix: '/tmp/hagicode-user-data/runtimeData/node/node22/npmGlobal',
      hagiscriptPackageRoot: '/opt/hagiscript',
      dotnetRuntimeRoot: '/opt/HagiCode/resources/extra/runtime/components/dotnet/runtime/linux-x64',
      dotnetPlatform: 'linux-x64',
      codeServerPlatform: 'linux-x64',
      omniRoutePlatform: 'linux-x64',
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
      resolveDesktopManagedPm2AppName(DESKTOP_HAGISCRIPT_OMNIROUTE_BASE_APP_NAME, { NODE_ENV: 'production' }),
      'hagicode-omniroute-hagicode_prod',
    );
    assert.equal(
      resolveDesktopManagedPm2AppName(DESKTOP_HAGISCRIPT_OMNIROUTE_BASE_APP_NAME, { NODE_ENV: 'development' }),
      'hagicode-omniroute-hagicode_dev',
    );
    assert.equal(
      resolveDesktopManagedPm2AppName(DESKTOP_HAGISCRIPT_CODE_SERVER_BASE_APP_NAME, { HAGICODE_DESKTOP_INSTANCE_NAME: 'custom_instance' }),
      'hagicode-code-server-custom_instance',
    );
  });
});
