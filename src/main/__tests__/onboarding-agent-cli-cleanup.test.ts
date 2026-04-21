import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const onboardingWizardPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/OnboardingWizard.tsx');
const onboardingLocalePath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/onboarding.json');

describe('onboarding Agent CLI cleanup', () => {
  it('does not wire the retired Agent CLI step into the onboarding flow', async () => {
    const [wizardSource, localeSource] = await Promise.all([
      fs.readFile(onboardingWizardPath, 'utf8'),
      fs.readFile(onboardingLocalePath, 'utf8'),
    ]);

    assert.equal(wizardSource.includes('AgentCliSelection'), false);
    assert.equal(wizardSource.includes('agentCli'), false);
    assert.equal(localeSource.includes('"agent-cli"'), false);
    assert.match(wizardSource, /case OnboardingStep\.SharingAcceleration:/);
    assert.match(wizardSource, /case OnboardingStep\.Download:/);
  });
});
