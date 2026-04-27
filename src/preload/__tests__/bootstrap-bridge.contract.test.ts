import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('desktop bootstrap preload bridge contract', () => {
  it('exposes a typed bootstrap bridge with snapshot refresh and no data directory recovery action', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /import type \{\s*DesktopBootstrapSnapshot,\s*\} from '\.\.\/types\/bootstrap\.js';/s);
    assert.match(source, /const initialBootstrapSnapshot = readInitialBootstrapSnapshot\(\);/);
    assert.match(source, /bootstrap: \{\s*getCachedSnapshot: \(\) => DesktopBootstrapSnapshot \| null;/s);
    assert.match(source, /getSnapshot: \(\) => Promise<DesktopBootstrapSnapshot>;/);
    assert.match(source, /refresh: \(\) => Promise<DesktopBootstrapSnapshot>;/);
    assert.match(source, /openDesktopLogs: \(\) => Promise<LogDirectoryOpenResult>;/);
    assert.match(source, /getCachedSnapshot: \(\) => initialBootstrapSnapshot/);
    assert.match(source, /getSnapshot: \(\) => ipcRenderer\.invoke\('bootstrap:get-snapshot'\)/);
    assert.match(source, /refresh: \(\) => ipcRenderer\.invoke\('bootstrap:refresh'\)/);
    assert.match(source, /openDesktopLogs: \(\) => ipcRenderer\.invoke\('log-directory:open', 'desktop'\)/);
    assert.equal(source.includes('restoreDefaultDataDirectory'), false);
    assert.equal(source.includes('dataDirectory:'), false);
    assert.equal(source.includes('data-directory:'), false);
  });
});
