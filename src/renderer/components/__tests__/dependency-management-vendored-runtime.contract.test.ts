import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pagePath = path.resolve(process.cwd(), 'src/renderer/components/DependencyManagementPage.tsx');

describe('dependency management runtime separation contract', () => {
  it('keeps Desktop-managed runtime lifecycle controls out of dependency management', async () => {
    const pageSource = await fs.readFile(pagePath, 'utf8');

    assert.match(pageSource, /vendoredRuntimes = snapshot\?\.vendoredRuntimes \?\? \[\]/);
    assert.doesNotMatch(pageSource, /bridge\.startVendoredRuntime\(runtime\.id\)/);
    assert.doesNotMatch(pageSource, /bridge\.stopVendoredRuntime\(runtime\.id\)/);
    assert.doesNotMatch(pageSource, /bridge\.restartVendoredRuntime\(runtime\.id\)/);
    assert.doesNotMatch(pageSource, /bridge\.repairVendoredRuntime\(runtime\.id\)/);
    assert.doesNotMatch(pageSource, /openVendoredRuntimePath\(runtime\.id, target\)/);
    assert.doesNotMatch(pageSource, /<VendoredRuntimeCard/);
    assert.doesNotMatch(pageSource, /dependencyManagement\.vendoredRuntime\.title/);
  });
});
