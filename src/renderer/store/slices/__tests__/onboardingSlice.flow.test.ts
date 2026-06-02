import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const typesPath = path.resolve(process.cwd(), 'src/types/onboarding.ts');
const slicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/onboardingSlice.ts');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const wizardPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/OnboardingWizard.tsx');
const managerPath = path.resolve(process.cwd(), 'src/main/onboarding-manager.ts');

describe('onboarding flow contracts', () => {
  it('keeps the six-step full onboarding sequence intact', async () => {
    const [typesSource, sliceSource] = await Promise.all([
      fs.readFile(typesPath, 'utf8'),
      fs.readFile(slicePath, 'utf8'),
    ]);

    assert.match(typesSource, /LanguageSelection = 0/);
    assert.match(typesSource, /Welcome = 1/);
    assert.match(typesSource, /LegalConsent = 2/);
    assert.match(typesSource, /SharingAcceleration = 3/);
    assert.match(typesSource, /DependencyPreparation = 4/);
    assert.match(typesSource, /Download = 5/);
    assert.match(sliceSource, /const fullSequence = \[[\s\S]*OnboardingStep\.LanguageSelection,[\s\S]*OnboardingStep\.Welcome,[\s\S]*OnboardingStep\.LegalConsent,[\s\S]*OnboardingStep\.SharingAcceleration,[\s\S]*OnboardingStep\.DependencyPreparation,[\s\S]*OnboardingStep\.Download,[\s\S]*\] as const;/);
  });

  it('keeps legal-only mode available for consent-only mutable-runtime gating', async () => {
    const sliceSource = await fs.readFile(slicePath, 'utf8');

    assert.match(sliceSource, /const legalOnlySequence = \[OnboardingStep\.LanguageSelection, OnboardingStep\.LegalConsent\] as const;/);
    assert.match(sliceSource, /return mode === 'legal-only' \? \[\.\.\.legalOnlySequence\] : \[\.\.\.fullSequence\];/);
    assert.match(sliceSource, /if \(action\.payload\.mode === 'legal-only'\) \{/);
    assert.match(sliceSource, /state\.isActive = false;/);
    assert.match(sliceSource, /state\.mode = 'none';/);
  });

  it('tracks runtimeProvisioned through trigger, restart, and next-button readiness', async () => {
    const [typesSource, sliceSource, appSource] = await Promise.all([
      fs.readFile(typesPath, 'utf8'),
      fs.readFile(slicePath, 'utf8'),
      fs.readFile(appPath, 'utf8'),
    ]);

    assert.match(typesSource, /export interface OnboardingShowPayload \{[\s\S]*runtimeProvisioned\?: boolean;/);
    assert.match(typesSource, /export interface OnboardingState \{[\s\S]*runtimeProvisioned: boolean;/);
    assert.match(sliceSource, /runtimeProvisioned: false,/);
    assert.match(sliceSource, /restartOnboardingFlow: \(_state, action: PayloadAction<OnboardingShowPayload \| undefined>\) => \(\{[\s\S]*runtimeProvisioned: action\.payload\?\.runtimeProvisioned \?\? false,/);
    assert.match(sliceSource, /state\.runtimeProvisioned = action\.payload\.runtimeProvisioned;/);
    assert.match(sliceSource, /state\.runtimeProvisioned = false;/);
    assert.match(sliceSource, /const \{ currentStep, downloadProgress, isDependencyOperationActive, runtimeProvisioned \} = state\.onboarding;/);
    assert.match(sliceSource, /return runtimeProvisioned \|\| \(downloadProgress\?\.progress === 100 && Boolean\(downloadProgress\.version\)\);/);
    assert.match(appSource, /dispatch\(restartOnboardingFlow\(payload\)\);/);
  });

  it('keeps portable mode on full onboarding until onboarding is completed', async () => {
    const managerSource = await fs.readFile(managerPath, 'utf8');

    assert.match(managerSource, /const mode = this\.versionManager\.isPortableVersionMode\(\) \? 'full' : runtimeProvisioned \? 'legal-only' : 'full';/);
    assert.match(managerSource, /if \(runtimeProvisioned && storedState\.isCompleted\) \{/);
    assert.match(managerSource, /'portable-version-provisioned'/);
    assert.match(managerSource, /getResetOnboardingMode\(\): Exclude<OnboardingMode, 'none'> \{\s*return 'full';\s*\}/s);
  });

  it('finishes portable full onboarding from dependency preparation instead of entering download', async () => {
    const [wizardSource, managerSource] = await Promise.all([
      fs.readFile(wizardPath, 'utf8'),
      fs.readFile(managerPath, 'utf8'),
    ]);

    assert.match(wizardSource, /currentStep === OnboardingStep\.DependencyPreparation && runtimeProvisioned/);
    assert.match(wizardSource, /dispatch\(fetchActiveVersion\(\)\)\.unwrap\(\)\.then\(\(activeVersion\) => \{/);
    assert.match(wizardSource, /dispatch\(completeOnboarding\(activeVersion\.id\)\);/);
    assert.match(wizardSource, /if \(currentStep === OnboardingStep\.DependencyPreparation && runtimeProvisioned\) \{[\s\S]*return t\('actions\.finish'\);/);
    assert.match(managerSource, /if \(!this\.versionManager\.isPortableVersionMode\(\)\) \{/);
    assert.match(managerSource, /await this\.versionManager\.switchVersion\(versionId\);/);
  });
});
