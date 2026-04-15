import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const dashboardPath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');
const versionPagePath = path.resolve(process.cwd(), 'src/renderer/components/VersionManagementPage.tsx');
const settingsPagePath = path.resolve(process.cwd(), 'src/renderer/components/SettingsPage.tsx');
const settingsIndexPath = path.resolve(process.cwd(), 'src/renderer/components/settings/index.ts');
const sharingSettingsPath = path.resolve(process.cwd(), 'src/renderer/components/settings/SharingAccelerationSettings.tsx');

describe('portable version renderer integration', () => {
  it('loads distribution mode during bootstrap and redirects version view back to system mode', async () => {
    const source = await fs.readFile(appPath, 'utf-8');

    assert.match(source, /getDistributionMode/);
    assert.match(source, /setDistributionMode\(mode\)/);
    assert.match(source, /distributionMode === 'steam' && currentView === 'version'/);
    assert.match(source, /dispatch\(switchView\('system'\)\)/);
    assert.match(source, /<SystemManagementView distributionMode=\{distributionMode\} \/>/);
  });

  it('hides version navigation while keeping the remaining sidebar items intact', async () => {
    const source = await fs.readFile(sidebarPath, 'utf-8');

    assert.match(source, /distributionMode === 'steam'/);
    assert.match(source, /navigationItems\.filter\(\(item\) => item\.id !== 'version'\)/);
  });

  it('replaces mutable version controls with a portable mode notice when forced open', async () => {
    const source = await fs.readFile(versionPagePath, 'utf-8');

    assert.match(source, /distributionMode === 'steam'/);
    assert.match(source, /versionManagement\.portableMode\.title/);
    assert.match(source, /versionManagement\.portableMode\.activeRuntime/);
    assert.match(source, /versionManagement\.portableMode\.updates/);
  });

  it('suppresses the homepage update reminder and its tour anchor in portable mode', async () => {
    const source = await fs.readFile(dashboardPath, 'utf-8');

    assert.match(source, /distributionMode\?: DistributionMode/);
    assert.match(source, /distributionMode = 'normal'/);
    assert.match(source, /const shouldShowVersionUpdateReminder = distributionMode !== 'steam' && Boolean\(versionUpdateReminder\);/);
    assert.match(source, /shouldShowVersionUpdateReminder,\s*\]\);/s);
    assert.match(source, /shouldShowVersionUpdateReminder \? \(\s*<motion\.div[\s\S]*?\[HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE\]: 'update-reminder'/);
  });

  it('hides the sharing acceleration settings entry in portable mode while keeping the standard mode helper', async () => {
    const settingsPageSource = await fs.readFile(settingsPagePath, 'utf-8');
    const settingsIndexSource = await fs.readFile(settingsIndexPath, 'utf-8');

    assert.match(settingsIndexSource, /shouldShowSharingAccelerationSettings\(distributionMode: DistributionMode\)/);
    assert.match(settingsIndexSource, /distributionMode !== 'steam'/);
    assert.match(settingsPageSource, /const showSharingAccelerationSettings = shouldShowSharingAccelerationSettings\(distributionMode\)/);
    assert.match(settingsPageSource, /showSharingAccelerationSettings \? \(/);
    assert.match(settingsPageSource, /<TabsTrigger\s+value="sharingAcceleration"/s);
  });

  it('passes distribution mode into settings and keeps a portable-mode fallback notice inside the sharing card', async () => {
    const appSource = await fs.readFile(appPath, 'utf-8');
    const sharingSettingsSource = await fs.readFile(sharingSettingsPath, 'utf-8');

    assert.match(appSource, /<SettingsPage distributionMode=\{distributionMode\} \/>/);
    assert.match(sharingSettingsSource, /const isPortableMode = distributionMode === 'steam'/);
    assert.match(sharingSettingsSource, /settings\.sharingAcceleration\.portableModeHint/);
    assert.match(sharingSettingsSource, /disabled=\{loading \|\| saving \|\| isPortableMode\}/);
  });
});
