import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const settingsComponentPath = path.resolve(process.cwd(), 'src/renderer/components/settings/SharingAccelerationSettings.tsx');
const settingsPagePath = path.resolve(process.cwd(), 'src/renderer/components/SettingsPage.tsx');
const sharingStepPath = path.resolve(process.cwd(), 'src/renderer/components/onboarding/steps/SharingAccelerationStep.tsx');
const versionPagePath = path.resolve(process.cwd(), 'src/renderer/components/VersionManagementPage.tsx');
const zhPagesPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/pages.json');
const enPagesPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/pages.json');
const zhOnboardingPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/onboarding.json');

describe('sharing acceleration renderer wiring', () => {
  it('keeps the settings entry and install telemetry projection in place', async () => {
    const [settingsPage, sharingStep, versionPage] = await Promise.all([
      fs.readFile(settingsPagePath, 'utf8'),
      fs.readFile(sharingStepPath, 'utf8'),
      fs.readFile(versionPagePath, 'utf8'),
    ]);

    assert.match(settingsPage, /sharingAcceleration/);
    assert.match(sharingStep, /recordOnboardingChoice/);
    assert.match(versionPage, /installTelemetry/);
    assert.match(versionPage, /downloadMode/);
    assert.match(versionPage, /fetchingTorrent/);
  });

  it('uses the 5 GiB default and the updated latest desktop\\/server copy in the settings surface', async () => {
    const [componentSource, zhPagesRaw, enPagesRaw] = await Promise.all([
      fs.readFile(settingsComponentPath, 'utf8'),
      fs.readFile(zhPagesPath, 'utf8'),
      fs.readFile(enPagesPath, 'utf8'),
    ]);

    const zhPages = JSON.parse(zhPagesRaw);
    const enPages = JSON.parse(enPagesRaw);

    assert.match(componentSource, /cacheLimitGb: 5/);
    assert.match(componentSource, /modeHint/);
    assert.match(componentSource, /scopeHint/);
    assert.match(zhPages.settings.sharingAcceleration.scopeHint, /latest desktop 与 latest server/);
    assert.match(String(enPages.settings.sharingAcceleration.scopeHint), /latest desktop and latest server/);
  });

  it('updates onboarding copy to explain torrent-first fallback and portable mode disablement', async () => {
    const [sharingStepSource, zhOnboardingRaw] = await Promise.all([
      fs.readFile(sharingStepPath, 'utf8'),
      fs.readFile(zhOnboardingPath, 'utf8'),
    ]);
    const zhOnboarding = JSON.parse(zhOnboardingRaw);

    assert.match(sharingStepSource, /sharingAcceleration\.bullets\.portable/);
    assert.match(zhOnboarding.sharingAcceleration.description, /先走种子；失败自动回源/);
    assert.match(zhOnboarding.sharingAcceleration.bullets.portable, /portable mode/);
  });
});
