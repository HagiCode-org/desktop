import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

describe('managed service IPC window rebinding', () => {
  it('rebinds code-server handlers after the main BrowserWindow is created', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /registerCodeServerHandlers,/);
    assert.match(source, /initCodeServerHandlers,/);
    assert.match(
      source,
      /mainWindow = new ElectronBrowserWindow\([\s\S]*?wireDesktopWindowClipboard\(mainWindow\);[\s\S]*?initCodeServerHandlers\(codeServerManager, mainWindow\);/,
    );
  });
});
