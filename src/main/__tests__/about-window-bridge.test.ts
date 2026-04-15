import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');
const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

describe('desktop About popup bridge contract', () => {
  it('exposes the openAboutWindow preload bridge for embedded web content', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /export interface AboutWindowOpenResult \{/);
    assert.match(source, /openAboutWindow: \(url: string\) => Promise<AboutWindowOpenResult>;/);
    assert.match(source, /openAboutWindow: \(url: string\) => ipcRenderer\.invoke\('open-about-window', url\),/);
  });

  it('registers the main-process About popup handler with a device-bound marker', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /let aboutWindow: BrowserWindow \| null = null;/);
    assert.match(source, /ipcMain\.handle\('open-about-window', async \(_, url: string\) => \{/);
    assert.match(source, /hasShownBefore: hasShownAboutPopupMarker,/);
    assert.match(source, /markShown: markAboutPopupShown,/);
  });
});
