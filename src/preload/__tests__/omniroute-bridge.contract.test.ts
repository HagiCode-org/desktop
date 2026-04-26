import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('OmniRoute preload contract', () => {
  it('exposes typed OmniRoute invoke methods and status listener cleanup', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /OmniRouteBridge/);
    assert.match(source, /omniroute: OmniRouteBridge;/);
    assert.match(source, /getStatus: \(\) => ipcRenderer\.invoke\(omniRouteChannels\.status\)/);
    assert.match(source, /start: \(\) => ipcRenderer\.invoke\(omniRouteChannels\.start\)/);
    assert.match(source, /stop: \(\) => ipcRenderer\.invoke\(omniRouteChannels\.stop\)/);
    assert.match(source, /restart: \(\) => ipcRenderer\.invoke\(omniRouteChannels\.restart\)/);
    assert.match(source, /setConfig: \(payload: OmniRouteConfigUpdatePayload\) => ipcRenderer\.invoke\(omniRouteChannels\.setConfig, payload\)/);
    assert.match(source, /readLog: \(request: OmniRouteLogReadRequest\) => ipcRenderer\.invoke\(omniRouteChannels\.readLog, request\)/);
    assert.match(source, /openPath: \(target: OmniRoutePathTarget\) => ipcRenderer\.invoke\(omniRouteChannels\.openPath, target\)/);
    assert.match(source, /ipcRenderer\.on\(omniRouteChannels\.statusChanged, listener\)/);
    assert.match(source, /return \(\) => ipcRenderer\.removeListener\(omniRouteChannels\.statusChanged, listener\)/);
  });
});
