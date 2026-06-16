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
const settingsHookPath = path.resolve(process.cwd(), 'src/renderer/features/settings/hooks/useSettingsTab.ts');
const builtInTabsPath = path.resolve(process.cwd(), 'src/renderer/features/settings/components/tabs/builtInTabs.tsx');
const updateSettingsPath = path.resolve(process.cwd(), 'src/renderer/components/settings/VersionUpdateSettings.tsx');
const sharingSettingsPath = path.resolve(process.cwd(), 'src/renderer/components/settings/SharingAccelerationSettings.tsx');
const onboardingWizardPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/OnboardingWizard.tsx');

describe('portable version renderer integration', () => {
  it('loads distribution state during bootstrap and redirects version view back to system mode', async () => {
    const source = await fs.readFile(appPath, 'utf-8');

    assert.match(source, /getDistributionModeState/);
    assert.match(source, /setDistributionState\(resolvedState\)/);
    assert.match(source, /dispatch\(setOnboardingDistributionState\(distributionState\)\)/);
    assert.match(source, /distributionState\.fusionMode && currentView === 'version'/);
    assert.match(source, /dispatch\(switchView\('system'\)\)/);
    assert.match(source, /<SystemManagementView distributionState=\{distributionState\} \/>/);
  });

  it('hides version navigation while keeping the remaining sidebar items intact', async () => {
    const source = await fs.readFile(sidebarPath, 'utf-8');

    assert.match(source, /const isFusionMode = distributionState\.fusionMode;/);
    assert.match(source, /primaryNavigationItems\.filter\(\(item\) => item\.id !== 'version'\)/);
    assert.match(source, /t\('sidebar\.desktopVersion'\)/);
    assert.match(source, /t\('sidebar\.webVersion'\)/);
    assert.match(source, /t\('sidebar\.windowsStoreVersion'\)/);
  });

  it('shows desktop, web, and optional windows store version fields in the portable sidebar footer', async () => {
    const source = await fs.readFile(sidebarPath, 'utf-8');

    assert.match(source, /const \[versionInfo, setVersionInfo\] = useState<DesktopVersionInfoPayload \| null>\(null\);/);
    assert.match(source, /window\.electronAPI\.getVersionInfo\(\)/);
    assert.match(source, /const \[webVersion, setWebVersion\] = useState<string \| null>\(null\);/);
    assert.match(source, /window\.electronAPI\.getWebServiceVersion\(\)/);
    assert.match(source, /isFusionMode \? \(/);
    assert.match(source, /t\('sidebar\.desktopVersion'\)/);
    assert.match(source, /t\('sidebar\.webVersion'\)/);
    assert.match(source, /t\('sidebar\.windowsStoreVersion'\)/);
    assert.match(source, /\{windowsStoreVersion \? \(/);
  });

  it('keeps the web version row visible and hides the windows store row when it is unresolved', async () => {
    const source = await fs.readFile(sidebarPath, 'utf-8');

    assert.match(source, /setWebVersion\('unknown'\)/);
    assert.match(source, /const resolvedWebVersion = webVersion && webVersion !== 'unknown'/);
    assert.match(source, /t\('sidebar\.unknownVersion'\)/);
    assert.match(source, /const windowsStoreVersion = versionInfo\?\.windowsStoreVersion \?\? null;/);
    assert.match(source, /<p className="text-xs text-foreground break-all">\s*\{resolvedWebVersion\}\s*<\/p>/);
    assert.doesNotMatch(source, /windowsStoreVersionUnavailable/);
  });

  it('replaces mutable version controls with a portable mode notice when forced open', async () => {
    const source = await fs.readFile(versionPagePath, 'utf-8');

    assert.match(source, /distributionState\.fusionMode/);
    assert.match(source, /versionManagement\.portableMode\.title/);
    assert.match(source, /versionManagement\.portableMode\.activeRuntime/);
    assert.match(source, /versionManagement\.portableMode\.updates/);
  });

  it('suppresses the homepage update reminder and its tour anchor in portable mode', async () => {
    const source = await fs.readFile(dashboardPath, 'utf-8');

    assert.match(source, /distributionState\?: DistributionModeState/);
    assert.match(source, /distributionState = createDefaultDistributionModeState\(\)/);
    assert.match(source, /const shouldShowVersionUpdateReminder = !distributionState\.fusionMode && Boolean\(versionUpdateReminder\);/);
    assert.match(source, /shouldShowVersionUpdateReminder,\s*\]\);/s);
    assert.match(source, /shouldShowVersionUpdateReminder \? \(\s*<motion\.div[\s\S]*?\[HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE\]: 'update-reminder'/);
  });

  it('hides the sharing acceleration settings entry in portable mode while keeping the standard mode helper', async () => {
    const [settingsPageSource, settingsIndexSource, settingsHookSource] = await Promise.all([
      fs.readFile(settingsPagePath, 'utf-8'),
      fs.readFile(settingsIndexPath, 'utf-8'),
      fs.readFile(settingsHookPath, 'utf-8'),
    ]);

    assert.match(settingsIndexSource, /shouldShowSharingAccelerationSettings\(distributionState: Pick<DistributionModeState, 'fusionMode'>\)/);
    assert.match(settingsIndexSource, /return !distributionState\.fusionMode;/);
    assert.match(settingsPageSource, /const showSharingAccelerationSettings = shouldShowSharingAccelerationSettings\(distributionState\)/);
    assert.match(settingsHookSource, /if \(showSharingAccelerationSettings\) \{/);
    assert.match(settingsHookSource, /id: 'sharingAcceleration'/);
  });

  it('passes fusion distribution state into background update settings and keeps managed update copy there', async () => {
    const [builtInTabsSource, updateSettingsSource] = await Promise.all([
      fs.readFile(builtInTabsPath, 'utf-8'),
      fs.readFile(updateSettingsPath, 'utf-8'),
    ]);

    assert.match(builtInTabsSource, /export function VersionUpdateSettingsTab\(\{ distributionState \}: SettingsTabComponentProps\)/);
    assert.match(builtInTabsSource, /<VersionUpdateSettings distributionState=\{distributionState\} \/>/);
    assert.match(updateSettingsSource, /const isManagedMode = distributionState\.fusionMode;/);
    assert.match(updateSettingsSource, /settings\.updates\.managedInstall\.title/);
  });

  it('passes distribution state into settings and keeps a portable-mode fallback notice inside the sharing card', async () => {
    const appSource = await fs.readFile(appPath, 'utf-8');
    const sharingSettingsSource = await fs.readFile(sharingSettingsPath, 'utf-8');

    assert.match(appSource, /<SettingsPage distributionState=\{distributionState\} \/>/);
    assert.match(sharingSettingsSource, /const isPortableMode = distributionState\.fusionMode;/);
    assert.match(sharingSettingsSource, /settings\.sharingAcceleration\.portableModeHint/);
    assert.match(sharingSettingsSource, /disabled=\{loading \|\| saving \|\| isPortableMode\}/);
  });

  it('uses distribution state when computing onboarding progress so fusion mode skips sharing acceleration', async () => {
    const source = await fs.readFile(onboardingWizardPath, 'utf-8');

    assert.match(source, /selectOnboardingDistributionState/);
    assert.match(source, /const distributionState = useSelector\(\(state: RootState\) => selectOnboardingDistributionState\(state\)\);/);
    assert.match(source, /getOnboardingSequence\(mode, dependencyModeSettings, distributionState\)/);
  });
});
