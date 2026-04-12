import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('version preload bridge contract', () => {
  it('removes the retired dependency inspection bridge while keeping lifecycle bridges', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.equal(source.includes('versionCheckDependencies'), false);
    assert.equal(source.includes('version:checkDependencies'), false);
    assert.match(source, /versionList: \(\) => ipcRenderer\.invoke\('version:list'\)/);
    assert.match(source, /versionGetInstalled: \(\) => ipcRenderer\.invoke\('version:getInstalled'\)/);
    assert.match(source, /versionGetActive: \(\) => ipcRenderer\.invoke\('version:getActive'\)/);
    assert.match(source, /versionInstall: \(versionId\) => ipcRenderer\.invoke\('version:install', versionId\)/);
    assert.match(source, /versionReinstall: \(versionId\) => ipcRenderer\.invoke\('version:reinstall', versionId\)/);
    assert.match(source, /versionSwitch: \(versionId\) => ipcRenderer\.invoke\('version:switch', versionId\)/);
    assert.match(source, /versionOpenLogs: \(versionId\) => ipcRenderer\.invoke\('version:openLogs', versionId\)/);
  });

  it('keeps install-web-service-package typed with explicit auto-switch options and structured results', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /import type \{ InstallWebServicePackageOptions, InstallWebServicePackageResult \} from '\.\.\/types\/version-install\.js';/);
    assert.match(source, /installWebServicePackage: \(\s*version: string,\s*options\?: InstallWebServicePackageOptions,\s*\) => Promise<InstallWebServicePackageResult>;/s);
    assert.match(source, /installWebServicePackage: \(version, options\) => ipcRenderer\.invoke\('install-web-service-package', version, options\)/);
  });
});
