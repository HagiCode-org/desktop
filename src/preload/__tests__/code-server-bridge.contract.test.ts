import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('code server preload bridge contract', () => {
  it('exposes typed code server methods and status unsubscribe handling', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /import type \{[\s\S]*CodeServerBridge,/);
    assert.match(source, /codeServer: CodeServerBridge;/);
    assert.match(source, /const codeServerBridge: CodeServerBridge = Object\.freeze\(/);
    assert.match(source, /getStatus: \(\) => ipcRenderer\.invoke\(codeServerChannels\.status\)/);
    assert.match(source, /start: \(\) => ipcRenderer\.invoke\(codeServerChannels\.start\)/);
    assert.match(source, /stop: \(\) => ipcRenderer\.invoke\(codeServerChannels\.stop\)/);
    assert.match(source, /restart: \(\) => ipcRenderer\.invoke\(codeServerChannels\.restart\)/);
    assert.match(source, /repair: \(\) => ipcRenderer\.invoke\(codeServerChannels\.repair\)/);
    assert.match(source, /setConfig: \(payload: CodeServerConfigUpdatePayload\) => ipcRenderer\.invoke\(codeServerChannels\.setConfig, payload\)/);
    assert.match(source, /readLog: \(request: CodeServerLogReadRequest\) => ipcRenderer\.invoke\(codeServerChannels\.readLog, request\)/);
    assert.match(source, /openPath: \(target: CodeServerPathTarget\) => ipcRenderer\.invoke\(codeServerChannels\.openPath, target\)/);
    assert.match(source, /ipcRenderer\.on\(codeServerChannels\.statusChanged, listener\)/);
    assert.match(source, /return \(\) => ipcRenderer\.removeListener\(codeServerChannels\.statusChanged, listener\)/);
  });
});
