import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const wizardPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/OnboardingWizard.tsx');
const welcomePath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/steps/WelcomeIntro.tsx');
const legalConsentPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/steps/LegalConsentStep.tsx');
const zhOnboardingPath = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales/zh-CN/onboarding.json');
const enOnboardingPath = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales/en-US/onboarding.json');
const onboardingManagerPath = path.resolve(process.cwd(), 'src/main/onboarding-manager.ts');

describe('onboarding wizard manual handoff integration', () => {
  it('completes onboarding from the download step without wiring launch-step startup side effects', async () => {
    const source = await fs.readFile(wizardPath, 'utf8');

    assert.equal(source.includes('ServiceLauncher'), false);
    assert.equal(source.includes('onServiceProgress'), false);
    assert.equal(source.includes('startService('), false);
    assert.match(source, /currentStep === OnboardingStep\.Download && downloadCompleted && downloadProgress\?\.version/);
    assert.match(source, /await dispatch\(completeOnboarding\(downloadProgress\.version\)\)\.unwrap\(\);/);
    assert.match(source, /void dispatch\(fetchActiveVersion\(\)\);/);
    assert.match(source, /onComplete\?\.\(\);/);
    assert.match(source, /currentStep === OnboardingStep\.DependencyPreparation && runtimeProvisioned/);
    assert.match(source, /await dispatch\(completeOnboarding\(activeVersion\.id\)\)\.unwrap\(\);/);
    assert.match(source, /window\.electronAPI\.versionGetInstalled\(\)/);
    assert.match(source, /await dispatch\(completeOnboarding\(fallbackVersion\.id\)\)\.unwrap\(\);/);
  });

  it('does not open Hagicode automatically when onboarding is completed', async () => {
    const source = await fs.readFile(onboardingManagerPath, 'utf8');

    const completeOnboardingBody = source.slice(
      source.indexOf('async completeOnboarding'),
      source.indexOf('/**\n   * Reset onboarding state')
    );

    assert.match(completeOnboardingBody, /version:activeVersionChanged/);
    assert.doesNotMatch(completeOnboardingBody, /getStatus\(/);
    assert.doesNotMatch(completeOnboardingBody, /onboarding:open-hagicode/);
  });

  it('keeps the onboarding shell within the viewport and lets the step body scroll', async () => {
    const source = await fs.readFile(wizardPath, 'utf8');

    assert.match(source, /fixed inset-0 z-50 overflow-hidden bg-background\/95 px-4 py-4 sm:px-6 sm:py-6/);
    assert.match(source, /mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4/);
    assert.match(source, /flex flex-shrink-0 flex-col gap-4 rounded-2xl border bg-card px-6 py-5 shadow-sm/);
    assert.match(source, /<div className="flex-1 overflow-y-auto p-6 sm:p-8">\{renderStep\(\)\}<\/div>/);
  });

  it('updates welcome and progress copy to support variable step counts while keeping manual startup messaging', async () => {
    const [welcomeSource, zhRaw, enRaw] = await Promise.all([
      fs.readFile(welcomePath, 'utf8'),
      fs.readFile(zhOnboardingPath, 'utf8'),
      fs.readFile(enOnboardingPath, 'utf8'),
    ]);
    const zhOnboarding = JSON.parse(zhRaw);
    const enOnboarding = JSON.parse(enRaw);

    assert.equal(welcomeSource.includes("welcome.steps.launch"), false);
    assert.match(welcomeSource, /welcome\.steps\.languageSelection/);
    assert.match(welcomeSource, /welcome\.steps\.dependencyPreparation/);
    assert.match(welcomeSource, /const steps = stepSequence\.map\(\(step, index\) => \(\{/);
    assert.match(welcomeSource, /t\('welcome\.description', \{ count: steps\.length \}\)/);
    assert.match(welcomeSource, /t\('welcome\.processTitle', \{ count: steps\.length \}\)/);
    assert.match(String(zhOnboarding.welcome.description), /\{\{count\}\}/);
    assert.match(String(enOnboarding.welcome.description), /\{\{count\}\}/);
    assert.match(String(zhOnboarding.download.complete.message), /返回首页/);
    assert.match(String(zhOnboarding.download.complete.message), /手动启动服务/);
    assert.match(String(enOnboarding.download.complete.message), /return to the homepage/i);
    assert.match(String(enOnboarding.download.complete.message), /start the service manually/i);
    assert.equal(String(zhOnboarding.actions.finish), '进入 Hagicode Desktop');
    assert.equal(String(enOnboarding.actions.finish), 'Enter Hagicode Desktop');
    assert.match(String(zhOnboarding.legal.progressFull), /\{\{steps\}\}/);
    assert.match(String(enOnboarding.legal.progressFull), /\{\{steps\}\}/);
  });

  it('completes consent immediately when fusion onboarding has no remaining post-legal steps', async () => {
    const source = await fs.readFile(legalConsentPath, 'utf8');

    assert.match(source, /const shouldCompleteAfterAccept = useMemo\(\(\) => \{/);
    assert.match(source, /const sequence = getOnboardingSequence\(mode, dependencyModeSettings, distributionState\);/);
    assert.match(source, /return sequence\[sequence\.length - 1\] === OnboardingStep\.LegalConsent;/);
    assert.match(source, /await dispatch\(fetchActiveVersion\(\)\)\.unwrap\(\);/);
    assert.match(source, /await dispatch\(completeOnboarding\(activeVersion\.id\)\)\.unwrap\(\);/);
    assert.match(source, /window\.electronAPI\.versionGetInstalled\(\)/);
    assert.match(source, /await dispatch\(completeOnboarding\(fallbackVersion\.id\)\)\.unwrap\(\);/);
  });
});
