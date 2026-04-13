import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('system diagnostic preload contract', () => {
  it('exposes the dedicated bridge through electronAPI and removes retired diagnosis/debug APIs', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /const systemDiagnosticBridge = createSystemDiagnosticBridge\(ipcRenderer, systemDiagnosticChannels\);/);
    assert.match(source, /systemDiagnostic: SystemDiagnosticBridge;/);
    assert.match(source, /systemDiagnostic: systemDiagnosticBridge,/);
    assert.equal(source.includes('diagnosisGetPromptGuidance'), false);
    assert.equal(source.includes('diagnosisOpenPrompt'), false);
    assert.equal(source.includes('setDebugMode'), false);
    assert.equal(source.includes('getDebugMode'), false);
    assert.equal(source.includes('onDebugModeChanged'), false);
  });

  it('keeps the dedicated Code Server window bridge on electronAPI', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /openCodeServerWindow: \(url: string\) => Promise<\{ success: boolean; error\?: string \}>;/);
    assert.match(source, /openCodeServerWindow: \(url: string\) => ipcRenderer\.invoke\('open-code-server-window', url\),/);
  });
});
