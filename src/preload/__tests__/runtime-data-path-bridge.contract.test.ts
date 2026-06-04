import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('runtime data path preload bridge', () => {
  it('exposes a typed runtime data path bridge through electronAPI', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /import type \{ RuntimeDataPathBridge, RuntimeDataPathPreset \} from '\.\.\/types\/runtime-data-path\.js';/);
    assert.match(source, /runtimeDataPath: RuntimeDataPathBridge;/);
    assert.match(source, /const runtimeDataPathBridge: RuntimeDataPathBridge = \{/);
    assert.match(source, /getSettings: \(\) => ipcRenderer\.invoke\(runtimeDataPathChannels\.get\)/);
    assert.match(source, /setPreset: \(preset: RuntimeDataPathPreset\) => ipcRenderer\.invoke\(runtimeDataPathChannels\.set, preset\)/);
    assert.match(source, /runtimeDataPath: runtimeDataPathBridge,/);
  });
});
