import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const settingsPagePath = path.resolve(process.cwd(), 'src/renderer/components/SettingsPage.tsx');
const settingsIndexPath = path.resolve(process.cwd(), 'src/renderer/components/settings/index.ts');
const runtimeDataSettingsPath = path.resolve(process.cwd(), 'src/renderer/components/settings/RuntimeDataPathSettings.tsx');
const enPagesPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/pages.yml');
const zhPagesPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/pages.yml');

describe('runtime data path settings renderer wiring', () => {
  it('adds a dedicated settings tab and runtime data settings card', async () => {
    const [settingsPageSource, settingsIndexSource, runtimeDataSettingsSource] = await Promise.all([
      fs.readFile(settingsPagePath, 'utf8'),
      fs.readFile(settingsIndexPath, 'utf8'),
      fs.readFile(runtimeDataSettingsPath, 'utf8'),
    ]);

    assert.match(settingsIndexSource, /export \{ RuntimeDataPathSettings \} from '\.\/RuntimeDataPathSettings';/);
    assert.match(settingsPageSource, /value="runtimeData"/);
    assert.match(settingsPageSource, /settings\.tabs\.runtimeData/);
    assert.match(settingsPageSource, /<RuntimeDataPathSettings \/>/);
    assert.match(runtimeDataSettingsSource, /getRuntimeDataPathBridge\(\)\s*\.getSettings\(\)/);
    assert.match(runtimeDataSettingsSource, /getRuntimeDataPathBridge\(\)\.setPreset\(selectedPreset\)/);
    assert.match(runtimeDataSettingsSource, /settings\.runtimeDataPath\.warnings\.noMigration/);
    assert.match(runtimeDataSettingsSource, /settings\.runtimeDataPath\.warnings\.restart/);
    assert.match(runtimeDataSettingsSource, /settings\.runtimeDataPath\.paths\.effectiveRoot/);
    assert.match(runtimeDataSettingsSource, /settings\.runtimeDataPath\.messages\.restartSuccess/);
    assert.match(runtimeDataSettingsSource, /const isLocked = settings\?\.lockedByRuntime \?\? false;/);
    assert.match(runtimeDataSettingsSource, /const controlDisabled = !settings \|\| isSaving \|\| isLocked;/);
    assert.match(runtimeDataSettingsSource, /const hasPendingChanges = settings \? selectedPreset !== settings\.configuredPreset : false;/);
    assert.match(runtimeDataSettingsSource, /settings\.runtimeDataPath\.lockedByRuntime/);
    assert.match(runtimeDataSettingsSource, /settings\.readOnlyReason/);
  });

  it('adds localized runtime data path labels, warnings, and feedback copy', async () => {
    const [enPagesSource, zhPagesSource] = await Promise.all([
      fs.readFile(enPagesPath, 'utf8'),
      fs.readFile(zhPagesPath, 'utf8'),
    ]);

    assert.match(enPagesSource, /runtimeData: Runtime Data/);
    assert.match(enPagesSource, /title: Runtime data storage path/);
    assert.match(enPagesSource, /saveFailed: Failed to save runtime data path/);
    assert.match(enPagesSource, /label: userData\/runtime-data \(default\)/);
    assert.match(zhPagesSource, /runtimeData: 运行时数据/);
    assert.match(zhPagesSource, /title: 运行时数据存储路径/);
    assert.match(zhPagesSource, /saveFailed: 保存运行时数据路径失败/);
    assert.match(zhPagesSource, /label: userData\/runtime-data（默认）/);
  });
});
