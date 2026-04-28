import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  applyHagicodeEnvFile,
  collectBootstrapRuntimeEnvOverrides,
  formatHagicodeEnvDiagnostics,
  parseHagicodeEnv,
  resolveHagicodeEnvCandidateRoots,
} from '../startup/hagicode-env.js';

const bootstrapPath = path.resolve(process.cwd(), 'src/main/bootstrap.ts');
const temporaryDirectories: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0, temporaryDirectories.length).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('hagicode env loader', () => {
  it('returns candidate roots in packaged and development-friendly order', () => {
    const candidates = resolveHagicodeEnvCandidateRoots({
      argv: ['/tmp/node', '/workspace/hagicode-desktop/src/main/bootstrap.ts'],
      cwd: '/workspace/hagicode-desktop',
      execPath: '/Applications/Hagicode Desktop.app/Contents/MacOS/Hagicode Desktop',
      platform: 'darwin',
      resourcesPath: '/Applications/Hagicode Desktop.app/Contents/Resources',
    });

    assert.deepEqual(candidates, [
      '/Applications/Hagicode Desktop.app/Contents/MacOS',
      '/workspace/hagicode-desktop',
    ]);
  });

  it('parses export syntax, quotes, and filters unsupported keys while recording diagnostics', () => {
    const parsed = parseHagicodeEnv([
      '# comment',
      'export HAGICODE_MODE=steam',
      'HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENABLED=true',
      'HAGICODE_LOG_LEVEL="info"',
      'HAGICODE_DEBUG=\'false\'',
      'PATH=/usr/bin',
      'BROKEN_LINE',
      'HAGICODE_BAD_QUOTE="unterminated',
      '',
    ].join('\n'));

    assert.deepEqual(parsed.values, {
      HAGICODE_MODE: 'steam',
      HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENABLED: 'true',
      HAGICODE_LOG_LEVEL: 'info',
      HAGICODE_DEBUG: 'false',
    });
    assert.deepEqual(
      parsed.diagnostics.map((entry) => ({ lineNumber: entry.lineNumber, reason: entry.reason, key: entry.key ?? null })),
      [
        { lineNumber: 6, reason: 'invalid-key', key: 'PATH' },
        { lineNumber: 7, reason: 'invalid-line', key: null },
        { lineNumber: 8, reason: 'unterminated-quote', key: 'HAGICODE_BAD_QUOTE' },
      ],
    );
  });

  it('keeps startup behavior unchanged when hagicode.env is absent', async () => {
    const appRoot = await createTempDir('hagicode-env-missing-');
    const env: NodeJS.ProcessEnv = {
      HAGICODE_LOG_LEVEL: 'warn',
    };

    const result = await applyHagicodeEnvFile({
      argv: ['/tmp/node', '/tmp/app/bootstrap.js'],
      cwd: appRoot,
      env,
      execPath: path.join(appRoot, 'hagicode-desktop'),
      platform: 'linux',
    });

    assert.equal(result.envFilePath, null);
    assert.equal(env.HAGICODE_LOG_LEVEL, 'warn');
    assert.deepEqual(result.loadedValues, {});
  });

  it('applies file values over system env while leaving CLI-derived values in front', async () => {
    const appRoot = await createTempDir('hagicode-env-precedence-');
    const envFilePath = path.join(appRoot, 'hagicode.env');
    await fs.writeFile(
      envFilePath,
      [
        'HAGICODE_LOG_LEVEL=info',
        'HAGICODE_NON_INTERACTIVE_LOG_PATH=/from-file.log',
        'NODE_OPTIONS=--inspect',
      ].join('\n'),
      'utf8',
    );

    const env: NodeJS.ProcessEnv = {
      HAGICODE_LOG_LEVEL: 'warn',
      HAGICODE_NON_INTERACTIVE_LOG_PATH: '/system.log',
    };
    const cliOverrides = collectBootstrapRuntimeEnvOverrides([
      '/tmp/node',
      '/tmp/app/bootstrap.js',
      '--hagicode-non-interactive-log-path=/cli.log',
    ]);

    const result = await applyHagicodeEnvFile({
      argv: ['/tmp/node', '/tmp/app/bootstrap.js'],
      cwd: appRoot,
      cliOverrides,
      env,
      execPath: path.join(appRoot, 'hagicode-desktop'),
      platform: 'linux',
    });

    assert.equal(result.envFilePath, envFilePath);
    assert.equal(env.HAGICODE_LOG_LEVEL, 'info');
    assert.equal(env.HAGICODE_NON_INTERACTIVE_LOG_PATH, '/cli.log');
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.deepEqual(result.appliedFileValues, {
      HAGICODE_LOG_LEVEL: 'info',
    });
    assert.deepEqual(result.appliedCliValues, {
      HAGICODE_NON_INTERACTIVE_LOG_PATH: '/cli.log',
    });
  });

  it('formats diagnostics for observable bootstrap logging', () => {
    const messages = formatHagicodeEnvDiagnostics({
      candidateRoots: ['/tmp/app'],
      envFilePath: '/tmp/app/hagicode.env',
      loadedValues: {
        HAGICODE_MODE: 'steam',
      },
      appliedFileValues: {
        HAGICODE_MODE: 'steam',
      },
      appliedCliValues: {},
      diagnostics: [
        {
          lineNumber: 3,
          reason: 'invalid-line',
          input: 'BROKEN',
        },
      ],
    });

    assert.equal(messages.length, 2);
    assert.match(messages[0], /Loaded 1 supported key/);
    assert.match(messages[1], /Ignored line 3/);
  });

  it('loads the hagicode env file before importing the main process module', async () => {
    const source = await fs.readFile(bootstrapPath, 'utf8');
    const loaderIndex = source.indexOf('await applyHagicodeEnvFile(');
    const importIndex = source.indexOf("await import('./main.js')");

    assert.ok(loaderIndex >= 0);
    assert.ok(importIndex > loaderIndex);
  });
});
