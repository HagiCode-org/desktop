import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('npm management preload contract', () => {
  it('exposes typed npm management methods and progress unsubscribe handling', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /npmManagement: NpmManagementBridge;/);
    assert.match(source, /getSnapshot: \(\) => ipcRenderer\.invoke\(npmManagementChannels\.snapshot\)/);
    assert.match(source, /refresh: \(\) => ipcRenderer\.invoke\(npmManagementChannels\.refresh\)/);
    assert.match(source, /getMirrorSettings: \(\) => ipcRenderer\.invoke\(npmManagementChannels\.getMirrorSettings\)/);
    assert.match(source, /setMirrorSettings: \(settings: NpmMirrorSettingsInput\) => ipcRenderer\.invoke\(npmManagementChannels\.setMirrorSettings, settings\)/);
    assert.match(source, /install: \(packageId: ManagedNpmPackageId\) => ipcRenderer\.invoke\(npmManagementChannels\.install, packageId\)/);
    assert.match(source, /uninstall: \(packageId: ManagedNpmPackageId\) => ipcRenderer\.invoke\(npmManagementChannels\.uninstall, packageId\)/);
    assert.match(source, /syncPackages: \(request: NpmManagementBatchSyncRequest\) => ipcRenderer\.invoke\(npmManagementChannels\.syncPackages, request\)/);
    assert.match(source, /ipcRenderer\.on\(npmManagementChannels\.progress, listener\)/);
    assert.match(source, /return \(\) => ipcRenderer\.removeListener\(npmManagementChannels\.progress, listener\)/);
  });
});
