import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  buildSnapshotLogLines,
  buildManagedServiceEnv,
  maskEnvValue,
  resolveEnvSnapshotLogLevel,
} from '../web-service-env.js';
import {
  buildDesktopSystemVaultEnv,
  SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX,
} from '../system-vault-env.js';
import {
  HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENV_KEY,
  normalizeSteamAchievementSyncEnvValue,
  resolveSteamIntegration,
} from '../steam-integration-env.js';
import {
  resolveManagedServerDataHome,
  resolveManagedServerDefaultDataDirectory,
  resolveManagedServerLogsDirectory,
} from '../managed-server-paths.js';

describe('web-service-env', () => {
  it('builds managed env vars with runtime and defaults', () => {
    const result = buildManagedServiceEnv({
      host: '127.0.0.1',
      port: 36556,
      dataDir: '/tmp/hagicode/data',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: null,
      existingEnv: {},
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.injectedEnv.ASPNETCORE_URLS, 'http://127.0.0.1:36556');
    assert.equal(result.injectedEnv.Urls, 'http://127.0.0.1:36556');
    assert.equal(result.injectedEnv.ServerData__Home, '/tmp/hagicode');
    assert.equal(result.injectedEnv.Database__Provider, undefined);
    assert.equal(result.injectedEnv.AI__Providers__DefaultProvider, 'ClaudeCodeCli');
    assert.equal(result.injectedEnv.HAGICODE_LANGUAGE, 'zh-CN');
    assert.equal(result.injectedEnv.HAGICODE_LOG_FORMAT, 'plain');
    assert.equal(result.injectedEnv.HAGICODE_STEAM_INTEGRATION_ENABLED, 'false');
    assert.equal(result.injectedEnv.HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENABLED, 'false');
    assert.equal(result.snapshot.some(entry => entry.key === 'Database__Provider'), false);
  });

  it('resolves Steam integration from distribution mode and hagicode env sync option', () => {
    const resolution = resolveSteamIntegration({
      distributionMode: 'steam',
      env: {
        [HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENV_KEY]: 'TRUE',
      },
    });

    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode/data',
      currentDesktopLanguage: 'zh-CN',
      steamIntegrationEnabled: resolution.integrationEnabled,
      steamIntegrationSource: 'distribution-mode',
      steamAchievementSyncEnabled: resolution.achievementSyncEnabled,
      steamAchievementSyncSource: resolution.achievementSyncSource,
      yamlConfig: null,
      existingEnv: {},
    });

    assert.equal(result.injectedEnv.HAGICODE_STEAM_INTEGRATION_ENABLED, 'true');
    assert.equal(result.injectedEnv.HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENABLED, 'true');
    assert.equal(
      result.snapshot.find(entry => entry.key === 'HAGICODE_STEAM_INTEGRATION_ENABLED')?.sourceConfig,
      'desktop Steam-mode detection (distributionMode=steam)',
    );
    assert.equal(
      result.snapshot.find(entry => entry.key === 'HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENABLED')?.sourceConfig,
      'Steam Mod hagicode.env HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENABLED',
    );
  });

  it('passes through disabled Steam Mod achievement sync option in Steam mode', () => {
    const resolution = resolveSteamIntegration({
      distributionMode: 'steam',
      env: {
        [HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENV_KEY]: 'false',
      },
    });

    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode/data',
      currentDesktopLanguage: 'zh-CN',
      steamIntegrationEnabled: resolution.integrationEnabled,
      steamIntegrationSource: 'distribution-mode',
      steamAchievementSyncEnabled: resolution.achievementSyncEnabled,
      steamAchievementSyncSource: resolution.achievementSyncSource,
      yamlConfig: null,
      existingEnv: {},
    });

    assert.equal(result.injectedEnv.HAGICODE_STEAM_INTEGRATION_ENABLED, 'true');
    assert.equal(result.injectedEnv.HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENABLED, 'false');
  });

  it('forces Steam flags disabled for non-Steam launches and ignores legacy external values', () => {
    const resolution = resolveSteamIntegration({
      distributionMode: 'normal',
      env: {
        [HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENV_KEY]: 'true',
      },
    });

    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode/data',
      currentDesktopLanguage: 'zh-CN',
      steamIntegrationEnabled: resolution.integrationEnabled,
      steamIntegrationSource: 'disabled-non-steam',
      steamAchievementSyncEnabled: resolution.achievementSyncEnabled,
      steamAchievementSyncSource: resolution.achievementSyncSource,
      yamlConfig: null,
      existingEnv: {
        HAGICODE_STEAM_INTEGRATION_ENABLED: 'true',
        HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENABLED: 'true',
      },
    });

    assert.equal(result.injectedEnv.HAGICODE_STEAM_INTEGRATION_ENABLED, 'false');
    assert.equal(result.injectedEnv.HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENABLED, 'false');
  });

  it('normalizes invalid Steam Mod achievement sync values to disabled', () => {
    assert.equal(normalizeSteamAchievementSyncEnvValue('yes'), null);

    const resolution = resolveSteamIntegration({
      distributionMode: 'steam',
      env: {
        [HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENV_KEY]: 'yes',
      },
    });

    assert.equal(resolution.integrationEnabled, true);
    assert.equal(resolution.achievementSyncEnabled, false);
    assert.equal(resolution.achievementSyncSource, 'invalid-hagicode-env');
  });

  it('injects TurboEngine DLC program options from the current desktop license state', () => {
    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode/data',
      currentDesktopLanguage: 'zh-CN',
      turboEngineDlcEnabled: true,
      turboEngineDlcSource: 'desktop-msstore-license',
      yamlConfig: null,
      existingEnv: {},
    });

    assert.equal(result.injectedEnv.DlcProgramOptions__TurboEngine__Enabled, 'true');
    assert.equal(result.injectedEnv.DlcProgramOptions__TurboEngine__Source, 'desktop-msstore-license');
    assert.equal(
      result.snapshot.find(entry => entry.key === 'DlcProgramOptions__TurboEngine__Enabled')?.sourceConfig,
      'desktop TurboEngine Microsoft Store license status',
    );
    assert.equal(
      result.snapshot.find(entry => entry.key === 'DlcProgramOptions__TurboEngine__Source')?.sourceConfig,
      'desktop TurboEngine Microsoft Store license source',
    );
  });

  it('does not leak inherited TurboEngine DLC overrides when desktop has no current license decision', () => {
    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode/data',
      currentDesktopLanguage: 'zh-CN',
      turboEngineDlcEnabled: null,
      turboEngineDlcSource: null,
      yamlConfig: null,
      existingEnv: {
        DlcProgramOptions__TurboEngine__Enabled: 'true',
        DlcProgramOptions__TurboEngine__Source: 'stale-shell-value',
      },
    });

    assert.equal(result.injectedEnv.DlcProgramOptions__TurboEngine__Enabled, undefined);
    assert.equal(result.injectedEnv.DlcProgramOptions__TurboEngine__Source, undefined);
    assert.match(result.warnings.join('\n'), /Ignored inherited DlcProgramOptions__TurboEngine__Enabled='true'/);
    assert.match(result.warnings.join('\n'), /Ignored inherited DlcProgramOptions__TurboEngine__Source='stale-shell-value'/);
  });

  it('injects wildcard and custom IPv4 bind hosts without rewriting them', () => {
    const wildcard = buildManagedServiceEnv({
      host: '0.0.0.0',
      port: 36556,
      dataDir: '/tmp/hagicode/data',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: null,
      existingEnv: {},
    });
    const custom = buildManagedServiceEnv({
      host: '192.168.1.24',
      port: 36556,
      dataDir: '/tmp/hagicode/data',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: null,
      existingEnv: {},
    });

    assert.equal(wildcard.injectedEnv.ASPNETCORE_URLS, 'http://0.0.0.0:36556');
    assert.equal(wildcard.injectedEnv.Urls, 'http://0.0.0.0:36556');
    assert.equal(wildcard.injectedEnv.ServerData__Home, '/tmp/hagicode');
    assert.equal(custom.injectedEnv.ASPNETCORE_URLS, 'http://192.168.1.24:36556');
    assert.equal(custom.injectedEnv.Urls, 'http://192.168.1.24:36556');
    assert.equal(custom.injectedEnv.ServerData__Home, '/tmp/hagicode');
  });

  it('derives server data home and companion managed paths from the legacy data root', () => {
    assert.equal(resolveManagedServerDataHome('/runtime/apps/data'), '/runtime/apps');
    assert.equal(resolveManagedServerDefaultDataDirectory('/runtime/apps'), '/runtime/apps/data');
    assert.equal(resolveManagedServerLogsDirectory('/runtime/apps/data'), '/runtime/apps/logs');
  });

  it('uses SQLite data file overrides from yaml when provided', () => {
    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 5000,
      dataDir: '/runtime/data',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: {
        Database: { Provider: 'postgresql' },
        ConnectionStrings: { Default: 'Data Source=/runtime/data/hagicode.db;Cache=Shared' },
        AI: { Service: { DefaultExecutorType: 'CodexCli' } },
      },
      existingEnv: {
        AI__Providers__DefaultProvider: 'CodexCli',
      },
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.injectedEnv.Database__Provider, undefined);
    assert.equal(result.injectedEnv.ConnectionStrings__Default, 'Data Source=/runtime/data/hagicode.db;Cache=Shared');
    assert.equal(result.injectedEnv.AI__Providers__DefaultProvider, 'CodexCli');
  });

  it('does not read AI executor from yaml when no electron setting exists', () => {
    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 5000,
      dataDir: '/runtime/data',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: {
        AI: { Service: { DefaultExecutorType: 'CodexCli' } },
      },
      existingEnv: {},
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.injectedEnv.AI__Providers__DefaultProvider, 'ClaudeCodeCli');
  });

  it('uses existing SQLite overrides over yaml for non-runtime keys', () => {
    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 5000,
      dataDir: '/runtime/data',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: {
        ConnectionStrings: { Default: 'Data Source=/yaml/hagicode.db' },
      },
      existingEnv: {
        ConnectionStrings__Default: 'Data Source=/env/hagicode.db',
      },
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.injectedEnv.ConnectionStrings__Default, 'Data Source=/env/hagicode.db');
  });

  it('ignores legacy PostgreSQL provider and connection string values', () => {
    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 5000,
      dataDir: '/runtime/data',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: {
        Database: { Provider: 'postgresql' },
        ConnectionStrings: { Default: 'Host=db;Database=hagicode;Username=postgres;Password=secret' },
      },
      existingEnv: {
        Database__Provider: 'postgresql',
        ConnectionStrings__Default: 'Host=legacy;Database=hagicode;Username=postgres;Password=secret',
      },
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.injectedEnv.Database__Provider, undefined);
    assert.equal(result.injectedEnv.ConnectionStrings__Default, undefined);
    assert.equal(
      result.warnings.some((warning) => warning.includes('Ignored unsupported SQLite override for ConnectionStrings__Default')),
      true,
    );
  });

  it('never injects deprecated GitHub OAuth env vars from legacy or existing env inputs', () => {
    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 5000,
      dataDir: '/runtime/data',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: {
        GitHub: {
          ClientId: 'legacy-client-id',
          ClientSecret: 'legacy-client-secret',
        },
      },
      existingEnv: {
        GitHub__ClientId: 'existing-client-id',
        GitHub__ClientSecret: 'existing-client-secret',
      },
    });

    assert.equal(result.injectedEnv.GitHub__ClientId, undefined);
    assert.equal(result.injectedEnv.GitHub__ClientSecret, undefined);
    assert.equal(result.snapshot.some(entry => entry.key.startsWith('GitHub__')), false);
  });

  it('normalizes the Desktop language for backend startup seeding and records Desktop as the source', () => {
    const chinese = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode/data',
      currentDesktopLanguage: 'zh-Hant',
      yamlConfig: null,
      existingEnv: {},
    });
    const english = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode/data',
      currentDesktopLanguage: 'en-US',
      yamlConfig: null,
      existingEnv: {},
    });
    const fallback = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode/data',
      currentDesktopLanguage: 'ja-JP',
      yamlConfig: null,
      existingEnv: {},
    });

    assert.equal(chinese.injectedEnv.HAGICODE_LANGUAGE, 'zh-CN');
    assert.equal(english.injectedEnv.HAGICODE_LANGUAGE, 'en-US');
    assert.equal(fallback.injectedEnv.HAGICODE_LANGUAGE, 'en-US');
    assert.equal(
      chinese.snapshot.find(entry => entry.key === 'HAGICODE_LANGUAGE')?.sourceConfig,
      'desktop language preference (zh-Hant -> zh-CN)',
    );
    assert.equal(
      english.snapshot.find(entry => entry.key === 'HAGICODE_LANGUAGE')?.sourceConfig,
      'desktop language preference (en-US)',
    );
    assert.equal(
      fallback.snapshot.find(entry => entry.key === 'HAGICODE_LANGUAGE')?.sourceConfig,
      'desktop language preference (ja-JP -> en-US)',
    );
  });

  it('ignores inherited or historical HAGICODE_LANGUAGE values and keeps the Desktop-managed value', () => {
    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode/data',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: null,
      existingEnv: {
        HAGICODE_LANGUAGE: 'invalid-locale',
      },
    });

    assert.equal(result.injectedEnv.HAGICODE_LANGUAGE, 'zh-CN');
    assert.equal(
      result.warnings.some((warning) => warning.includes("Ignored inherited HAGICODE_LANGUAGE='invalid-locale'")),
      true,
    );
  });

  it('masks generic sensitive env values in logs', () => {
    const masked = maskEnvValue('OPENAI_APIKEY', 'sk-test-secret');

    assert.equal(masked, '***');
  });

  it('builds sorted and masked snapshot log lines', () => {
    const lines = buildSnapshotLogLines([
      {
        key: 'ConnectionStrings__Default',
        value: 'Data Source=/runtime/data/hagicode.db;Cache=Shared',
        source: 'yaml',
        sourceConfig: 'ConnectionStrings.Default (SQLite data file override)',
        sensitive: true,
        defaultApplied: false,
      },
      {
        key: 'ASPNETCORE_URLS',
        value: 'http://localhost:36556',
        source: 'runtime',
        sourceConfig: 'webService.host + webService.port',
        sensitive: false,
        defaultApplied: false,
      },
    ], 'summary');

    assert.equal(lines.length, 2);
    assert.equal(lines[0].includes('ASPNETCORE_URLS'), true);
    assert.equal(lines[1].includes('ConnectionStrings__Default'), true);
    assert.equal(lines[1].includes('Data Source=/runtime/data/hagicode.db'), true);
  });

  it('resolves env snapshot log level with safe defaults', () => {
    assert.equal(resolveEnvSnapshotLogLevel(undefined), 'summary');
    assert.equal(resolveEnvSnapshotLogLevel('off'), 'off');
    assert.equal(resolveEnvSnapshotLogLevel('detailed'), 'detailed');
  });

  it('builds Desktop system-managed vault descriptors as hierarchical ASP.NET Core env keys', async () => {
    const ensuredPaths: string[] = [];
    const result = await buildDesktopSystemVaultEnv({
      pathResolver: {
        getDesktopLogsDirectory: () => '/tmp/hagicode/logs',
        getDesktopAppsRoot: () => '/tmp/hagicode/apps',
        getDesktopConfigDirectory: () => '/tmp/hagicode/config',
      },
      ensureDirectory: async targetPath => {
        ensuredPaths.push(targetPath);
      },
    });

    assert.equal(result.warnings.length, 0);
    assert.deepEqual(ensuredPaths, [
      '/tmp/hagicode/logs',
      '/tmp/hagicode/apps',
      '/tmp/hagicode/config',
    ]);
    assert.deepEqual(result.envEntries, {
      [`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__Id`]: 'desktoplogs',
      [`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__Name`]: 'Desktop Logs',
      [`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__PhysicalPath`]: '/tmp/hagicode/logs',
      [`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}1__Id`]: 'desktopapps',
      [`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}1__Name`]: 'Desktop Apps',
      [`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}1__PhysicalPath`]: '/tmp/hagicode/apps',
      [`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}2__Id`]: 'desktopconfig',
      [`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}2__Name`]: 'Desktop Config',
      [`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}2__PhysicalPath`]: '/tmp/hagicode/config',
    });
  });

  it('skips failing Desktop system-managed vault descriptors and keeps remaining env entries', async () => {
    const result = await buildDesktopSystemVaultEnv({
      pathResolver: {
        getDesktopLogsDirectory: () => '/tmp/hagicode/logs',
        getDesktopAppsRoot: () => '/tmp/hagicode/apps',
        getDesktopConfigDirectory: () => '/tmp/hagicode/config',
      },
      ensureDirectory: async targetPath => {
        if (targetPath === '/tmp/hagicode/apps') {
          throw new Error('permission denied');
        }
      },
    });

    assert.equal(result.descriptors.length, 2);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].includes('desktopapps'), true);
    assert.equal(result.envEntries[`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__Id`], 'desktoplogs');
    assert.equal(result.envEntries[`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}1__Id`], 'desktopconfig');
    assert.equal(result.envEntries[`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}2__Id`], undefined);
  });

  it('omits Desktop system-managed env injection when every descriptor fails', async () => {
    const systemVaultEnv = await buildDesktopSystemVaultEnv({
      pathResolver: {
        getDesktopLogsDirectory: () => '/tmp/hagicode/logs',
        getDesktopAppsRoot: () => '/tmp/hagicode/apps',
        getDesktopConfigDirectory: () => '/tmp/hagicode/config',
      },
      ensureDirectory: async () => {
        throw new Error('disk offline');
      },
    });

    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode/data',
      systemVaultEnvEntries: systemVaultEnv.envEntries,
      yamlConfig: null,
      existingEnv: {},
    });

    assert.equal(systemVaultEnv.descriptors.length, 0);
    assert.equal(Object.keys(systemVaultEnv.envEntries).length, 0);
    assert.equal(
      Object.keys(result.injectedEnv).some(key => key.startsWith(SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX)),
      false,
    );
  });

  it('injects managed env vars into child process spawn environment', () => {
    const buildResult = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode-integration/data',
      currentDesktopLanguage: 'en-US',
      systemVaultEnvEntries: {
        [`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__Id`]: 'desktoplogs',
        [`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__Name`]: 'Desktop Logs',
        [`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__PhysicalPath`]: '/tmp/hagicode/logs',
      },
      yamlConfig: {
        Database: { Provider: 'sqlite' },
        AI: { Service: { DefaultExecutorType: 'CodexCli' } },
      },
      existingEnv: {},
    });

    assert.equal(buildResult.errors.length, 0);
    const env = { ...process.env, ...buildResult.injectedEnv };
    delete env.DATADIR;
    delete env.DataDir;
    assert.equal(process.env[`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__Id`], undefined);
    const child = spawnSync(process.execPath, [
      '-e',
      `process.stdout.write([
        process.env.ASPNETCORE_URLS,
        process.env.Urls,
        process.env.ServerData__Home,
        process.env.DATADIR,
        process.env.HAGICODE_LANGUAGE,
        process.env.AI__Providers__DefaultProvider,
        process.env.${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__Id,
        process.env.${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__PhysicalPath
      ].join('|'))`,
    ], { env, encoding: 'utf-8' });

    assert.equal(child.status, 0);
    assert.equal(
      child.stdout,
      'http://localhost:36556|http://localhost:36556|/tmp/hagicode-integration||en-US|ClaudeCodeCli|desktoplogs|/tmp/hagicode/logs',
    );
  });

  it('covers migration and rollback scenarios', () => {
    // Migration scenario: legacy provider fields no longer expand the supported env surface.
    const migrated = buildManagedServiceEnv({
      host: 'localhost',
      port: 5000,
      dataDir: '/tmp/hagicode-migrate/data',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: {
        Database: { Provider: 'postgresql' },
        ConnectionStrings: { Default: 'Data Source=/tmp/hagicode-migrate/data/hagicode.db' },
        AI: { Service: { DefaultExecutorType: 'ClaudeCodeCli' } },
      },
      existingEnv: {},
    });
    assert.equal(migrated.errors.length, 0);
    assert.equal(migrated.injectedEnv.Database__Provider, undefined);
    assert.equal(migrated.injectedEnv.ConnectionStrings__Default, 'Data Source=/tmp/hagicode-migrate/data/hagicode.db');

    // Error branch: oversized required env values should fail validation.
    const invalid = buildManagedServiceEnv({
      host: '',
      port: 0,
      dataDir: '',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: null,
      existingEnv: {
        HAGICODE_LOG_FORMAT: 'x'.repeat(40000),
      },
    });
    assert.ok(invalid.errors.length > 0);
  });
});
