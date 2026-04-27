import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pathManagerPath = path.resolve(process.cwd(), 'src/main/path-manager.ts');
const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const configPath = path.resolve(process.cwd(), 'src/main/config.ts');

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

  it('starts from the managed default data directory and ignores legacy persisted paths', async () => {
    const source = await fs.readFile(mainPath, 'utf8');
    const configSource = await fs.readFile(configPath, 'utf8');

    assert.match(source, /const defaultPath = pathManager\.getDefaultDataDirectory\(\)/);
    assert.match(source, /prepareDataDirectoryForBootstrap\(defaultPath, \{\s*source: 'default',\s*requestedPath: defaultPath,\s*defaultPath,/s);
    assert.equal(source.includes('resolveDataDirectorySelection'), false);
    assert.equal(source.includes("source: 'fallback-default'"), false);
    assert.equal(source.includes('setDataDirectoryPath'), false);
    assert.equal(configSource.includes('dataDirectoryPath'), false);
  });
});
