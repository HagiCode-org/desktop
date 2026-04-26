import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('dependency management preload contract', () => {
  it('exposes typed dependency management methods and progress unsubscribe handling', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /dependencyManagement: DependencyManagementBridge;/);
    assert.match(source, /getSnapshot: \(\) => ipcRenderer\.invoke\(dependencyManagementChannels\.snapshot\)/);
    assert.match(source, /refresh: \(\) => ipcRenderer\.invoke\(dependencyManagementChannels\.refresh\)/);
    assert.match(source, /getMirrorSettings: \(\) => ipcRenderer\.invoke\(dependencyManagementChannels\.getMirrorSettings\)/);
    assert.match(source, /setMirrorSettings: \(settings: NpmMirrorSettingsInput\) => ipcRenderer\.invoke\(dependencyManagementChannels\.setMirrorSettings, settings\)/);
    assert.match(source, /install: \(packageId: ManagedNpmPackageId\) => ipcRenderer\.invoke\(dependencyManagementChannels\.install, packageId\)/);
    assert.match(source, /uninstall: \(packageId: ManagedNpmPackageId\) => ipcRenderer\.invoke\(dependencyManagementChannels\.uninstall, packageId\)/);
    assert.match(source, /syncPackages: \(request: DependencyManagementBatchSyncRequest\) => ipcRenderer\.invoke\(dependencyManagementChannels\.syncPackages, request\)/);
    assert.match(source, /ipcRenderer\.on\(dependencyManagementChannels\.progress, listener\)/);
    assert.match(source, /return \(\) => ipcRenderer\.removeListener\(dependencyManagementChannels\.progress, listener\)/);
  });
});
