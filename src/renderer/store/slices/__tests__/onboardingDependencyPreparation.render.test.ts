import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const typesPath = path.resolve(process.cwd(), 'src/types/onboarding.ts');
const slicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/onboardingSlice.ts');
const thunksPath = path.resolve(process.cwd(), 'src/renderer/store/thunks/onboardingThunks.ts');
const wizardPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/OnboardingWizard.tsx');
const stepPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/steps/DependencyPreparationStep.tsx');
const zhOnboardingPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/onboarding.json');
const enOnboardingPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/onboarding.json');

describe('onboarding dependency preparation integration', () => {
  it('inserts dependency preparation between sharing acceleration and download while preserving selection state', async () => {
    const [typesSource, sliceSource, wizardSource] = await Promise.all([
      fs.readFile(typesPath, 'utf8'),
      fs.readFile(slicePath, 'utf8'),
      fs.readFile(wizardPath, 'utf8'),
    ]);

    assert.match(typesSource, /DependencyPreparation = 3/);
    assert.match(sliceSource, /OnboardingStep\.SharingAcceleration,[\s\S]*OnboardingStep\.DependencyPreparation,[\s\S]*OnboardingStep\.Download/);
    assert.match(sliceSource, /selectedAgentCliPackageIds: defaultSelectedAgentCliPackageIds/);
    assert.match(sliceSource, /state\.currentStep = OnboardingStep\.DependencyPreparation;/);
    assert.match(sliceSource, /if \(state\.isDependencyPreparationComplete\) \{\s*state\.currentStep = OnboardingStep\.Download;/);
    assert.match(wizardSource, /case OnboardingStep\.DependencyPreparation:[\s\S]*<DependencyPreparationStep \/>/);
    assert.match(wizardSource, /currentStep === OnboardingStep\.DependencyPreparation \? isDependencyPreparationComplete : canGoNext/);
    assert.equal(wizardSource.includes('currentStep === OnboardingStep.SharingAcceleration && !isDownloading'), false);
    assert.match(wizardSource, /currentStep === OnboardingStep\.DependencyPreparation[\s\S]*!isDependencyPreparationComplete[\s\S]*dispatch\(goToNextStep\(\)\);[\s\S]*dispatch\(downloadPackage\(\)\);/);
  });

  it('loads snapshots, subscribes to progress, installs hagiscript first, and recomputes shared readiness', async () => {
    const [sliceSource, thunksSource, stepSource] = await Promise.all([
      fs.readFile(slicePath, 'utf8'),
      fs.readFile(thunksPath, 'utf8'),
      fs.readFile(stepPath, 'utf8'),
    ]);

    assert.match(sliceSource, /evaluateDependencyReadiness\(snapshot, state\.selectedAgentCliPackageIds\)/);
    assert.match(sliceSource, /state\.dependencySnapshotStatus = 'loading'/);
    assert.match(sliceSource, /state\.isDependencyOperationActive = true/);
    assert.match(thunksSource, /dependencyManagement\.getSnapshot\(\)/);
    assert.match(thunksSource, /dependencyManagement\.refresh\(\)/);
    assert.match(thunksSource, /packageIds\.includes\('hagiscript'\)/);
    assert.match(thunksSource, /dependencyManagement\.install\('hagiscript'\)/);
    assert.match(thunksSource, /dependencyManagement\.syncPackages\(\{ packageIds: syncPackageIds \}\)/);
    assert.match(stepSource, /dependencyManagement\.onProgress/);
    assert.match(stepSource, /setOnboardingDependencyProgress\(event\)/);
    assert.match(stepSource, /confirmDisabled = !environmentAvailable \|\| isDependencyOperationActive \|\| !hasSelectedAgentCli/);
  });

  it('adds localized Desktop-managed npm environment and readiness copy', async () => {
    const [zhRaw, enRaw] = await Promise.all([
      fs.readFile(zhOnboardingPath, 'utf8'),
      fs.readFile(enOnboardingPath, 'utf8'),
    ]);
    const zh = JSON.parse(zhRaw);
    const en = JSON.parse(enRaw);

    assert.equal(typeof zh.dependencyPreparation.title, 'string');
    assert.match(zh.dependencyPreparation.environment.description, /Desktop 托管环境/);
    assert.match(en.dependencyPreparation.environment.description, /Desktop's managed environment/);
    assert.equal(typeof zh.dependencyPreparation.blocking['agent-cli-not-selected'].description, 'string');
    assert.equal(typeof en.dependencyPreparation.complete.description, 'string');
  });
});
