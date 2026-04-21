import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pagePath = path.resolve(process.cwd(), 'src/renderer/components/VersionManagementPage.tsx');

describe('version management install progress rendering', () => {
  it('renders install progress only for the currently installing version', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /installingVersionId === version\.id/);
    assert.match(source, /renderInstallTelemetry\(version\.id\)/);
    assert.match(source, /versionManagement\.installTelemetry\.mode/);
    assert.match(source, /versionManagement\.installTelemetry\.stage/);
    assert.match(source, /versionManagement\.installTelemetry\.peers/);
    assert.match(source, /versionManagement\.installTelemetry\.verified/);
  });

  it('removes dependency affordances from installed version cards', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.equal(source.includes('VersionDependencyGuidance'), false);
    assert.equal(source.includes('handleToggleDependencies'), false);
    assert.equal(source.includes('getDependencyList('), false);
    assert.equal(source.includes('viewDependencies'), false);
    assert.equal(source.includes('collapseDependencies'), false);
    assert.equal(source.includes('dependencyInfo'), false);
    assert.equal(source.includes('aiGuidance'), false);
  });
});
