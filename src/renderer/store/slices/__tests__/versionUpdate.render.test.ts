import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const settingsPath = path.resolve(process.cwd(), 'src/renderer/components/settings/VersionUpdateSettings.tsx');
const dashboardPath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');
const slicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/versionUpdateSlice.ts');
const storePath = path.resolve(process.cwd(), 'src/renderer/store/index.ts');


describe('version update renderer integration', () => {
  it('validates retained archive counts before saving settings', async () => {
    const source = await fs.readFile(settingsPath, 'utf8');

    assert.match(source, /Number\.parseInt\(localRetainedArchiveCount, 10\)/);
    assert.match(source, /retainedArchiveCountPositive/);
    assert.match(source, /saveVersionAutoUpdateSettings/);
  });

  it('hydrates the store from the main-process snapshot and subscribes to live update events', async () => {
    const [sliceSource, storeSource] = await Promise.all([
      fs.readFile(slicePath, 'utf8'),
      fs.readFile(storePath, 'utf8'),
    ]);

    assert.match(sliceSource, /fetchVersionUpdateSnapshot/);
    assert.match(sliceSource, /setVersionUpdateSnapshotFromEvent/);
    assert.match(storeSource, /fetchVersionUpdateSnapshot\(\)/);
    assert.match(storeSource, /fetchVersionAutoUpdateSettings\(\)/);
    assert.match(storeSource, /onVersionUpdateChanged/);
  });

  it('renders dashboard reminder states and wires CTA routing into the existing version flow', async () => {
    const source = await fs.readFile(dashboardPath, 'utf8');

    assert.match(source, /selectVisibleVersionUpdateReminder/);
    assert.match(source, /system\.updateReminder\.states/);
    assert.match(source, /handleOpenVersionManagement/);
    assert.match(source, /installWebServicePackage/);
    assert.match(source, /navigateTo\('settings'\)/);
  });
});
