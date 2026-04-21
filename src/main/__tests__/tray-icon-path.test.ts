import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const trayPath = path.resolve(process.cwd(), 'src/main/tray.ts');

describe('tray icon path integration', () => {
  it('loads the tray icon through the packaged-window icon resolver', async () => {
    const source = await fs.readFile(trayPath, 'utf8');

    assert.match(source, /import \{ resolveWindowIconPath \} from '\.\/window-icon-path\.js';/);
    assert.match(source, /function loadTrayIcon\(\): Electron\.NativeImage \{/);
    assert.match(source, /resolveWindowIconPath\(\{/);
    assert.match(source, /isPackaged: app\.isPackaged,/);
    assert.match(source, /resourcesPath: process\.resourcesPath,/);
    assert.match(source, /new Tray\(icon\.resize\(\{ width: 16, height: 16 \}\)\)/);
    assert.equal(source.includes("../../resources/icon.png"), false);
  });
});
