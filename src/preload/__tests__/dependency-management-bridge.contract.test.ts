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
    assert.match(source, /DependencyManagementInstallRequest/);
    assert.match(source, /install: \(request: ManagedNpmPackageId \| DependencyManagementInstallRequest\) => ipcRenderer\.invoke\(dependencyManagementChannels\.install, request\)/);
    assert.match(source, /uninstall: \(packageId: ManagedNpmPackageId\) => ipcRenderer\.invoke\(dependencyManagementChannels\.uninstall, packageId\)/);
    assert.match(source, /syncPackages: \(request: DependencyManagementBatchSyncRequest\) => ipcRenderer\.invoke\(dependencyManagementChannels\.syncPackages, request\)/);
    assert.match(source, /startVendoredRuntime: \(runtimeId: VendoredRuntimeId\) => ipcRenderer\.invoke\(dependencyManagementChannels\.startVendoredRuntime, runtimeId\)/);
    assert.match(source, /stopVendoredRuntime: \(runtimeId: VendoredRuntimeId\) => ipcRenderer\.invoke\(dependencyManagementChannels\.stopVendoredRuntime, runtimeId\)/);
    assert.match(source, /restartVendoredRuntime: \(runtimeId: VendoredRuntimeId\) => ipcRenderer\.invoke\(dependencyManagementChannels\.restartVendoredRuntime, runtimeId\)/);
    assert.match(source, /repairVendoredRuntime: \(runtimeId: VendoredRuntimeId\) => ipcRenderer\.invoke\(dependencyManagementChannels\.repairVendoredRuntime, runtimeId\)/);
    assert.match(source, /openVendoredRuntimePath: \(runtimeId: VendoredRuntimeId, target: 'logs' \| 'runtime-root'\) => ipcRenderer\.invoke\(dependencyManagementChannels\.openVendoredRuntimePath, runtimeId, target\)/);
    assert.match(source, /ipcRenderer\.on\(dependencyManagementChannels\.progress, listener\)/);
    assert.match(source, /return \(\) => ipcRenderer\.removeListener\(dependencyManagementChannels\.progress, listener\)/);
  });

  it('exposes read-only hagiNode runtime metadata from dependency management snapshots', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /import type \{ HagiNodeRuntimeBridge, HagiNodeRuntimeMetadata \} from '\.\.\/types\/node-runtime\.js';/);
    assert.match(source, /hagiNode: HagiNodeRuntimeBridge;/);
    assert.match(source, /const hagiNodeBridge: HagiNodeRuntimeBridge = Object\.freeze\(/);
    assert.match(source, /getMetadata: async \(\): Promise<HagiNodeRuntimeMetadata> =>/);
    assert.match(source, /nodeVersion: snapshot\.environment\.nodeVersion/);
    assert.match(source, /nodeMajorVersion: snapshot\.environment\.nodeMajorVersion/);
    assert.match(source, /npmGlobalPath: snapshot\.environment\.npmGlobalPrefix/);
    assert.match(source, /npmGlobalBinPath: snapshot\.environment\.npmGlobalBinRoot/);
    assert.match(source, /npmGlobalModulesPath: snapshot\.environment\.npmGlobalModulesRoot/);
    assert.match(source, /contextBridge\.exposeInMainWorld\('hagiNode', hagiNodeBridge\)/);
    const bridgeBody = source.slice(
      source.indexOf('const hagiNodeBridge'),
      source.indexOf('const electronAPI'),
    );
    assert.doesNotMatch(bridgeBody, /\b(install|uninstall|delete|rm)\b/);
  });
});
