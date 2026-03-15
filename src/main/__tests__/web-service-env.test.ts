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
    assert.equal(result.injectedEnv.Database__Provider, 'sqlite');
    assert.equal(result.injectedEnv.AI__Providers__DefaultProvider, 'ClaudeCodeCli');
    assert.equal(result.injectedEnv.HAGICODE_LOG_FORMAT, 'plain');
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

  it('prefers yaml mapping when provided', () => {
    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 5000,
      dataDir: '/runtime/data',
      yamlConfig: {
        Database: { Provider: 'postgresql' },
        ConnectionStrings: { Default: 'Host=db;Database=hagicode;Username=postgres;Password=secret' },
        AI: { Service: { DefaultExecutorType: 'CodexCli' } },
      },
      existingEnv: {
        AI__Providers__DefaultProvider: 'CodexCli',
      },
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.injectedEnv.Database__Provider, 'postgresql');
    assert.equal(result.injectedEnv.ConnectionStrings__Default, 'Host=db;Database=hagicode;Username=postgres;Password=secret');
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

  it('uses existing environment over yaml for non-runtime keys', () => {
    const result = buildManagedServiceEnv({
      host: 'localhost',
      port: 5000,
      dataDir: '/runtime/data',
      yamlConfig: {
        Database: { Provider: 'sqlite' },
      },
      existingEnv: {
        Database__Provider: 'postgresql',
      },
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.injectedEnv.Database__Provider, 'postgresql');
  });

  it('masks sensitive connection string values in logs', () => {
    const value = 'Host=localhost;Database=hagicode;Username=postgres;Password=postgres';
    const masked = maskEnvValue('ConnectionStrings__Default', value);

    assert.ok(masked.includes('Password=***'));
    assert.ok(masked.includes('Username=***'));
    assert.ok(masked.includes('Host=localhost'));
  });

  it('builds sorted and masked snapshot log lines', () => {
    const lines = buildSnapshotLogLines([
      {
        key: 'ConnectionStrings__Default',
        value: 'Host=db;Username=postgres;Password=postgres',
        source: 'yaml',
        sourceConfig: 'ConnectionStrings.Default',
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
    assert.equal(lines[1].includes('Password=***'), true);
  });

  it('resolves config mode and log level with safe defaults', () => {
    assert.equal(resolveWebServiceConfigMode(undefined), 'env');
    assert.equal(resolveWebServiceConfigMode('legacy-yaml'), 'legacy-yaml');
    assert.equal(resolveWebServiceConfigMode('yaml'), 'legacy-yaml');

    assert.equal(resolveEnvSnapshotLogLevel(undefined), 'summary');
    assert.equal(resolveEnvSnapshotLogLevel('off'), 'off');
    assert.equal(resolveEnvSnapshotLogLevel('detailed'), 'detailed');
  });

  it('injects managed env vars into child process spawn environment', () => {
    const buildResult = buildManagedServiceEnv({
      host: 'localhost',
      port: 36556,
      dataDir: '/tmp/hagicode-integration',
      yamlConfig: {
        Database: { Provider: 'sqlite' },
        AI: { Service: { DefaultExecutorType: 'CodexCli' } },
      },
      existingEnv: {},
    });

    assert.equal(buildResult.errors.length, 0);
    const env = { ...process.env, ...buildResult.injectedEnv };
    const child = spawnSync(process.execPath, [
      '-e',
      "process.stdout.write([process.env.ASPNETCORE_URLS, process.env.Urls, process.env.DATADIR, process.env.AI__Providers__DefaultProvider].join('|'))",
    ], { env, encoding: 'utf-8' });

    assert.equal(child.status, 0);
    assert.equal(child.stdout, 'http://localhost:36556|http://localhost:36556|/tmp/hagicode-integration|ClaudeCodeCli');
  });

  it('covers migration and rollback scenarios', () => {
    // Migration scenario: read from existing YAML structure without changing semantic fields.
    const migrated = buildManagedServiceEnv({
      host: 'localhost',
      port: 5000,
      dataDir: '/tmp/hagicode-migrate',
      yamlConfig: {
        Database: { Provider: 'postgresql' },
        AI: { Service: { DefaultExecutorType: 'ClaudeCodeCli' } },
      },
      existingEnv: {},
    });
    assert.equal(migrated.errors.length, 0);
    assert.equal(migrated.injectedEnv.Database__Provider, 'postgresql');

    // Rollback scenario: compatibility switch should fall back to legacy mode.
    assert.equal(resolveWebServiceConfigMode('legacy-yaml'), 'legacy-yaml');

    // Error branch: missing required values should fail validation.
    const invalid = buildManagedServiceEnv({
      host: '',
      port: 0,
      dataDir: '',
      yamlConfig: {
        Database: {
          Provider: 'x'.repeat(40000),
        },
      },
      existingEnv: {},
    });
    assert.ok(invalid.errors.length > 0);
  });
});
