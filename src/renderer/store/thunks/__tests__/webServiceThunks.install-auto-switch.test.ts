import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const thunkPath = path.resolve(process.cwd(), 'src/renderer/store/thunks/webServiceThunks.ts');
const homepagePath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');
const versionPagePath = path.resolve(process.cwd(), 'src/renderer/components/VersionManagementPage.tsx');

describe('web service install thunk auto-switch contract', () => {
  it('passes install options through the thunk and preserves them across the stop-service confirmation flow', async () => {
    const source = await fs.readFile(thunkPath, 'utf8');

    assert.match(source, /normalizeInstallWebServicePackageRequest/);
    assert.match(source, /dispatch\(showInstallConfirm\(\{ version, options \}\)\)/);
    assert.match(source, /pendingInstallOptions: InstallWebServicePackageOptions \| null/);
    assert.match(source, /window\.electronAPI\.installWebServicePackage\(version, options\)/);
  });

  it('keeps homepage installs opt-in for auto-switch while version management stays on the legacy call shape', async () => {
    const [homepageSource, versionPageSource] = await Promise.all([
      fs.readFile(homepagePath, 'utf8'),
      fs.readFile(versionPagePath, 'utf8'),
    ]);

    assert.match(homepageSource, /dispatch\(installWebServicePackage\(\{\s*version: versionUpdateReminder\.latestVersion\.id,\s*options: \{\s*autoSwitchWhenIdle: true,/s);
    assert.match(versionPageSource, /dispatch\(installWebServicePackage\(versionId\)\);/);
    assert.match(versionPageSource, /dispatch\(installWebServicePackage\(pendingVersionId\)\);/);
  });
});
