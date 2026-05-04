import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const storePath = path.resolve(process.cwd(), 'src/renderer/store/index.ts');
const cardPath = path.resolve(process.cwd(), 'src/renderer/components/WebServiceStatusCard.tsx');

describe('web service realtime synchronization contracts', () => {
  it('keeps web service status updates sourced from main-process events instead of renderer polling', async () => {
    const source = await fs.readFile(storePath, 'utf-8');

    assert.match(source, /onWebServiceStatusChange\?\.\(\(status: any\) => \{/);
    assert.match(source, /onWebServiceStartupPhaseChange\?\.\(\(payload\) => \{/);
    assert.match(source, /store\.dispatch\(setStartupPhase\(\{/);
    assert.match(source, /payload\.url && payload\.url !== currentWebServiceUrl/);
    assert.equal(source.includes('webServicePollingHandle'), false);
    assert.equal(source.includes('setInterval(async () => {\n      try {\n        const status = await window.electronAPI.getWebServiceStatus();'), false);
  });

  it('handles tray web service commands from the global store listener path', async () => {
    const source = await fs.readFile(storePath, 'utf-8');

    assert.match(source, /onTrayStartService\?\.\(\(\) => \{/);
    assert.match(source, /store\.dispatch\(startWebService\(\)\)/);
    assert.match(source, /onTrayStopService\?\.\(\(\) => \{/);
    assert.match(source, /store\.dispatch\(stopWebService\(\)\)/);
  });

  it('avoids duplicate web service event subscriptions inside the status card component', async () => {
    const source = await fs.readFile(cardPath, 'utf-8');

    assert.equal(source.includes('onWebServiceStatusChange'), false);
    assert.equal(source.includes('onTrayStartService'), false);
    assert.equal(source.includes('onTrayStopService'), false);
  });
});
