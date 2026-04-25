import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

describe('DependencyManagementCardUnified bundled toolchain rendering', () => {
  it('renders Desktop-managed source labels and manual-install handoff copy', async () => {
    const source = await fs.readFile(
      path.resolve('src/renderer/components/DependencyManagementCardUnified.tsx'),
      'utf8',
    );
    const enComponents = JSON.parse(await fs.readFile(
      path.resolve('src/renderer/i18n/locales/en-US/components.json'),
      'utf8',
    ));

    assert.match(source, /resolutionSource === 'bundled-desktop'/);
    assert.match(source, /dependencyManagement\.status\.desktopManaged/);
    assert.match(source, /dependencyManagement\.status\.manualInstallRequired/);
    assert.match(source, /dependencyManagement\.details\.bundledSource/);
    assert.match(source, /dependencyManagement\.details\.manualCommand/);
    assert.match(source, /dependencyManagement\.manualHandoff\.title/);
    assert.equal(enComponents.dependencyManagement.status.desktopManaged, 'Desktop managed');
    assert.equal(enComponents.dependencyManagement.details.bundledSource, 'Bundled source');
    assert.equal(enComponents.dependencyManagement.status.manualInstallRequired, 'Manual install required');
    assert.match(source, /getDependencyStatusText/);
  });
});
