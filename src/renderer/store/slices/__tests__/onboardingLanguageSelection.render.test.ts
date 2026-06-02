import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const typesPath = path.resolve(process.cwd(), 'src/types/onboarding.ts');
const slicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/onboardingSlice.ts');
const wizardPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/OnboardingWizard.tsx');
const stepPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/steps/LanguageSelectionStep.tsx');
const desktopLanguagesPath = path.resolve(process.cwd(), 'src/shared/desktop-languages.ts');

describe('onboarding language selection renderer wiring', () => {
  it('defines language selection as the first onboarding step in every sequence', async () => {
    const [typesSource, sliceSource] = await Promise.all([
      fs.readFile(typesPath, 'utf8'),
      fs.readFile(slicePath, 'utf8'),
    ]);

    assert.match(typesSource, /LanguageSelection = 0/);
    assert.match(sliceSource, /const fullSequence = \[\s*OnboardingStep\.LanguageSelection,/);
    assert.match(sliceSource, /const legalOnlySequence = \[OnboardingStep\.LanguageSelection, OnboardingStep\.LegalConsent\]/);
    assert.match(sliceSource, /state\.currentStep = OnboardingStep\.LanguageSelection/);
  });

  it('renders the first step from the shared Desktop language catalog and localized action labels', async () => {
    const [wizardSource, stepSource, desktopLanguagesSource] = await Promise.all([
      fs.readFile(wizardPath, 'utf8'),
      fs.readFile(stepPath, 'utf8'),
      fs.readFile(desktopLanguagesPath, 'utf8'),
    ]);

    assert.match(wizardSource, /case OnboardingStep\.LanguageSelection:/);
    assert.match(wizardSource, /<LanguageSelectionStep/);
    assert.match(wizardSource, /t\('actions\.continueWithLanguage'/);
    assert.match(stepSource, /DESKTOP_LANGUAGES\.map/);
    assert.match(stepSource, /DEFAULT_DESKTOP_LANGUAGE/);
    assert.match(stepSource, /language\.nativeName/);
    assert.match(stepSource, /language\.code/);
    assert.match(stepSource, /grid gap-3 md:grid-cols-2 xl:grid-cols-3/);
    assert.match(stepSource, /group flex min-h-36 flex-col rounded-2xl border bg-card p-4 text-left transition-all/);
    assert.match(stepSource, /text-base font-semibold leading-tight/);
    assert.match(desktopLanguagesSource, /export const DESKTOP_LANGUAGES/);
  });

  it('blocks advancement when Desktop language persistence fails and exposes retryable state', async () => {
    const wizardSource = await fs.readFile(wizardPath, 'utf8');

    assert.match(wizardSource, /await dispatch\(changeLanguage\(selectedLanguage\)\)\.unwrap\(\);/);
    assert.match(wizardSource, /setLanguageStepPending\(true\);/);
    assert.match(wizardSource, /setLanguageStepError\(null\);/);
    assert.match(wizardSource, /setLanguageStepError\(error instanceof Error \? error\.message : 'Failed to save language'\);/);
    assert.match(wizardSource, /const effectiveCanGoNext = currentStep === OnboardingStep\.LanguageSelection/);
  });
});
