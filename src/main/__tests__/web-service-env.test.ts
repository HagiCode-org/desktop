import assert from 'node:assert/strict';
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
  collectPortableToolchainPathEntries,
  dedupePathEntries,
  injectPortableToolchainEnv,
  resolvePathEnvKey,
} from '../portable-toolchain-env.js';

describe('web-service-env', () => {
  it('builds managed env vars with runtime and defaults', () => {
    const result = buildManagedServiceEnv({
      host: '127.0.0.1',
      port: 36556,
      dataDir: '/tmp/hagicode-data',
      yamlConfig: null,
      existingEnv: {},
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.injectedEnv.ASPNETCORE_URLS, 'http://127.0.0.1:36556');
    assert.equal(result.injectedEnv.Urls, 'http://127.0.0.1:36556');
    assert.equal(result.injectedEnv.DATADIR, '/tmp/hagicode-data');
    assert.equal(result.injectedEnv.Database__Provider, undefined);
    assert.equal(result.injectedEnv.AI__Providers__DefaultProvider, 'ClaudeCodeCli');
    assert.equal(result.injectedEnv.HAGICODE_LOG_FORMAT, 'plain');
    assert.equal(result.snapshot.some(entry => entry.key === 'Database__Provider'), false);
  });

  it('injects wildcard and custom IPv4 bind hosts without rewriting them', () => {
    const wildcard = buildManagedServiceEnv({
      host: '0.0.0.0',
      port: 36556,
      dataDir: '/tmp/hagicode-data',
      yamlConfig: null,
      existingEnv: {},
    });
    const custom = buildManagedServiceEnv({
      host: '192.168.1.24',
      port: 36556,
      dataDir: '/tmp/hagicode-data',
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
        process.env.AI__Providers__DefaultProvider,
        process.env.${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__Id,
        process.env.${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}0__PhysicalPath
      ].join('|'))`,
    ], { env, encoding: 'utf-8' });

    assert.equal(child.status, 0);
    assert.equal(
      child.stdout,
      'http://localhost:36556|http://localhost:36556|/tmp/hagicode-integration|ClaudeCodeCli|desktoplogs|/tmp/hagicode/logs',
    );
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
      getPortableNpmGlobalBinRoot: () => '/portable/toolchain/npm-global/bin',
    }, {
      platform: 'linux',
      existsSync: target => target !== '/portable/toolchain/npm-global/bin.missing',
    });

    assert.equal(result.pathKey, 'PATH');
    assert.equal(
      result.env.PATH,
      '/portable/toolchain/bin:/portable/toolchain/node/bin:/portable/toolchain/npm-global/bin:/system/bin',
    );
    assert.equal(result.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT, '/portable/toolchain');
    assert.equal(baseEnv.PATH, '/system/bin');
    assert.equal(result.usedBundledToolchain, true);
    assert.equal(result.fellBackToSystemPath, false);
  });

  it('skips missing bundled directories and preserves the inherited PATH order', () => {
    const baseEnv = {
      PATH: '/usr/local/bin:/usr/bin',
    };
    const result = injectPortableToolchainEnv(baseEnv, {
      getPortableToolchainRoot: () => '/portable/toolchain',
      getPortableToolchainBinRoot: () => '/portable/toolchain/bin',
      getPortableNodeBinRoot: () => '/portable/toolchain/node/bin',
      getPortableNpmGlobalBinRoot: () => '/portable/toolchain/npm-global/bin',
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
      getPortableNpmGlobalBinRoot: () => 'C:\\Portable\\Toolchain\\npm-global\\bin',
    }, {
      platform: 'win32',
      existsSync: () => true,
    });

    assert.equal(result.pathKey, 'Path');
    assert.equal(
      result.env.Path,
      'C:\\portable\\toolchain\\bin;C:\\Portable\\Toolchain\\node;C:\\Portable\\Toolchain\\npm-global\\bin;C:\\Windows\\System32',
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
      getPortableNpmGlobalBinRoot: () => '/portable/toolchain/npm-global/bin',
    }, {
      platform: 'linux',
      existsSync: target => target !== '/portable/toolchain/node/bin',
    });

    assert.equal(collected.toolchainRoot, '/portable/toolchain');
    assert.deepEqual(collected.injectedPaths, [
      '/portable/toolchain/bin',
      '/portable/toolchain/npm-global/bin',
    ]);
  });

  it('covers migration and rollback scenarios', () => {
    // Migration scenario: legacy provider fields no longer expand the supported env surface.
    const migrated = buildManagedServiceEnv({
      host: 'localhost',
      port: 5000,
      dataDir: '/tmp/hagicode-migrate',
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
      yamlConfig: null,
      existingEnv: {
        HAGICODE_LOG_FORMAT: 'x'.repeat(40000),
      },
    });
    assert.ok(invalid.errors.length > 0);
  });
});
