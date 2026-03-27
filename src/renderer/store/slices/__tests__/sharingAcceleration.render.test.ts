import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const settingsPagePath = path.resolve(process.cwd(), 'src/renderer/components/SettingsPage.tsx');
const sharingStepPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/steps/SharingAccelerationStep.tsx');
const versionPagePath = path.resolve(process.cwd(), 'src/renderer/components/VersionManagementPage.tsx');

describe('sharing acceleration renderer wiring', () => {
  it('adds a settings entry, onboarding step, and install telemetry projection', async () => {
    const [settingsPage, sharingStep, versionPage] = await Promise.all([
      fs.readFile(settingsPagePath, 'utf8'),
      fs.readFile(sharingStepPath, 'utf8'),
      fs.readFile(versionPagePath, 'utf8'),
    ]);

    assert.match(settingsPage, /sharingAcceleration/);
    assert.match(sharingStep, /recordOnboardingChoice/);
    assert.match(versionPage, /installTelemetry/);
    assert.match(versionPage, /downloadMode/);
  });
});
