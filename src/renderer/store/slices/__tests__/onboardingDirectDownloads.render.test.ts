import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const rootPath = path.resolve(process.cwd());
const slicePath = path.join(rootPath, 'src/renderer/store/slices/onboardingSlice.ts');
const onboardingTypesPath = path.join(rootPath, 'src/types/onboarding.ts');
const wizardPath = path.join(rootPath, 'src/renderer/components/onboarding/OnboardingWizard.tsx');
const legalStepPath = path.join(rootPath, 'src/renderer/components/onboarding/steps/LegalConsentStep.tsx');
const versionPagePath = path.join(rootPath, 'src/renderer/components/VersionManagementPage.tsx');
const preloadPath = path.join(rootPath, 'src/preload/index.ts');
const mainPath = path.join(rootPath, 'src/main/main.ts');
const localeRoot = path.join(rootPath, 'src/renderer/i18n/locales');

describe('direct-download onboarding renderer', () => {
  it('uses full, legal-only, and bundled-runtime onboarding sequences', async () => {
    const source = await fs.readFile(slicePath, 'utf8');

    assert.match(source, /const fullSequence = \[\s*OnboardingStep\.LanguageSelection,\s*OnboardingStep\.Welcome,\s*OnboardingStep\.LegalConsent,\s*OnboardingStep\.Download,\s*\]/);
    assert.match(source, /const legalOnlySequence = \[OnboardingStep\.LanguageSelection, OnboardingStep\.LegalConsent\]/);
    assert.match(source, /function shouldHideDownloadStep\(distributionState: DistributionModeState\) \{\s*return distributionState\.fusionMode;/);
    assert.match(source, /sequence = sequence\.filter\(\(step\) => step !== OnboardingStep\.Download\)/);
    assert.doesNotMatch(source, /SharingAcceleration|sharingAcceleration/);
  });

  it('transitions from consent to download, and completes consent-only flows', async () => {
    const [wizard, legalStep, slice] = await Promise.all([
      fs.readFile(wizardPath, 'utf8'),
      fs.readFile(legalStepPath, 'utf8'),
      fs.readFile(slicePath, 'utf8'),
    ]);

    assert.match(wizard, /case OnboardingStep\.LegalConsent:\s*return <LegalConsentStep/);
    assert.match(legalStep, /sequence\[sequence\.length - 1\] === OnboardingStep\.LegalConsent/);
    assert.match(slice, /state\.currentStep = getNextStep\(state\.mode, OnboardingStep\.LegalConsent, state\.distributionState\)/);
    assert.doesNotMatch(wizard, /SharingAcceleration|sharingAcceleration/);
  });

  it('keeps direct-download and digest verification progress without peer-specific status', async () => {
    const [source, onboardingTypes] = await Promise.all([
      fs.readFile(versionPagePath, 'utf8'),
      fs.readFile(onboardingTypesPath, 'utf8'),
    ]);

    assert.match(source, /webServiceInstallProgress\.percentage/);
    assert.match(source, /versionManagement\.installTelemetry\.verified/);
    assert.match(source, /versionManagement\.downloadStage\.downloading/);
    assert.doesNotMatch(source, /peers|p2pBytes|fallbackBytes|shared-acceleration|fetching-torrent|backfilling/);
    assert.doesNotMatch(onboardingTypes, /fetching-torrent|backfilling|shared-acceleration|peers|p2pBytes|fallbackBytes/);
  });

  it('removes sharing preference IPC and obsolete torrent translation keys from every locale', async () => {
    const [preload, main, localeNames] = await Promise.all([
      fs.readFile(preloadPath, 'utf8'),
      fs.readFile(mainPath, 'utf8'),
      fs.readdir(localeRoot),
    ]);

    assert.doesNotMatch(preload, /sharingAcceleration|sharing-acceleration|recordOnboardingChoice/);
    assert.doesNotMatch(main, /sharing-acceleration:(get|set|record-onboarding-choice)/);

    for (const locale of localeNames) {
      const localePath = path.join(localeRoot, locale);
      const stat = await fs.stat(localePath);
      if (!stat.isDirectory()) continue;

      const [onboarding, pages] = await Promise.all([
        fs.readFile(path.join(localePath, 'onboarding.yml'), 'utf8'),
        fs.readFile(path.join(localePath, 'pages.yml'), 'utf8'),
      ]);
      assert.doesNotMatch(`${onboarding}\n${pages}`, /sharingAcceleration|torrent|WebSeed|fetching-torrent|backfilling|shared-acceleration|peers:/i, locale);
      assert.match(onboarding, /^    download: .+$/m, locale);
      assert.match(pages, /^    downloading: .+$/m, locale);
      assert.match(pages, /^    sha256-verifying: .+$/m, locale);
    }
  });
});
