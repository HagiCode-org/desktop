import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const typesPath = path.resolve(process.cwd(), 'src/types/onboarding.ts');
const slicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/onboardingSlice.ts');
const thunksPath = path.resolve(process.cwd(), 'src/renderer/store/thunks/onboardingThunks.ts');
const wizardPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/OnboardingWizard.tsx');
const stepPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/steps/DependencyPreparationStep.tsx');
const legalStepPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/steps/LegalConsentStep.tsx');
const welcomeStepPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/steps/WelcomeIntro.tsx');
const zhOnboardingPath = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales/zh-CN/onboarding.json');
const enOnboardingPath = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales/en-US/onboarding.json');

describe('onboarding dependency preparation integration', () => {
  it('inserts dependency preparation between sharing acceleration and download while preserving selection state', async () => {
    const [typesSource, sliceSource, wizardSource] = await Promise.all([
      fs.readFile(typesPath, 'utf8'),
      fs.readFile(slicePath, 'utf8'),
      fs.readFile(wizardPath, 'utf8'),
    ]);

    assert.match(typesSource, /DependencyPreparation = 4/);
    assert.match(sliceSource, /OnboardingStep\.LanguageSelection,[\s\S]*OnboardingStep\.Welcome,[\s\S]*OnboardingStep\.LegalConsent,[\s\S]*OnboardingStep\.SharingAcceleration,[\s\S]*OnboardingStep\.DependencyPreparation,[\s\S]*OnboardingStep\.Download/);
    assert.match(sliceSource, /const fullSequenceWithoutDependencyPreparation = \[/);
    assert.match(sliceSource, /selectedAgentCliPackageIds: defaultSelectedAgentCliPackageIds/);
    assert.match(sliceSource, /state\.currentStep = getNextStep\(state\.mode, OnboardingStep\.SharingAcceleration, resolveDependencyModeSettings\(state\), state\.distributionState\);/);
    assert.match(sliceSource, /case OnboardingStep\.DependencyPreparation:\s*state\.currentStep = getNextStep\(state\.mode, OnboardingStep\.DependencyPreparation, resolveDependencyModeSettings\(state\), state\.distributionState\);/);
    assert.match(sliceSource, /case OnboardingStep\.Download:\s*state\.currentStep = getPreviousStep\(state\.mode, OnboardingStep\.Download, resolveDependencyModeSettings\(state\), state\.distributionState\);/);
    assert.match(wizardSource, /case OnboardingStep\.DependencyPreparation:[\s\S]*<DependencyPreparationStep \/>/);
    assert.match(wizardSource, /if \(!isActive \|\| mode !== 'full' \|\| dependencyModeSettingsStatus !== 'idle'\) \{/);
    assert.match(wizardSource, /dispatch\(loadOnboardingDependencyModeSettings\(\)\)/);
    assert.match(wizardSource, /if \(currentStep === OnboardingStep\.SharingAcceleration && mode === 'full' && dependencyModeSettingsStatus !== 'ready'\) \{/);
    assert.match(wizardSource, /await dispatch\(loadOnboardingDependencyModeSettings\(\)\)\.unwrap\(\);/);
    assert.match(wizardSource, /if \(currentStep !== OnboardingStep\.Download \|\| runtimeProvisioned \|\| isDownloading \|\| downloadCompleted\) \{/);
    assert.match(wizardSource, /if \(downloadProgress \|\| onboardingError\) \{/);
    assert.match(wizardSource, /void dispatch\(downloadPackage\(\)\);/);
    assert.match(wizardSource, /<WelcomeIntro stepSequence=\{stepSequence\} \/>/);
    assert.match(wizardSource, /const effectiveCanGoNext = currentStep === OnboardingStep\.LanguageSelection/);
    assert.match(wizardSource, /currentStep === OnboardingStep\.DependencyPreparation/);
    assert.match(wizardSource, /canGoNext=\{effectiveCanGoNext\}/);
    assert.match(wizardSource, /<Sheet open=\{isActive\} onOpenChange=\{\(\) => undefined\}>/);
    assert.match(wizardSource, /<SheetContent[\s\S]*side="right"/);
    assert.match(wizardSource, /className="z-50 flex h-full w-\[80vw\] min-w-\[320px\] max-w-none flex-col overflow-hidden border-l bg-card p-0"/);
    assert.match(wizardSource, /onPointerDownOutside=\{\(event\) => event\.preventDefault\(\)\}/);
    assert.match(wizardSource, /onEscapeKeyDown=\{\(event\) => event\.preventDefault\(\)\}/);
    assert.match(wizardSource, /<div className="sticky bottom-0 flex-shrink-0 bg-card">/);
    assert.match(wizardSource, /const canGoPreviousInCommonActions = currentStep === OnboardingStep\.Welcome/);
    assert.match(wizardSource, /const skipLabel = currentStep === OnboardingStep\.Welcome \? t\('welcome\.skip'\) : undefined;/);
    assert.match(wizardSource, /currentStep === OnboardingStep\.LegalConsent/);
    assert.match(wizardSource, /await legalConsentRef\.current\?\.accept\(\);/);
    assert.match(wizardSource, /\? legalConsentCanAccept/);
    assert.equal(wizardSource.includes('currentStep === OnboardingStep.SharingAcceleration && !isDownloading'), false);
    assert.match(wizardSource, /currentStep === OnboardingStep\.DependencyPreparation[\s\S]*isDependencyOperationActive[\s\S]*dispatch\(goToNextStep\(\)\);[\s\S]*dispatch\(downloadPackage\(\)\);/);
  });

  it('loads snapshots, subscribes to progress, batch-syncs selected packages, and recomputes shared readiness', async () => {
    const [sliceSource, thunksSource, stepSource, legalStepSource, welcomeStepSource] = await Promise.all([
      fs.readFile(slicePath, 'utf8'),
      fs.readFile(thunksPath, 'utf8'),
      fs.readFile(stepPath, 'utf8'),
      fs.readFile(legalStepPath, 'utf8'),
      fs.readFile(welcomeStepPath, 'utf8'),
    ]);

    assert.match(sliceSource, /evaluateDependencyReadiness\(snapshot, state\.selectedAgentCliPackageIds\)/);
    assert.match(sliceSource, /state\.dependencySnapshotStatus = 'loading'/);
    assert.match(sliceSource, /state\.isDependencyOperationActive = true/);
    assert.match(thunksSource, /dependencyManagement\.getSnapshot\(\)/);
    assert.match(thunksSource, /dependencyManagement\.refresh\(\)/);
    assert.doesNotMatch(thunksSource, /packageIds\.includes\('hagiscript'\)/);
    assert.doesNotMatch(thunksSource, /dependencyManagement\.install\('hagiscript'\)/);
    assert.match(thunksSource, /dependencyManagement\.syncPackages\(\{ packageIds \}\)/);
    assert.match(thunksSource, /return latestSnapshot \?\? await window\.electronAPI\.dependencyManagement\.refresh\(\)/);
    assert.match(stepSource, /dependencyManagement\.onProgress/);
    assert.match(stepSource, /setOnboardingDependencyProgress\(event\)/);
    assert.match(stepSource, /confirmDisabled = !environmentAvailable \|\| isDependencyOperationActive \|\| !hasSelectedAgentCli/);
    assert.match(legalStepSource, /forwardRef<LegalConsentStepHandle, LegalConsentStepProps>/);
    assert.match(legalStepSource, /useImperativeHandle\(ref, \(\) => \(\{/);
    assert.match(legalStepSource, /accept: handleAccept/);
    assert.match(legalStepSource, /onCanAcceptChange\?\.\(canAccept\);/);
    assert.doesNotMatch(legalStepSource, /\{isAccepting \? t\('legal\.accepting'\) : t\('legal\.accept'\)\}/);
    assert.doesNotMatch(welcomeStepSource, /<Button/);
  });

  it('keeps failed dependency operation snapshots and error text for readiness reevaluation', async () => {
    const [sliceSource, thunksSource] = await Promise.all([
      fs.readFile(slicePath, 'utf8'),
      fs.readFile(thunksPath, 'utf8'),
    ]);

    assert.doesNotMatch(thunksSource, /Failed to install hagiscript/);
    assert.match(thunksSource, /rejectWithValue\(\{\s*message: result\.error \|\| 'Failed to install npm packages',\s*snapshot: result\.snapshot,/);
    assert.match(sliceSource, /readDependencyOperationRejectedPayload\(action\.payload\)/);
    assert.match(sliceSource, /if \(payload\.snapshot\) \{/);
    assert.match(sliceSource, /applyDependencySnapshot\(state, payload\.snapshot\)/);
    assert.match(sliceSource, /state\.dependencyOperationError = payload\.message/);
    assert.match(sliceSource, /state\.isDependencyPreparationComplete = false/);
  });

  it('adds localized Desktop-managed npm environment and readiness copy', async () => {
    const [zhRaw, enRaw] = await Promise.all([
      fs.readFile(zhOnboardingPath, 'utf8'),
      fs.readFile(enOnboardingPath, 'utf8'),
    ]);
    const zh = JSON.parse(zhRaw);
    const en = JSON.parse(enRaw);

    assert.equal(typeof zh.dependencyPreparation.title, 'string');
    assert.match(zh.dependencyPreparation.environment.description, /FAQ/);
    assert.match(en.dependencyPreparation.environment.description, /FAQ/);
    assert.equal(zh.dependencyPreparation.environment.faqUrl, 'https://docs.hagicode.com/faq/desktop-node-environment/');
    assert.equal(en.dependencyPreparation.environment.faqUrl, 'https://docs.hagicode.com/en/faq/desktop-node-environment/');
    assert.equal(zh.dependencyPreparation.environment.faqLinkLabel, '查看 Node 环境 FAQ');
    assert.equal(en.dependencyPreparation.environment.faqLinkLabel, 'View Node environment FAQ');
    assert.equal(typeof zh.dependencyPreparation.skip.description, 'string');
    assert.match(en.dependencyPreparation.skip.title, /skip/i);
    assert.equal(typeof zh.dependencyPreparation.blocking['agent-cli-not-selected'].description, 'string');
    assert.equal(typeof en.dependencyPreparation.complete.description, 'string');
    assert.match(String(zh.welcome.description), /\{\{count\}\}/);
    assert.match(String(en.welcome.description), /\{\{count\}\}/);
    assert.match(String(zh.legal.progressFull), /\{\{steps\}\}/);
    assert.match(String(en.legal.progressFull), /\{\{steps\}\}/);
  });
});
