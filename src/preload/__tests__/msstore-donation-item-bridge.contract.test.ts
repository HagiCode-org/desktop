import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('msstore donation item preload bridge contract', () => {
  it('exposes donation item bridge on electronAPI and wires IPC channels', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /import type \{ MsstoreDonationItemBridge \} from '\.\.\/types\/msstore-donation-item\.js';/);
    assert.match(source, /import \{ msstoreDonationItemChannels \} from '\.\.\/types\/msstore-donation-item\.js';/);
    assert.match(source, /msstoreDonationItem: MsstoreDonationItemBridge;/);
    assert.match(source, /const msstoreDonationItemBridge: MsstoreDonationItemBridge = \{/);
    assert.match(source, /getState: \(\) => ipcRenderer\.invoke\(msstoreDonationItemChannels\.getState\)/);
    assert.match(source, /dismiss: \(\) => ipcRenderer\.invoke\(msstoreDonationItemChannels\.dismiss\)/);
    assert.match(source, /purchase: \(\) => ipcRenderer\.invoke\(msstoreDonationItemChannels\.purchase\)/);
    assert.match(source, /ipcRenderer\.on\(msstoreDonationItemChannels\.changed, listener\)/);
    assert.match(source, /\.\.\.\(turboEngineLicenseFeatureEnabled \? \{ msstoreDonationItem: msstoreDonationItemBridge \} : \{\}\)/);
  });
});
