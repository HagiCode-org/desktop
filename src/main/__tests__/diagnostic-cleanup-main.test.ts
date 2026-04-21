import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

describe('desktop diagnostic cleanup', () => {
  it('keeps system diagnostics while removing AI diagnosis, persisted debug handlers, and Agent CLI manager bootstrap', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /import \{ SystemDiagnosticManager \} from '\.\/system-diagnostic-manager\.js';/);
    assert.match(source, /registerSystemDiagnosticHandlers\(\{\s*systemDiagnosticManager,\s*\}\);/s);
    assert.equal(source.includes('DiagnosisManager'), false);
    assert.equal(source.includes('registerDiagnosisHandlers'), false);
    assert.equal(source.includes('set-debug-mode'), false);
    assert.equal(source.includes('get-debug-mode'), false);
    assert.equal(source.includes('AgentCliManager'), false);
    assert.equal(source.includes('registerAgentCliHandlers'), false);
    assert.equal(source.includes('agentCliSelection'), false);
    assert.match(source, /\.delete\('debugMode'\);/);
  });
});
