import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const trayPath = path.resolve(process.cwd(), 'src/main/tray.ts');

function handlerBlock(source: string, channel: string): string {
  const start = source.indexOf(`ipcMain.handle('${channel}'`);
  assert.notEqual(start, -1, `missing handler ${channel}`);
  const end = source.indexOf('\n});', start);
  return source.slice(start, end);
}

describe('managed web-service status publishing contracts', () => {
  it('retires the legacy server status loop', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.equal(source.includes('startStatusPolling'), false);
    assert.equal(source.includes('statusPollingInterval'), false);
  });

  it('runs the managed status loop through the publisher', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /startWebServiceStatusPoller\(\{/);
    assert.match(source, /publisher: webServiceStatusPublisher,/);
    assert.match(source, /intervalMs: MANAGED_SERVICE_STATUS_POLL_INTERVAL_MS,/);
  });

  it('publishes start, stop and restart immediately with force', async () => {
    const source = await fs.readFile(mainPath, 'utf8');
    const forcePublish = /webServiceStatusPublisher\.publish\(\w+, \{ force: true \}\)/;

    assert.match(handlerBlock(source, 'start-web-service'), forcePublish);
    assert.match(handlerBlock(source, 'stop-web-service'), forcePublish);
    assert.match(handlerBlock(source, 'restart-web-service'), forcePublish);
  });
});

describe('tray status refresh contract', () => {
  it('rebuilds the tray menu only when the display status or URL changes', async () => {
    const source = await fs.readFile(trayPath, 'utf8');

    assert.match(
      source,
      /if \(serverStatus !== previousStatus \|\| currentServiceUrl !== previousUrl\) \{\n    updateTrayMenu\(\);\n  \}/,
    );
  });
});
