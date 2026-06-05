import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('debug options preload bridge', () => {
  it('exposes a typed debug options bridge through electronAPI', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /import type \{ DebugOptionsBridge, DebugOptionsSettings \} from '\.\.\/types\/debug-options\.js';/);
    assert.match(source, /debugOptions: DebugOptionsBridge;/);
    assert.match(source, /const debugOptionsBridge: DebugOptionsBridge = \{/);
    assert.match(source, /getSettings: \(\) => ipcRenderer\.invoke\(debugOptionsChannels\.get\)/);
    assert.match(source, /setSettings: \(settings: DebugOptionsSettings\) => ipcRenderer\.invoke\(debugOptionsChannels\.set, settings\)/);
    assert.match(source, /debugOptions: debugOptionsBridge,/);
  });
});
