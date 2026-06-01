import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pagePath = path.resolve(process.cwd(), 'src/renderer/components/DependencyManagementPage.tsx');

describe('dependency management runtime separation contract', () => {
  it('keeps Desktop-managed runtime UI separate from npm package operations and hides it when empty', async () => {
    const pageSource = await fs.readFile(pagePath, 'utf8');

    assert.match(pageSource, /vendoredRuntimes = snapshot\?\.vendoredRuntimes \?\? \[\]/);
    assert.match(pageSource, /const runVendoredRuntimeAction = async/);
    assert.match(pageSource, /bridge\.enableVendoredRuntime\(runtimeId\)/);
    assert.match(pageSource, /bridge\.startVendoredRuntime\(runtimeId\)/);
    assert.match(pageSource, /bridge\.stopVendoredRuntime\(runtimeId\)/);
    assert.match(pageSource, /bridge\.restartVendoredRuntime\(runtimeId\)/);
    assert.match(pageSource, /bridge\.repairVendoredRuntime\(runtimeId\)/);
    assert.match(pageSource, /openVendoredRuntimePath\(runtimeId, 'logs'\)/);
    assert.match(pageSource, /openVendoredRuntimePath\(runtimeId, 'runtime-root'\)/);
    assert.match(pageSource, /const hasVendoredRuntimes = vendoredRuntimes\.length > 0;/);
    assert.match(pageSource, /\{hasVendoredRuntimes && \(/);
    assert.match(pageSource, /<VendoredRuntimeCard/);
    assert.match(pageSource, /dependencyManagement\.vendoredRuntime\.title/);
    assert.match(pageSource, /onVendoredRuntimeActivationProgress/);
    assert.match(pageSource, /activeRuntimeActivation:/);
    assert.doesNotMatch(pageSource, /bridge\.install\(runtimeId\)/);
    assert.doesNotMatch(pageSource, /bridge\.uninstall\(runtimeId\)/);
  });
});
