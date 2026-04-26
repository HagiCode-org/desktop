import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const typesPath = path.resolve(process.cwd(), 'src/types/onboarding.ts');
const slicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/onboardingSlice.ts');
const thunksPath = path.resolve(process.cwd(), 'src/renderer/store/thunks/onboardingThunks.ts');
const wizardPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/OnboardingWizard.tsx');
const stepPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/steps/NpmPreparationStep.tsx');
const zhOnboardingPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/onboarding.json');
const enOnboardingPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/onboarding.json');

describe('onboarding npm preparation integration', () => {
  it('inserts npm preparation between sharing acceleration and download while preserving selection state', async () => {
    const [typesSource, sliceSource, wizardSource] = await Promise.all([
      fs.readFile(typesPath, 'utf8'),
      fs.readFile(slicePath, 'utf8'),
      fs.readFile(wizardPath, 'utf8'),
    ]);

    assert.match(typesSource, /NpmPreparation = 3/);
    assert.match(sliceSource, /OnboardingStep\.SharingAcceleration,[\s\S]*OnboardingStep\.NpmPreparation,[\s\S]*OnboardingStep\.Download/);
    assert.match(sliceSource, /selectedAgentCliPackageIds: defaultSelectedAgentCliPackageIds/);
    assert.match(sliceSource, /state\.currentStep = OnboardingStep\.NpmPreparation;/);
    assert.match(sliceSource, /if \(state\.isNpmPreparationComplete\) \{\s*state\.currentStep = OnboardingStep\.Download;/);
    assert.match(wizardSource, /case OnboardingStep\.NpmPreparation:[\s\S]*<NpmPreparationStep \/>/);
    assert.match(wizardSource, /currentStep === OnboardingStep\.NpmPreparation \? isNpmPreparationComplete : canGoNext/);
  });

  it('loads snapshots, subscribes to progress, installs hagiscript first, and recomputes shared readiness', async () => {
    const [sliceSource, thunksSource, stepSource] = await Promise.all([
      fs.readFile(slicePath, 'utf8'),
      fs.readFile(thunksPath, 'utf8'),
      fs.readFile(stepPath, 'utf8'),
    ]);

    assert.match(sliceSource, /evaluateNpmReadiness\(snapshot, state\.selectedAgentCliPackageIds\)/);
    assert.match(sliceSource, /state\.npmSnapshotStatus = 'loading'/);
    assert.match(sliceSource, /state\.isNpmOperationActive = true/);
    assert.match(thunksSource, /npmManagement\.getSnapshot\(\)/);
    assert.match(thunksSource, /npmManagement\.refresh\(\)/);
    assert.match(thunksSource, /packageIds\.includes\('hagiscript'\)/);
    assert.match(thunksSource, /npmManagement\.install\('hagiscript'\)/);
    assert.match(thunksSource, /npmManagement\.syncPackages\(\{ packageIds: syncPackageIds \}\)/);
    assert.match(stepSource, /npmManagement\.onProgress/);
    assert.match(stepSource, /setOnboardingNpmProgress\(event\)/);
    assert.match(stepSource, /confirmDisabled = !environmentAvailable \|\| isNpmOperationActive \|\| !hasSelectedAgentCli/);
  });

  it('adds localized Desktop-managed npm environment and readiness copy', async () => {
    const [zhRaw, enRaw] = await Promise.all([
      fs.readFile(zhOnboardingPath, 'utf8'),
      fs.readFile(enOnboardingPath, 'utf8'),
    ]);
    const zh = JSON.parse(zhRaw);
    const en = JSON.parse(enRaw);

    assert.equal(typeof zh.npmPreparation.title, 'string');
    assert.match(zh.npmPreparation.environment.description, /Desktop 托管环境/);
    assert.match(en.npmPreparation.environment.description, /Desktop's managed environment/);
    assert.equal(typeof zh.npmPreparation.blocking['agent-cli-not-selected'].description, 'string');
    assert.equal(typeof en.npmPreparation.complete.description, 'string');
  });
});
