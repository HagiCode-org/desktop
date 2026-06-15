import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const homepagePath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');
const thunkPath = path.resolve(process.cwd(), 'src/renderer/store/thunks/webServiceThunks.ts');

describe('homepage latest-version install auto-switch integration', () => {
  it('keeps the homepage view subscribed to active-version changes so the current version card refreshes after auto-switch', async () => {
    const source = await fs.readFile(homepagePath, 'utf8');

    assert.match(source, /versionGetInstalled: \(\) => Promise<InstalledVersion\[\]>/);
    assert.match(source, /const \[installedVersions, setInstalledVersions\] = useState<InstalledVersion\[\]>\(\[\]\);/);
    assert.match(source, /window\.electronAPI\.versionGetInstalled\(\)/);
    assert.match(source, /onInstalledVersionsChanged\(\(versions\) => \{\s*setInstalledVersions\(versions\);/s);
    assert.match(source, /onActiveVersionChanged\(\(version\) => \{\s*setActiveVersion\(version\);\s*void loadLogTargets\(false\);/s);
    assert.match(source, /activeVersion\.packageFilename/);
    assert.match(source, /activeVersion\.platform/);
  });

  it('shows version management instead of the onboarding wizard when runtimes are installed but no active version is selected', async () => {
    const source = await fs.readFile(homepagePath, 'utf8');

    assert.match(source, /const hasInstalledVersions = installedVersions\.length > 0;/);
    assert.match(source, /\) : hasInstalledVersions \? \(/);
    assert.match(source, /system\.noActiveVersion\.title/);
    assert.match(source, /system\.noActiveVersion\.description/);
    assert.match(source, /system\.noActiveVersion\.manageVersions/);
  });

  it('uses dedicated success feedback for the auto-switched and not-auto-switched install outcomes', async () => {
    const source = await fs.readFile(thunkPath, 'utf8');

    assert.match(source, /installSuccessAutoSwitchedDescription/);
    assert.match(source, /installSuccessNoAutoSwitchDescription/);
    assert.match(source, /installSuccessDescription/);
  });
});
