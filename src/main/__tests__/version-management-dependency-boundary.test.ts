import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const versionHandlersPath = path.resolve(process.cwd(), 'src/main/ipc/handlers/versionHandlers.ts');
const dependencyHandlersPath = path.resolve(process.cwd(), 'src/main/ipc/handlers/dependencyHandlers.ts');
const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const versionManagerPath = path.resolve(process.cwd(), 'src/main/version-manager.ts');
const dependencyManagerPath = path.resolve(process.cwd(), 'src/main/dependency-manager.ts');

describe('version management dependency boundary', () => {
  it('removes the retired version dependency IPC channel while keeping lifecycle handlers', async () => {
    const [versionHandlersSource, mainSource] = await Promise.all([
      fs.readFile(versionHandlersPath, 'utf8'),
      fs.readFile(mainPath, 'utf8'),
    ]);

    assert.equal(versionHandlersSource.includes('version:checkDependencies'), false);
    assert.equal(mainSource.includes('version:checkDependencies'), false);
    assert.match(versionHandlersSource, /ipcMain\.handle\('version:list'/);
    assert.match(versionHandlersSource, /ipcMain\.handle\('version:getInstalled'/);
    assert.match(versionHandlersSource, /ipcMain\.handle\('version:getActive'/);
    assert.match(versionHandlersSource, /ipcMain\.handle\('version:install'/);
    assert.match(versionHandlersSource, /ipcMain\.handle\('version:uninstall'/);
    assert.match(versionHandlersSource, /ipcMain\.handle\('version:reinstall'/);
    assert.match(versionHandlersSource, /ipcMain\.handle\('version:switch'/);
    assert.match(versionHandlersSource, /ipcMain\.handle\('version:openLogs'/);
  });

  it('moves manifest dependency list loading onto the dependency manager boundary', async () => {
    const [dependencyHandlersSource, versionManagerSource, dependencyManagerSource, mainSource] = await Promise.all([
      fs.readFile(dependencyHandlersPath, 'utf8'),
      fs.readFile(versionManagerPath, 'utf8'),
      fs.readFile(dependencyManagerPath, 'utf8'),
      fs.readFile(mainPath, 'utf8'),
    ]);

    assert.match(versionManagerSource, /async resolveVersionInstallPath\(versionId: string\): Promise<string \| null>/);
    assert.equal(versionManagerSource.includes('async getDependencyListFromManifest('), false);
    assert.match(dependencyManagerSource, /async getDependencyListFromManifest\(installPath: string\): Promise<DependencyCheckResult\[]>/);
    assert.match(dependencyHandlersSource, /resolveVersionInstallPath\(versionId\)/);
    assert.match(dependencyHandlersSource, /getDependencyListFromManifest\(installPath\)/);
    assert.match(mainSource, /resolveVersionInstallPath\(versionId\)/);
    assert.match(mainSource, /getDependencyListFromManifest\(installPath\)/);
  });
});
