import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ConfigManager } from '../config.js';

const pathManagerPath = path.resolve(process.cwd(), 'src/main/path-manager.ts');
const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

describe('desktop first-launch bootstrap', () => {
  it('normalizes Windows-style first-launch data directory paths before validation', async () => {
    const source = await fs.readFile(pathManagerPath, 'utf8');

    assert.match(source, /export function normalizeDataDirectoryPathForPlatform/);
    assert.equal(source.includes("trimmed.replace(/\\//g, '\\\\')"), true);
    assert.match(source, /path\.win32/);
  });

  it('creates a missing default data directory before bootstrap reaches ready', async () => {
    const source = await fs.readFile(pathManagerPath, 'utf8');

    assert.match(source, /await accessAdapter\.mkdir\(normalizedPath, \{ recursive: true \}\)/);
    assert.match(source, /context\.created = true/);
  });

  it('returns structured diagnostics when the target directory is not writable', async () => {
    const source = await fs.readFile(pathManagerPath, 'utf8');

    assert.match(source, /code: 'write-test-failed'/);
    assert.match(source, /summary: 'data directory is not writable'/);
    assert.match(source, /message: `No write permission for directory \$\{normalizedPath\}:/);
  });

  it('keeps config fallback explicit when the persisted path is missing or invalid', async () => {
    const source = await fs.readFile(mainPath, 'utf8');
    const configManager = new ConfigManager({
      get: (key: string) => key === 'dataDirectoryPath' ? '  ' : undefined,
      set: () => undefined,
      delete: () => undefined,
      clear: () => undefined,
      store: {},
    } as any);

    const selection = configManager.resolveDataDirectorySelection('/default/apps/data');

    assert.deepEqual(selection, {
      source: 'default',
      requestedPath: '/default/apps/data',
      configuredPath: null,
      defaultPath: '/default/apps/data',
    });
    assert.match(source, /source: 'fallback-default'/);
    assert.match(source, /configManager\.setDataDirectoryPath\(fallbackPreparation\.context\.normalizedPath\)/);
  });
});
