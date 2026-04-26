import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const wizardPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/OnboardingWizard.tsx');
const welcomePath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/steps/WelcomeIntro.tsx');
const zhOnboardingPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/onboarding.json');
const enOnboardingPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/onboarding.json');

describe('onboarding wizard manual handoff integration', () => {
  it('completes onboarding from the download step without wiring launch-step startup side effects', async () => {
    const source = await fs.readFile(wizardPath, 'utf8');

    assert.equal(source.includes('ServiceLauncher'), false);
    assert.equal(source.includes('onServiceProgress'), false);
    assert.equal(source.includes('startService('), false);
    assert.match(source, /currentStep === OnboardingStep\.Download && downloadCompleted && downloadProgress\?\.version/);
    assert.match(source, /dispatch\(completeOnboarding\(downloadProgress\.version\)\);/);
    assert.match(source, /dispatch\(fetchActiveVersion\(\)\);/);
    assert.match(source, /onComplete\?\.\(\);/);
  });

  it('updates welcome and download copy to describe a five-step flow with manual startup after returning home', async () => {
    const [welcomeSource, zhRaw, enRaw] = await Promise.all([
      fs.readFile(welcomePath, 'utf8'),
      fs.readFile(zhOnboardingPath, 'utf8'),
      fs.readFile(enOnboardingPath, 'utf8'),
    ]);
    const zhOnboarding = JSON.parse(zhRaw);
    const enOnboarding = JSON.parse(enRaw);

    assert.equal(welcomeSource.includes("welcome.steps.launch"), false);
    assert.match(welcomeSource, /welcome\.steps\.dependencyPreparation/);
    assert.match(zhOnboarding.welcome.description, /五个步骤/);
    assert.match(enOnboarding.welcome.description, /five steps/i);
    assert.match(String(zhOnboarding.download.complete.message), /返回首页/);
    assert.match(String(zhOnboarding.download.complete.message), /手动启动服务/);
    assert.match(String(enOnboarding.download.complete.message), /return to the homepage/i);
    assert.match(String(enOnboarding.download.complete.message), /start the service manually/i);
    assert.equal(String(zhOnboarding.actions.finish), '进入 Hagicode Desktop');
    assert.equal(String(enOnboarding.actions.finish), 'Enter Hagicode Desktop');
    assert.equal(String(zhOnboarding.legal.progressFull).includes('启动'), false);
    assert.equal(String(enOnboarding.legal.progressFull).includes('Launch'), false);
  });
});
