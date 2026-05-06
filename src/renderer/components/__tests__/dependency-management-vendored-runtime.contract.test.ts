import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pagePath = path.resolve(process.cwd(), 'src/renderer/components/DependencyManagementPage.tsx');
const groupPath = path.resolve(process.cwd(), 'src/renderer/components/dependency-management/NpmPackageGroups.tsx');
const enLocalePath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/common.yml');

describe('dependency management vendored runtime renderer contract', () => {
  it('renders Desktop-managed vendored runtime cards and wires lifecycle actions', async () => {
    const [pageSource, groupSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(groupPath, 'utf8'),
    ]);

    assert.match(pageSource, /vendoredRuntimes = snapshot\?\.vendoredRuntimes \?\? \[\]/);
    assert.match(pageSource, /bridge\.startVendoredRuntime\(runtime\.id\)/);
    assert.match(pageSource, /bridge\.stopVendoredRuntime\(runtime\.id\)/);
    assert.match(pageSource, /bridge\.restartVendoredRuntime\(runtime\.id\)/);
    assert.match(pageSource, /bridge\.repairVendoredRuntime\(runtime\.id\)/);
    assert.match(pageSource, /openVendoredRuntimePath\(runtime\.id, target\)/);
    assert.match(pageSource, /<VendoredRuntimeCard/);
    assert.match(groupSource, /dependencyManagement\.vendoredRuntime\.status/);
    assert.match(groupSource, /dependencyManagement\.vendoredRuntime\.actions\.openLogs/);
    assert.match(groupSource, /dependencyManagement\.vendoredRuntime\.actions\.openRuntimeRoot/);
    assert.match(groupSource, /dependencyManagement\.vendoredRuntime\.actions\.openUrl/);
  });

  it('defines the English vendored runtime copy', async () => {
    const source = await fs.readFile(enLocalePath, 'utf8');

    assert.match(source, /vendoredRuntime:/);
    assert.match(source, /title: Desktop-managed runtimes/);
    assert.match(source, /code-server runtime staged from vendored artifacts/);
  });
});
