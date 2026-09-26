import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pagePath = path.resolve(process.cwd(), 'src/renderer/components/VersionManagementPage.tsx');
const newVersionsPath = path.resolve(process.cwd(), 'src/renderer/features/version-management/components/NewVersionsTab.tsx');
const downloadedVersionsPath = path.resolve(process.cwd(), 'src/renderer/features/version-management/components/DownloadedVersionsTab.tsx');
const versionTypesPath = path.resolve(process.cwd(), 'src/renderer/features/version-management/types.ts');

describe('version management install progress rendering', () => {
  it('renders install progress only for the currently installing version', async () => {
    const [source, newVersionsSource, downloadedVersionsSource, versionTypesSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(newVersionsPath, 'utf8'),
      fs.readFile(downloadedVersionsPath, 'utf8'),
      fs.readFile(versionTypesPath, 'utf8'),
    ]);

    assert.match(newVersionsSource, /installingVersionId === version\.id/);
    assert.match(newVersionsSource, /renderInstallTelemetry\(version\.id\)/);
    assert.match(newVersionsSource, /aria-disabled=\{isInstallingCurrentVersion/);
    assert.match(newVersionsSource, /role="progressbar"/);
    assert.match(downloadedVersionsSource, /installingVersionId === version\.id/);
    assert.match(downloadedVersionsSource, /aria-disabled=\{isInstallingCurrentVersion/);
    assert.match(downloadedVersionsSource, /role="progressbar"/);
    assert.match(source, /versionManagement\.installTelemetry\.mode/);
    assert.match(source, /versionManagement\.installTelemetry\.stage/);
    assert.match(source, /webServiceInstallProgress\.percentage/);
    assert.match(source, /versionManagement\.installTelemetry\.verified/);
    assert.doesNotMatch(source, /peers|p2pBytes|fallbackBytes|shared-acceleration|fetching-torrent|backfilling/);
    assert.match(source, /'switching': t\('versionManagement\.switching'\)/);
    assert.doesNotMatch(versionTypesSource, /hybrid|torrent|peer|seeding/i);
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
