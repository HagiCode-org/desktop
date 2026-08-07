import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('interface opening preference preload bridge', () => {
  it('exposes only the typed recording IPC method', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /import type \{ InterfaceOpeningMethod \} from '\.\.\/main\/config\.js';/);
    assert.match(source, /recordInterfaceOpeningMethod: \(method: InterfaceOpeningMethod\) => Promise<void>;/);
    assert.match(source, /recordInterfaceOpeningMethod: \(method\) => ipcRenderer\.invoke\('record-interface-opening-method', method\)/);
  });
});
