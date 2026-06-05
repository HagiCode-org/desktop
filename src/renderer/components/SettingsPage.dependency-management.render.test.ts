import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const settingsPagePath = path.resolve(process.cwd(), 'src/renderer/components/SettingsPage.tsx');
const settingsIndexPath = path.resolve(process.cwd(), 'src/renderer/components/settings/index.ts');
const modeSettingsPath = path.resolve(process.cwd(), 'src/renderer/components/settings/DependencyManagementModeSettings.tsx');
const enPagesPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/pages.yml');
const zhPagesPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/pages.yml');

describe('dependency management settings renderer wiring', () => {
  it('adds the dependency management tab and dedicated settings card', async () => {
    const [settingsPageSource, settingsIndexSource, modeSettingsSource] = await Promise.all([
      fs.readFile(settingsPagePath, 'utf8'),
      fs.readFile(settingsIndexPath, 'utf8'),
      fs.readFile(modeSettingsPath, 'utf8'),
    ]);

    assert.match(settingsIndexSource, /export \{ DependencyManagementModeSettings \} from '\.\/DependencyManagementModeSettings';/);
    assert.match(settingsPageSource, /value="dependencyManagement"/);
    assert.match(settingsPageSource, /settings\.tabs\.dependencyManagement/);
    assert.match(settingsPageSource, /<DependencyManagementModeSettings \/>/);
    assert.match(modeSettingsSource, /getDependencyManagementBridge\(\)\s*\.getModeSettings\(\)/);
    assert.match(modeSettingsSource, /getDependencyManagementBridge\(\)\.setMode\(nextMode\)/);
    assert.match(modeSettingsSource, /settings\.dependencyManagementMode\.options\.\$\{effectiveMode\}\.label/);
    assert.match(modeSettingsSource, /settings\.dependencyManagementMode\.options\.\$\{mode\}\.label/);
    assert.match(modeSettingsSource, /settings\.dependencyManagementMode\.options\.\$\{mode\}\.description/);
    assert.match(modeSettingsSource, /if \(!settings \|\| isSaving \|\| settings\.lockedByRuntime\) \{/);
    assert.match(modeSettingsSource, /const controlDisabled = !settings \|\| isSaving \|\| settings\?\.lockedByRuntime;/);
    assert.match(modeSettingsSource, /settings\?\.lockedByRuntime/);
    assert.match(modeSettingsSource, /settings\.lockedByRuntime/);
  });

  it('adds localized settings copy for dependency management mode labels and read-only explanations', async () => {
    const [enPagesSource, zhPagesSource] = await Promise.all([
      fs.readFile(enPagesPath, 'utf8'),
      fs.readFile(zhPagesPath, 'utf8'),
    ]);

    assert.match(enPagesSource, /dependencyManagement:\s*Dependency Management/);
    assert.match(enPagesSource, /label: External \(read-only\)/);
    assert.match(zhPagesSource, /dependencyManagement:\s*依赖管理模式/);
    assert.match(zhPagesSource, /label: 外部模式（只读）/);
  });
});
