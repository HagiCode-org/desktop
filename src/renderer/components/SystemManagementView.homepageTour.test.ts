import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const systemManagementViewPath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');
const onboardingSettingsPath = path.resolve(process.cwd(), 'src/renderer/components/settings/OnboardingSettings.tsx');

describe('homepage tour renderer integration', () => {
  it('gates auto-start to the system homepage, waits for DOM stability, and suppresses onboarding overlap', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    assert.match(source, /const currentView = useSelector\(\(state: RootState\) => state\.view\.currentView\);/);
    assert.match(source, /const onboardingActive = useSelector\(\(state: RootState\) => state\.onboarding\.isActive\);/);
    assert.match(source, /if \(onboardingActive\) \{\s*clearPendingHomepageTourStartup\(\);\s*destroyHomepageTourSession\(false\);/s);
    assert.match(source, /window\.requestAnimationFrame\(\(\) => \{/);
    assert.match(source, /window\.setTimeout\(\(\) => \{/);
    assert.match(source, /shouldAutoStartHomepageTour\(\{ currentView, onboardingActive, steps \}\)/);
    assert.match(source, /destroyHomepageTourSession\(false\);\s*\};\s*\}, \[clearPendingHomepageTourStartup, destroyHomepageTourSession\]\);/s);
  });

  it('adds stable homepage tour anchors and exposes settings replay through the reset helper', async () => {
    const [viewSource, settingsSource] = await Promise.all([
      fs.readFile(systemManagementViewPath, 'utf8'),
      fs.readFile(onboardingSettingsPath, 'utf8'),
    ]);

    assert.match(viewSource, /\[HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE\]: 'hero'/);
    assert.match(viewSource, /\[HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE\]: 'update-reminder'/);
    assert.match(viewSource, /\[HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE\]: 'service-card'/);
    assert.match(viewSource, /\[HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE\]: 'log-access'/);
    assert.match(viewSource, /\[HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE\]: 'version-section'/);
    assert.match(settingsSource, /resetHomepageTourState\(\)/);
    assert.match(settingsSource, /settings\.onboarding\.homepageTour\.resetSuccess/);
    assert.match(settingsSource, /settings\.onboarding\.homepageTour\.resetButton/);
  });
});
