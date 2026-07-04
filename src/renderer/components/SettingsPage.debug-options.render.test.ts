import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const settingsPagePath = path.resolve(process.cwd(), 'src/renderer/components/SettingsPage.tsx');
const settingsIndexPath = path.resolve(process.cwd(), 'src/renderer/components/settings/index.ts');
const settingsHookPath = path.resolve(process.cwd(), 'src/renderer/features/settings/hooks/useSettingsTab.ts');
const builtInTabsPath = path.resolve(process.cwd(), 'src/renderer/features/settings/components/tabs/builtInTabs.tsx');
const debugOptionsSettingsPath = path.resolve(process.cwd(), 'src/renderer/components/settings/DebugOptionsSettings.tsx');
const enPagesPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/pages.yml');
const zhPagesPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/pages.yml');

describe('debug options settings renderer wiring', () => {
  it('adds a dedicated settings tab and debug options card', async () => {
    const [settingsPageSource, settingsIndexSource, settingsHookSource, builtInTabsSource, debugOptionsSettingsSource] = await Promise.all([
      fs.readFile(settingsPagePath, 'utf8'),
      fs.readFile(settingsIndexPath, 'utf8'),
      fs.readFile(settingsHookPath, 'utf8'),
      fs.readFile(builtInTabsPath, 'utf8'),
      fs.readFile(debugOptionsSettingsPath, 'utf8'),
    ]);

    assert.match(settingsIndexSource, /export \{ DebugOptionsSettings \} from '\.\/DebugOptionsSettings';/);
    assert.match(settingsPageSource, /<SettingsTabContent activeTab=\{activeTabConfig\} distributionState=\{distributionState\} \/>/);
    assert.match(settingsHookSource, /id: 'debugOptions'/);
    assert.match(settingsHookSource, /labelKey: 'settings\.tabs\.debugOptions'/);
    assert.match(builtInTabsSource, /export function DebugOptionsSettingsTab\(\)/);
    assert.match(builtInTabsSource, /<DebugOptionsSettings \/>/);
    assert.match(debugOptionsSettingsSource, /getDebugOptionsBridge\(\)\s*\.getSettings\(\)/);
    assert.match(debugOptionsSettingsSource, /getDebugOptionsBridge\(\)\.setSettings\(\{/);
    assert.match(debugOptionsSettingsSource, /useIgnoreScriptsForManagedNpm/);
    assert.match(debugOptionsSettingsSource, /msstoreInstallDateRaw/);
    assert.match(debugOptionsSettingsSource, /settings\.debugOptions\.installDate\.label/);
    assert.match(debugOptionsSettingsSource, /settings\.debugOptions\.installDate\.description/);
    assert.match(debugOptionsSettingsSource, /settings\.debugOptions\.installDate\.ageDays/);
  });

  it('adds localized debug options labels and feedback copy', async () => {
    const [enPagesSource, zhPagesSource] = await Promise.all([
      fs.readFile(enPagesPath, 'utf8'),
      fs.readFile(zhPagesPath, 'utf8'),
    ]);

    assert.match(enPagesSource, /debugOptions:\n[\s\S]*title: Debug Options/);
    assert.match(enPagesSource, /label: npm uses `--ignore-scripts`/);
    assert.match(enPagesSource, /installDate:\n[\s\S]*Raw install date/);
    assert.match(enPagesSource, /ageDays: 'Install age \(days\): \{\{value\}\}'/);

    assert.match(zhPagesSource, /debugOptions:\n[\s\S]*title: 调试选项/);
    assert.match(zhPagesSource, /label: npm 使用 `--ignore-scripts`/);
    assert.match(zhPagesSource, /installDate:\n[\s\S]*安装日期原始值/);
    assert.match(zhPagesSource, /ageDays: '安装天数：\{\{value\}\}'/);
  });
});
