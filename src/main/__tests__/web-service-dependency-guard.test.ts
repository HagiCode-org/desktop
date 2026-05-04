import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const onboardingStepPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/steps/DependencyPreparationStep.tsx');

describe('web service dependency guard contract', () => {
  it('blocks service startup when required managed dependencies are missing or below the declared version', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /dependencyManagementService\.getSnapshot\(\)/);
    assert.match(source, /evaluateDependencyReadiness\(snapshot, \[\]\)/);
    assert.match(source, /item\.status !== 'installed' \|\| !item\.versionSatisfied/);
    assert.match(source, /type: 'dependency-requirements-not-met'/);
    assert.equal(source.includes('No blocking principle'), false);
  });

  it('includes version-mismatched packages in the onboarding repair install set', async () => {
    const source = await fs.readFile(onboardingStepPath, 'utf8');

    assert.match(source, /readiness\.versionMismatchRequiredPackageIds/);
    assert.match(source, /readiness\.versionMismatchSelectedAgentCliPackageIds/);
  });
});
