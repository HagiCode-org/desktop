import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import serviceRegionReducer, {
  setServiceRegionError,
  setServiceRegionState,
} from '../serviceRegionSlice.js';

const selectorPath = path.resolve(process.cwd(), 'src/renderer/components/settings/ServiceRegionSelector.tsx');
const promptPath = path.resolve(process.cwd(), 'src/renderer/components/settings/ServiceRegionPrompt.tsx');
const homePath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');
const regionTabPath = path.resolve(process.cwd(), 'src/renderer/features/settings/components/tabs/RegionTab.tsx');
const settingsHookPath = path.resolve(process.cwd(), 'src/renderer/features/settings/hooks/useSettingsTab.ts');
const storePath = path.resolve(process.cwd(), 'src/renderer/store/index.ts');
const thunkPath = path.resolve(process.cwd(), 'src/renderer/store/thunks/serviceRegionThunks.ts');
const packageSourceSelectorPath = path.resolve(process.cwd(), 'src/renderer/components/PackageSourceSelector.tsx');

describe('service-region renderer integration', () => {
  it('prompts on Home until a region is saved and keeps the selector in the lazy Settings tab', async () => {
    const [selector, prompt, home, regionTab, settingsHook, packageSourceSelector] = await Promise.all([
      fs.readFile(selectorPath, 'utf8'),
      fs.readFile(promptPath, 'utf8'),
      fs.readFile(homePath, 'utf8'),
      fs.readFile(regionTabPath, 'utf8'),
      fs.readFile(settingsHookPath, 'utf8'),
      fs.readFile(packageSourceSelectorPath, 'utf8'),
    ]);

    assert.match(selector, /RadioGroup[\s\S]*aria-label=\{t\('serviceRegion\.choiceLabel'\)\}/);
    assert.match(selector, /disabled=\{controlDisabled\}/);
    assert.match(selector, /role="alert"/);
    assert.match(prompt, /!isLoading && !isExplicit && !skipped && !confirmed/);
    assert.match(prompt, /setServiceRegion\(selectedRegion\)/);
    assert.match(prompt, /serviceRegion\.successDescription/);
    assert.match(prompt, /serviceRegion\.regionDetails\.\$\{value\}/);
    assert.match(prompt, /setConfirmed\(true\)/);
    assert.match(prompt, /serviceRegion\.done/);
    assert.match(home, /ServiceRegionPrompt[\s\S]*homepageTourStartupResolved[\s\S]*homepageTourActive/);
    assert.match(regionTab, /ServiceRegionSelector disabled=\{distributionState\.steamMode\}/);
    assert.match(regionTab, /resetServiceRegionPreference/);
    assert.match(regionTab, /serviceRegion\.resetButton/);
    assert.match(settingsHook, /id: 'region'[\s\S]*import\('\.\.\/components\/tabs\/RegionTab'\)/);
    assert.match(packageSourceSelector, /const savedCustomSources = allConfigs\.filter/);
    assert.match(packageSourceSelector, /savedCustomSources\.map\(\(source\)/);
  });

  it('synchronizes initial and IPC state and refreshes package/version data after a successful selection', async () => {
    const [store, thunk] = await Promise.all([
      fs.readFile(storePath, 'utf8'),
      fs.readFile(thunkPath, 'utf8'),
    ]);

    assert.match(store, /store\.dispatch\(loadServiceRegion\(\)\)/);
    assert.match(store, /serviceRegion\?\.onDidChange[\s\S]*setServiceRegionState/);
    assert.match(thunk, /dispatch\(loadSourceConfig\(\)\)/);
    assert.match(thunk, /dispatch\(loadAllSourceConfigs\(\)\)/);
    assert.match(thunk, /dispatch\(fetchVersionUpdateSnapshot\(\)\)/);
    assert.match(thunk, /serviceRegion\.resetPreference\(\)/);
  });

  it('keeps committed state unchanged on errors and clears pending/error state on notifications', () => {
    const initial = serviceRegionReducer(undefined, { type: 'test/init' });
    const failed = serviceRegionReducer(initial, setServiceRegionError('switch failed'));
    assert.equal(failed.region, 'CN');
    assert.equal(failed.error, 'switch failed');

    const synchronized = serviceRegionReducer(failed, setServiceRegionState({
      region: 'INTERNATIONAL',
      isExplicit: true,
    }));
    assert.equal(synchronized.region, 'INTERNATIONAL');
    assert.equal(synchronized.isExplicit, true);
    assert.equal(synchronized.isSaving, false);
    assert.equal(synchronized.error, null);
  });

  it('provides region labels and explanatory copy in every supported locale', async () => {
    const locales = ['en-US', 'zh-CN', 'zh-Hant', 'ja-JP', 'ko-KR', 'de-DE', 'fr-FR', 'es-ES', 'pt-BR', 'ru-RU'];
    const resources = await Promise.all(locales.map((locale) => fs.readFile(
      path.resolve(process.cwd(), `src/renderer/i18n/locales/${locale}/components.yml`),
      'utf8',
    )));

    for (const resource of resources) {
      assert.match(resource, /^serviceRegion:/m);
      assert.match(resource, /^\s+description:/m);
      assert.match(resource, /^\s+INTERNATIONAL:/m);
      assert.match(resource, /^\s+steamRestricted:/m);
      assert.match(resource, /^\s+promptTitle:/m);
      assert.match(resource, /^\s+successDescription:/m);
      assert.match(resource, /^\s+promptDescription:/m);
      assert.match(resource, /^\s+regionDetails:/m);
      assert.match(resource, /^\s+resetDescription:/m);
      assert.match(resource, /^\s+resetSuccess:/m);
    }
  });
});
