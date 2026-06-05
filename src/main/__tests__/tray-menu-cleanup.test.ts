import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const trayPath = path.resolve(process.cwd(), 'src/main/tray.ts');

describe('tray menu cleanup', () => {
  it('removes the functional tray menu entries and keeps quit', async () => {
    const source = await fs.readFile(trayPath, 'utf8');

    assert.match(source, /label: getTrayLabel\('quit'\)/);
    assert.equal(source.includes('label: getTrayLabel(\'showWindow\')'), false);
    assert.equal(source.includes('label: getTrayLabel(\'startService\')'), false);
    assert.equal(source.includes('label: getTrayLabel(\'stopService\')'), false);
    assert.equal(source.includes('label: getTrayLabel(\'openHagicode\')'), false);
    assert.equal(source.includes('label: getTrayLabel(\'openInBrowser\')'), false);
  });
});
