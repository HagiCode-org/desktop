import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const dashboardPath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');
const versionPagePath = path.resolve(process.cwd(), 'src/renderer/components/VersionManagementPage.tsx');
const builtInTabsPath = path.resolve(process.cwd(), 'src/renderer/features/settings/components/tabs/builtInTabs.tsx');
const updateSettingsPath = path.resolve(process.cwd(), 'src/renderer/components/settings/VersionUpdateSettings.tsx');
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

  it('keeps fusion mode in onboarding progress while all modes omit the removed acceleration step', async () => {
    const source = await fs.readFile(onboardingWizardPath, 'utf-8');

    assert.match(source, /selectOnboardingDistributionState/);
    assert.match(source, /const distributionState = useSelector\(\(state: RootState\) => selectOnboardingDistributionState\(state\)\);/);
    assert.match(source, /getOnboardingSequence\(mode, distributionState\)/);
    assert.doesNotMatch(source, /SharingAcceleration|sharingAcceleration/);
  });
});
