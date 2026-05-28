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
  resolveWebServiceConfigMode,
} from '../web-service-env.js';
import {
  buildDesktopSystemVaultEnv,
  SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX,
} from '../system-vault-env.js';
import {
  resolveBundledNodeRuntimePolicy,
  parseBundledNodeRuntimeOverride,
} from '../bundled-node-runtime-policy.js';
import {
  collectPortableToolchainPathEntries,
  dedupePathEntries,
  injectCodeServerRuntimeEnv,
  injectManagedCliPathEnv,
  injectPortableToolchainEnv,
  resolveManagedCliCommandDirectory,
  resolvePathEnvKey,
} from '../portable-toolchain-env.js';
import {
  HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENV_KEY,
  normalizeSteamAchievementSyncEnvValue,
  resolveSteamIntegration,
} from '../steam-integration-env.js';

describe('web-service-env', () => {
  it('builds managed env vars with runtime and defaults', () => {
    const result = buildManagedServiceEnv({
      host: '127.0.0.1',
      port: 36556,
      dataDir: '/tmp/hagicode-data',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: null,
      existingEnv: {},
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.injectedEnv.ASPNETCORE_URLS, 'http://127.0.0.1:36556');
    assert.equal(result.injectedEnv.Urls, 'http://127.0.0.1:36556');
    assert.equal(result.injectedEnv.DATADIR, '/tmp/hagicode-data');
    assert.equal(result.injectedEnv.Database__Provider, undefined);
    assert.equal(result.injectedEnv.AI__Providers__DefaultProvider, 'ClaudeCodeCli');
    assert.equal(result.injectedEnv.HAGICODE_LANGUAGE, 'zh-CN');
    assert.equal(result.injectedEnv.HAGICODE_LOG_FORMAT, 'plain');
    assert.equal(result.injectedEnv.HAGICODE_STEAM_INTEGRATION_ENABLED, 'false');
    assert.equal(result.injectedEnv.HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENABLED, 'false');
    assert.equal(result.snapshot.some(entry => entry.key === 'Database__Provider'), false);
  });

  it('injects desktop-managed code-server bootstrap settings for the backend child process', () => {
    const result = buildManagedServiceEnv({
      host: '127.0.0.1',
      port: 36556,
      dataDir: '/tmp/hagicode-data',
      currentDesktopLanguage: 'zh-CN',
      codeServer: {
        host: '127.0.0.1',
        port: 37667,
        password: 'desktop-secret',
      },
      yamlConfig: null,
      existingEnv: {
        VsCodeServer__Host: 'legacy-host',
        VsCodeServer__Port: '3000',
      },
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.injectedEnv.VsCodeServer__Host, '127.0.0.1');
    assert.equal(result.injectedEnv.VsCodeServer__Port, '37667');
    assert.equal(result.injectedEnv.VsCodeServer__AuthMode, 'password');
    assert.equal(result.injectedEnv.VsCodeServer__Secret, 'desktop-secret');
    assert.equal(result.injectedEnv.VsCodeServer__SecretSource, 'bootstrap');
    assert.equal(result.injectedEnv.VsCodeServer__Source, 'desktop-managed');
    assert.equal(result.injectedEnv.VsCodeServer__SourceLocked, 'true');
  });

  it('injects desktop-managed OmniRoute bootstrap settings for the backend child process', () => {
    const result = buildManagedServiceEnv({
      host: '127.0.0.1',
      port: 36556,
      dataDir: '/tmp/hagicode-data',
      currentDesktopLanguage: 'zh-CN',
      omniRoute: {
        apiEndpoint: 'http://localhost:36988',
      },
      yamlConfig: null,
      existingEnv: {
        OmniRoute__DefaultBaseUrl: 'http://legacy-host:3000',
      },
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.injectedEnv.OmniRoute__DefaultBaseUrl, 'http://localhost:36988');
    assert.equal(result.injectedEnv.OmniRoute__DefaultBaseUrlSource, 'desktop-managed');
    assert.equal(result.injectedEnv.OmniRoute__DefaultBaseUrlLocked, 'true');
  });

  it('injects bundled Node PATH entries only for vendored code-server launches', () => {
    const result = injectCodeServerRuntimeEnv(
      {
        PATH: '/usr/bin:/bin',
      },
      {
        getPortableToolchainRoot: () => '/managed/toolchain',
        getPortableToolchainBinRoot: () => '/managed/toolchain/bin',
        getPortableNodeBinRoot: () => '/managed/toolchain/node/bin',
        getPortableNpmGlobalBinRoot: () => '/managed/toolchain/npm-global/bin',
        getCodeServerRuntimeRoot: () => '/tmp/Hagi Code/userData/runtimeData/runtimeComponents/code_server/4.99.0/current',
      },
      {
        platform: 'linux',
        existsSync: () => true,
      },
    );

    assert.equal(result.runtimeRoot, '/tmp/Hagi Code/userData/runtimeData/runtimeComponents/code_server/4.99.0/current');
    assert.equal(result.env.HAGICODE_CODE_SERVER_RUNTIME_ROOT, '/tmp/Hagi Code/userData/runtimeData/runtimeComponents/code_server/4.99.0/current');
    assert.equal(result.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT, '/managed/toolchain');
    assert.match(result.env.PATH || '', /^\/managed\/toolchain\/bin:\/managed\/toolchain\/node\/bin:\/managed\/toolchain\/npm-global\/bin:/);
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
      dataDir: '/tmp/hagicode-data',
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
      dataDir: '/tmp/hagicode-data',
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
      dataDir: '/tmp/hagicode-data',
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

  it('injects wildcard and custom IPv4 bind hosts without rewriting them', () => {
    const wildcard = buildManagedServiceEnv({
      host: '0.0.0.0',
      port: 36556,
      dataDir: '/tmp/hagicode-data',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: null,
      existingEnv: {},
    });
    const custom = buildManagedServiceEnv({
      host: '192.168.1.24',
      port: 36556,
      dataDir: '/tmp/hagicode-data',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: null,
      existingEnv: {},
    });

    assert.equal(wildcard.injectedEnv.ASPNETCORE_URLS, 'http://0.0.0.0:36556');
    assert.equal(wildcard.injectedEnv.Urls, 'http://0.0.0.0:36556');
    assert.equal(custom.injectedEnv.ASPNETCORE_URLS, 'http://192.168.1.24:36556');
    assert.equal(custom.injectedEnv.Urls, 'http://192.168.1.24:36556');
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
      dataDir: '/tmp/hagicode-data',
      currentDesktopLanguage: 'zh-Hant',
      yamlConfig: null,
      existingEnv: {},
    });
    const english = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode-data',
      currentDesktopLanguage: 'en-US',
      yamlConfig: null,
      existingEnv: {},
    });
    const fallback = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode-data',
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
      dataDir: '/tmp/hagicode-data',
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

  it('resolves config mode and log level with safe defaults', () => {
    assert.equal(resolveWebServiceConfigMode(undefined), 'env');
    assert.equal(resolveWebServiceConfigMode('legacy-yaml'), 'legacy-yaml');
    assert.equal(resolveWebServiceConfigMode('yaml'), 'legacy-yaml');

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
      dataDir: '/tmp/hagicode-data',
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
      dataDir: '/tmp/hagicode-integration',
      currentDesktopLanguage: 'en-US',
      codeServer: {
        host: '127.0.0.1',
        port: 37667,
        password: 'desktop-secret',
      },
      omniRoute: {
        apiEndpoint: 'http://localhost:36988',
      },
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
    assert.equal(process.env[`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__Id`], undefined);
    const child = spawnSync(process.execPath, [
      '-e',
      `process.stdout.write([
        process.env.ASPNETCORE_URLS,
        process.env.Urls,
        process.env.DATADIR,
        process.env.HAGICODE_LANGUAGE,
        process.env.AI__Providers__DefaultProvider,
        process.env.VsCodeServer__Host,
        process.env.VsCodeServer__Port,
        process.env.VsCodeServer__AuthMode,
        process.env.VsCodeServer__Source,
        process.env.VsCodeServer__SourceLocked,
        process.env.OmniRoute__DefaultBaseUrl,
        process.env.OmniRoute__DefaultBaseUrlSource,
        process.env.OmniRoute__DefaultBaseUrlLocked,
        process.env.${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__Id,
        process.env.${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__PhysicalPath
      ].join('|'))`,
    ], { env, encoding: 'utf-8' });

    assert.equal(child.status, 0);
    assert.equal(
      child.stdout,
      'http://localhost:36556|http://localhost:36556|/tmp/hagicode-integration|en-US|ClaudeCodeCli|127.0.0.1|37667|password|desktop-managed|true|http://localhost:36988|desktop-managed|true|desktoplogs|/tmp/hagicode/logs',
    );
  });

  it('keeps the inherited PATH untouched when no managed CLI command directory is available for managed server startup', () => {
    const runtimeEnv = {
      PATH: '/system/bin',
      HOME: '/tmp/home',
      DOTNET_ROOT: '/portable/dotnet',
      DOTNET_MULTILEVEL_LOOKUP: '0',
      HAGICODE_DOTNET_EXE: '/portable/dotnet/dotnet',
      NODE_PATH: '/system/node_modules',
      NODE: '/portable/toolchain/node/bin/node',
      npm_node_execpath: '/portable/toolchain/node/bin/node',
      npm_execpath: '/portable/toolchain/node/lib/node_modules/npm/bin/npm-cli.js',
      HAGICODE_PORTABLE_TOOLCHAIN_ROOT: '/portable/toolchain',
      HAGICODE_NPM_GLOBAL_PREFIX: '/userData/runtimeData/node/node22/npmGlobal',
    };
    const result = injectManagedCliPathEnv(runtimeEnv, {
      platform: 'linux',
    });

    assert.equal(runtimeEnv.PATH, '/system/bin');
    assert.equal(runtimeEnv.DOTNET_ROOT, '/portable/dotnet');
    assert.equal(runtimeEnv.DOTNET_MULTILEVEL_LOOKUP, '0');
    assert.equal(runtimeEnv.HAGICODE_DOTNET_EXE, '/portable/dotnet/dotnet');
    assert.equal(result.env.PATH, '/system/bin');
    assert.equal(result.env.HAGICODE_DOTNET_EXE, '/portable/dotnet/dotnet');
    assert.equal(result.env.HAGICODE_AGENT_CLI_PATH, undefined);
    assert.equal(result.env.HAGICODE_NPM_GLOBAL_PATH, undefined);
    assert.equal(result.env.NODE_PATH, undefined);
    assert.equal(result.env.NODE, undefined);
    assert.equal(result.env.npm_execpath, undefined);
    assert.equal(result.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT, undefined);
    assert.equal(runtimeEnv.PATH, '/system/bin');
  });

  it('prepends portable toolchain paths in deterministic order and injects the marker env', () => {
    const baseEnv = {
      PATH: '/system/bin',
      HOME: '/tmp/home',
    };
    const result = injectPortableToolchainEnv(baseEnv, {
      getPortableToolchainRoot: () => '/portable/toolchain',
      getPortableToolchainBinRoot: () => '/portable/toolchain/bin',
      getPortableNodeBinRoot: () => '/portable/toolchain/node/bin',
      getPortableNpmGlobalBinRoot: () => '/portable/toolchain/node/bin',
    }, {
      platform: 'linux',
      existsSync: () => true,
    });

    assert.equal(result.pathKey, 'PATH');
    assert.equal(
      result.env.PATH,
      '/portable/toolchain/bin:/portable/toolchain/node/bin:/system/bin',
    );
    assert.equal(result.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT, '/portable/toolchain');
    assert.equal(baseEnv.PATH, '/system/bin');
    assert.equal(result.usedBundledToolchain, true);
    assert.equal(result.fellBackToSystemPath, false);
  });

  it('injects Node-major npm global PATH, NODE_PATH, and diagnostic markers for child processes only', () => {
    const baseEnv = {
      PATH: '/system/bin',
      NODE_PATH: '/system/node_modules',
    };
    const npmGlobalPaths = {
      nodeVersion: '22.12.0',
      nodeMajorVersion: '22',
      npmGlobalPrefix: '/userData/runtimeData/node/node22/npmGlobal',
      npmGlobalBinRoot: '/userData/runtimeData/node/node22/npmGlobal/bin',
      npmGlobalModulesRoot: '/userData/runtimeData/node/node22/npmGlobal/lib/node_modules',
      npmCacheRoot: '/userData/runtimeData/node/node22/npmCache',
    };
    const result = injectPortableToolchainEnv(baseEnv, {
      getPortableToolchainRoot: () => '/portable/toolchain',
      getPortableToolchainBinRoot: () => '/portable/toolchain/bin',
      getPortableNodeBinRoot: () => '/portable/toolchain/node/bin',
      getPortableNpmGlobalBinRoot: () => '/portable/toolchain/node/bin',
    }, {
      platform: 'linux',
      existsSync: target => target !== '/userData/runtimeData/node/node22/npmGlobal/bin',
      npmGlobalPaths,
    });

    assert.equal(
      result.env.PATH,
      '/portable/toolchain/bin:/portable/toolchain/node/bin:/userData/runtimeData/node/node22/npmGlobal/bin:/system/bin',
    );
    assert.equal(result.env.NODE_PATH, '/userData/runtimeData/node/node22/npmGlobal/lib/node_modules:/system/node_modules');
    assert.equal(result.env.HAGICODE_NPM_GLOBAL_PREFIX, '/userData/runtimeData/node/node22/npmGlobal');
    assert.equal(result.env.HAGICODE_NPM_GLOBAL_BIN_ROOT, '/userData/runtimeData/node/node22/npmGlobal/bin');
    assert.equal(result.env.HAGICODE_NPM_GLOBAL_MODULES_ROOT, '/userData/runtimeData/node/node22/npmGlobal/lib/node_modules');
    assert.equal(result.env.HAGICODE_NODE_MAJOR_VERSION, '22');
    assert.equal(baseEnv.PATH, '/system/bin');
    assert.equal(baseEnv.NODE_PATH, '/system/node_modules');
  });

  it('prepends the managed POSIX CLI command directory and removes Node/npm marker vars for managed server startup', () => {
    const baseEnv = {
      PATH: '/system/bin:/userData/runtimeData/node/node22/npmGlobal/bin:/usr/local/bin',
      NODE_PATH: '/system/node_modules',
      NODE: '/portable/toolchain/node/bin/node',
      npm_node_execpath: '/portable/toolchain/node/bin/node',
      npm_execpath: '/portable/toolchain/node/lib/node_modules/npm/bin/npm-cli.js',
      HAGICODE_PORTABLE_TOOLCHAIN_ROOT: '/portable/toolchain',
      HAGICODE_NPM_GLOBAL_PREFIX: '/userData/runtimeData/node/node22/npmGlobal',
      HAGICODE_NPM_GLOBAL_BIN_ROOT: '/userData/runtimeData/node/node22/npmGlobal/bin',
      HAGICODE_NPM_GLOBAL_MODULES_ROOT: '/userData/runtimeData/node/node22/npmGlobal/lib/node_modules',
      HAGICODE_NPM_CACHE_ROOT: '/userData/runtimeData/node/node22/npmCache',
      HAGICODE_NODE_MAJOR_VERSION: '22',
    };
    const npmGlobalPaths = {
      nodeVersion: '22.12.0',
      nodeMajorVersion: '22',
      npmGlobalPrefix: '/userData/runtimeData/node/node22/npmGlobal',
      npmGlobalBinRoot: '/userData/runtimeData/node/node22/npmGlobal/bin',
      npmGlobalModulesRoot: '/userData/runtimeData/node/node22/npmGlobal/lib/node_modules',
      npmCacheRoot: '/userData/runtimeData/node/node22/npmCache',
    };

    const result = injectManagedCliPathEnv(baseEnv, {
      platform: 'linux',
      npmGlobalPaths,
    });

    assert.equal(result.pathKey, 'PATH');
    assert.equal(result.managedCliPath, '/userData/runtimeData/node/node22/npmGlobal/bin');
    assert.equal(result.managedNpmGlobalPath, '/userData/runtimeData/node/node22/npmGlobal');
    assert.equal(result.env.PATH, '/userData/runtimeData/node/node22/npmGlobal/bin:/system/bin:/usr/local/bin');
    assert.equal(result.env.HAGICODE_AGENT_CLI_PATH, '/userData/runtimeData/node/node22/npmGlobal/bin');
    assert.equal(result.env.HAGICODE_NPM_GLOBAL_PATH, '/userData/runtimeData/node/node22/npmGlobal');
    assert.equal(result.env.NODE_PATH, undefined);
    assert.equal(result.env.NODE, undefined);
    assert.equal(result.env.npm_execpath, undefined);
    assert.equal(result.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT, undefined);
    assert.equal(baseEnv.PATH, '/system/bin:/userData/runtimeData/node/node22/npmGlobal/bin:/usr/local/bin');
    assert.equal(baseEnv.NODE_PATH, '/system/node_modules');
  });

  it('derives managed CLI command directories from the effective platform-specific wrapper roots', () => {
    assert.equal(resolveManagedCliCommandDirectory({
      nodeVersion: '22.12.0',
      nodeMajorVersion: '22',
      npmGlobalPrefix: '/userData/runtimeData/node/node22/npmGlobal',
      npmGlobalBinRoot: '/userData/runtimeData/node/node22/npmGlobal/bin',
      npmGlobalModulesRoot: '/userData/runtimeData/node/node22/npmGlobal/lib/node_modules',
      npmCacheRoot: '/userData/runtimeData/node/node22/npmCache',
    }, 'linux'), '/userData/runtimeData/node/node22/npmGlobal/bin');

    assert.equal(resolveManagedCliCommandDirectory({
      nodeVersion: '22.12.0',
      nodeMajorVersion: '22',
      npmGlobalPrefix: 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\node\\node22\\npmGlobal',
      npmGlobalBinRoot: 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\node\\node22\\npmGlobal',
      npmGlobalModulesRoot: 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\node\\node22\\npmGlobal\\node_modules',
      npmCacheRoot: 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\node\\node22\\npmCache',
    }, 'win32'), 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\node\\node22\\npmGlobal');

    assert.equal(resolveManagedCliCommandDirectory(null, 'linux'), null);
  });

  it('uses the effective managed command wrapper root for Windows server startup', () => {
    const result = injectManagedCliPathEnv({
      Path: 'C:\\Windows\\System32;C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\node22\\npmGlobal;C:\\Windows',
      NODE: 'C:\\portable\\toolchain\\node\\node.exe',
    }, {
      platform: 'win32',
      npmGlobalPaths: {
        nodeVersion: '22.12.0',
        nodeMajorVersion: '22',
        npmGlobalPrefix: 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\node22\\npmGlobal',
        npmGlobalBinRoot: 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\node22\\npmGlobal',
        npmGlobalModulesRoot: 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\node22\\npmGlobal\\node_modules',
        npmCacheRoot: 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\node22\\npmCache',
      },
    });

    assert.equal(result.pathKey, 'Path');
    assert.equal(result.managedCliPath, 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\node22\\npmGlobal');
    assert.equal(result.managedNpmGlobalPath, 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\node22\\npmGlobal');
    assert.equal(result.env.Path, 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\node22\\npmGlobal;C:\\Windows\\System32;C:\\Windows');
    assert.equal(result.env.HAGICODE_AGENT_CLI_PATH, 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\node22\\npmGlobal');
    assert.equal(result.env.HAGICODE_NPM_GLOBAL_PATH, 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\node22\\npmGlobal');
    assert.equal(result.env.NODE, undefined);
  });

  it('preserves inherited PATH and skips managed npmGlobal injection when the bundled runtime policy is disabled', () => {
    const activationPolicy = resolveBundledNodeRuntimePolicy({
      defaultEnabledByConsumer: { desktop: true },
      explicitEnabled: false,
    });
    const result = injectManagedCliPathEnv({
      PATH: '/system/bin:/usr/local/bin',
      HAGICODE_NPM_GLOBAL_PREFIX: '/userData/runtimeData/node/node22/npmGlobal',
      NODE: '/portable/toolchain/node/bin/node',
      npm_execpath: '/portable/toolchain/node/lib/node_modules/npm/bin/npm-cli.js',
    }, {
      platform: 'linux',
      activationPolicy,
      npmGlobalPaths: {
        nodeVersion: '22.12.0',
        nodeMajorVersion: '22',
        npmGlobalPrefix: '/userData/runtimeData/node/node22/npmGlobal',
        npmGlobalBinRoot: '/userData/runtimeData/node/node22/npmGlobal/bin',
        npmGlobalModulesRoot: '/userData/runtimeData/node/node22/npmGlobal/lib/node_modules',
        npmCacheRoot: '/userData/runtimeData/node/node22/npmCache',
      },
    });

    assert.equal(result.pathKey, 'PATH');
    assert.deepEqual(result.pathEntries, ['/system/bin', '/usr/local/bin']);
    assert.equal(result.env.PATH, '/system/bin:/usr/local/bin');
    assert.equal(result.managedCliPath, null);
    assert.equal(result.managedNpmGlobalPath, null);
    assert.equal(result.env.HAGICODE_AGENT_CLI_PATH, undefined);
    assert.equal(result.env.HAGICODE_NPM_GLOBAL_PATH, undefined);
    assert.equal(result.env.NODE, undefined);
    assert.equal(result.env.npm_execpath, undefined);
  });

  it('uses bundled toolchain paths when the desktop manifest default is enabled', () => {
    const activationPolicy = resolveBundledNodeRuntimePolicy({
      defaultEnabledByConsumer: {
        desktop: true,
        'steam-packer': true,
      },
    });
    const result = injectPortableToolchainEnv({ PATH: '/system/bin' }, {
      getPortableToolchainRoot: () => '/portable/toolchain',
      getPortableToolchainBinRoot: () => '/portable/toolchain/bin',
      getPortableNodeBinRoot: () => '/portable/toolchain/node/bin',
      getPortableNpmGlobalBinRoot: () => '/portable/toolchain/node/bin',
    }, {
      platform: 'linux',
      existsSync: () => true,
      activationPolicy,
    });

    assert.equal(activationPolicy.enabled, true);
    assert.equal(activationPolicy.source, 'manifest-default');
    assert.equal(
      result.env.PATH,
      '/portable/toolchain/bin:/portable/toolchain/node/bin:/system/bin',
    );
    assert.equal(result.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT, '/portable/toolchain');
    assert.equal(result.usedBundledToolchain, true);
    assert.equal(result.fellBackToSystemPath, false);
  });

  it('honors explicit desktop disable override and legacy fallback for bundled toolchain activation', () => {
    const explicitDisable = resolveBundledNodeRuntimePolicy({
      defaultEnabledByConsumer: { desktop: true },
      explicitEnabled: parseBundledNodeRuntimeOverride('false'),
    });
    const legacyFallback = resolveBundledNodeRuntimePolicy({});
    const disabledEnv = injectPortableToolchainEnv({ PATH: '/system/bin' }, {
      getPortableToolchainRoot: () => '/portable/toolchain',
      getPortableToolchainBinRoot: () => '/portable/toolchain/bin',
      getPortableNodeBinRoot: () => '/portable/toolchain/node/bin',
      getPortableNpmGlobalBinRoot: () => '/portable/toolchain/node/bin',
    }, {
      platform: 'linux',
      existsSync: () => true,
      activationPolicy: explicitDisable,
    });

    assert.equal(explicitDisable.enabled, false);
    assert.equal(explicitDisable.source, 'override');
    assert.equal(disabledEnv.env.PATH, '/system/bin');
    assert.equal(disabledEnv.env.HAGICODE_NPM_GLOBAL_PREFIX, undefined);
    assert.equal(disabledEnv.usedBundledToolchain, false);
    assert.equal(disabledEnv.fellBackToSystemPath, true);
    assert.equal(legacyFallback.enabled, true);
    assert.equal(legacyFallback.source, 'legacy-fallback');
  });

  it('skips missing bundled directories and preserves the inherited PATH order', () => {
    const baseEnv = {
      PATH: '/usr/local/bin:/usr/bin',
    };
    const result = injectPortableToolchainEnv(baseEnv, {
      getPortableToolchainRoot: () => '/portable/toolchain',
      getPortableToolchainBinRoot: () => '/portable/toolchain/bin',
      getPortableNodeBinRoot: () => '/portable/toolchain/node/bin',
      getPortableNpmGlobalBinRoot: () => '/portable/toolchain/node/bin',
    }, {
      platform: 'linux',
      existsSync: () => false,
    });

    assert.equal(result.env.PATH, '/usr/local/bin:/usr/bin');
    assert.equal(result.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT, undefined);
    assert.equal(result.injectedPaths.length, 0);
    assert.equal(result.fellBackToSystemPath, true);
  });

  it('deduplicates injected and inherited PATH entries without mutating the source env object', () => {
    const baseEnv = {
      PATH: '/portable/toolchain/bin:/usr/bin',
    };
    const result = injectPortableToolchainEnv(baseEnv, {
      getPortableToolchainRoot: () => '/portable/toolchain',
      getPortableToolchainBinRoot: () => '/portable/toolchain/bin',
      getPortableNodeBinRoot: () => '/portable/toolchain/node/bin',
      getPortableNpmGlobalBinRoot: () => '/portable/toolchain/bin',
    }, {
      platform: 'linux',
      existsSync: () => true,
    });

    assert.equal(result.env.PATH, '/portable/toolchain/bin:/portable/toolchain/node/bin:/usr/bin');
    assert.equal(baseEnv.PATH, '/portable/toolchain/bin:/usr/bin');
    assert.notEqual(result.env, baseEnv);
  });

  it('keeps Windows PATH key casing and path dedupe case-insensitive', () => {
    const result = injectPortableToolchainEnv({
      Path: 'C:\\Portable\\Toolchain\\Bin;C:\\Windows\\System32',
    }, {
      getPortableToolchainRoot: () => 'C:\\Portable\\Toolchain',
      getPortableToolchainBinRoot: () => 'C:\\portable\\toolchain\\bin',
      getPortableNodeBinRoot: () => 'C:\\Portable\\Toolchain\\node',
      getPortableNpmGlobalBinRoot: () => 'C:\\Portable\\Toolchain\\node',
    }, {
      platform: 'win32',
      existsSync: () => true,
    });

    assert.equal(result.pathKey, 'Path');
    assert.equal(
      result.env.Path,
      'C:\\portable\\toolchain\\bin;C:\\Portable\\Toolchain\\node;C:\\Windows\\System32',
    );
  });

  it('exposes helper coverage for PATH key resolution and path collection', () => {
    assert.equal(resolvePathEnvKey({ PATH: '/usr/bin' }, 'linux'), 'PATH');
    assert.equal(resolvePathEnvKey({ Path: 'C:\\Windows\\System32' }, 'win32'), 'Path');
    assert.deepEqual(
      dedupePathEntries(['/a', '/a', '/b'], 'linux'),
      ['/a', '/b'],
    );

    const collected = collectPortableToolchainPathEntries({
      getPortableToolchainRoot: () => '/portable/toolchain',
      getPortableToolchainBinRoot: () => '/portable/toolchain/bin',
      getPortableNodeBinRoot: () => '/portable/toolchain/node/bin',
      getPortableNpmGlobalBinRoot: () => '/portable/toolchain/node/bin',
    }, {
      platform: 'linux',
      existsSync: target => target !== '/portable/toolchain/node/bin',
    });

    assert.equal(collected.toolchainRoot, '/portable/toolchain');
    assert.deepEqual(collected.injectedPaths, [
      '/portable/toolchain/bin',
    ]);
  });

  it('covers migration and rollback scenarios', () => {
    // Migration scenario: legacy provider fields no longer expand the supported env surface.
    const migrated = buildManagedServiceEnv({
      host: 'localhost',
      port: 5000,
      dataDir: '/tmp/hagicode-migrate',
      currentDesktopLanguage: 'zh-CN',
      yamlConfig: {
        Database: { Provider: 'postgresql' },
        ConnectionStrings: { Default: 'Data Source=/tmp/hagicode-migrate/hagicode.db' },
        AI: { Service: { DefaultExecutorType: 'ClaudeCodeCli' } },
      },
      existingEnv: {},
    });
    assert.equal(migrated.errors.length, 0);
    assert.equal(migrated.injectedEnv.Database__Provider, undefined);
    assert.equal(migrated.injectedEnv.ConnectionStrings__Default, 'Data Source=/tmp/hagicode-migrate/hagicode.db');

    // Rollback scenario: compatibility switch should fall back to legacy mode.
    assert.equal(resolveWebServiceConfigMode('legacy-yaml'), 'legacy-yaml');

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
