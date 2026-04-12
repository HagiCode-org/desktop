import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('system diagnostic preload contract', () => {
  it('exposes the dedicated bridge through electronAPI', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /const systemDiagnosticBridge = createSystemDiagnosticBridge\(ipcRenderer, systemDiagnosticChannels\);/);
    assert.match(source, /systemDiagnostic: SystemDiagnosticBridge;/);
    assert.match(source, /systemDiagnostic: systemDiagnosticBridge,/);
  });
});
