import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const settingsPagePath = path.resolve(process.cwd(), 'src/renderer/components/SettingsPage.tsx');
const settingsIndexPath = path.resolve(process.cwd(), 'src/renderer/components/settings/index.ts');
const telemetrySettingsPath = path.resolve(process.cwd(), 'src/renderer/components/settings/TelemetrySettings.tsx');
const zhPagesPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/pages.json');
const enPagesPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/pages.json');

describe('managed Web telemetry renderer wiring', () => {
  it('adds the telemetry tab to Settings and exports the dedicated settings component through the barrel', async () => {
    const [settingsPageSource, settingsIndexSource] = await Promise.all([
      fs.readFile(settingsPagePath, 'utf8'),
      fs.readFile(settingsIndexPath, 'utf8'),
    ]);

    assert.match(settingsPageSource, /value=\"telemetry\"/);
    assert.match(settingsPageSource, /<TelemetrySettings \/>/);
    assert.match(settingsPageSource, /t\('settings\.tabs\.telemetry'\)/);
    assert.match(settingsIndexSource, /export \{ TelemetrySettings \} from '\.\/TelemetrySettings';/);
  });

  it('loads and saves telemetry settings through the preload bridge while surfacing warning state copy', async () => {
    const source = await fs.readFile(telemetrySettingsPath, 'utf8');

    assert.match(source, /getTelemetryBridge\(\)\.get\(\)/);
    assert.match(source, /getTelemetryBridge\(\)\.set\(\{/);
    assert.match(source, /settings\.telemetry\.messages\.saveSuccess/);
    assert.match(source, /settings\.telemetry\.messages\.saveWarning/);
    assert.match(source, /settings\.telemetry\.notes\.partialDescription/);
    assert.match(source, /settings\.telemetry\.disclosures\.exclusions\.description/);
  });

  it('ships localized copy that keeps the scope explicitly focused on the managed Web service', async () => {
    const [zhPagesRaw, enPagesRaw] = await Promise.all([
      fs.readFile(zhPagesPath, 'utf8'),
      fs.readFile(enPagesPath, 'utf8'),
    ]);
    const zhPages = JSON.parse(zhPagesRaw);
    const enPages = JSON.parse(enPagesRaw);

    assert.match(String(enPages.settings.tabs.telemetry), /Telemetry/);
    assert.match(String(enPages.settings.telemetry.description), /managed Web service/i);
    assert.match(String(enPages.settings.telemetry.enabled.description), /Desktop-local analytics outside the scope/i);
    assert.match(String(enPages.settings.telemetry.disclosures.exclusions.description), /raw prompts, secrets, credentials/i);

    assert.match(String(zhPages.settings.telemetry.description), /托管 Web 服务/);
    assert.match(String(zhPages.settings.telemetry.enabled.description), /Desktop 自身的本地分析不在此页范围内/);
    assert.match(String(zhPages.settings.telemetry.disclosures.exclusions.description), /原始 Prompt、密钥、凭据/);
  });
});
