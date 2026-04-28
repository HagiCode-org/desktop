import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const localesRoot = path.resolve(process.cwd(), 'src/renderer/i18n/locales');
const supportedLocales = [
  'zh-CN',
  'zh-Hant',
  'en-US',
  'ja-JP',
  'ko-KR',
  'de-DE',
  'fr-FR',
  'es-ES',
  'pt-BR',
  'ru-RU',
];

describe('onboarding locale coverage', () => {
  it('includes the onboarding language-selection keys for every supported Desktop locale', async () => {
    for (const locale of supportedLocales) {
      const raw = await fs.readFile(path.join(localesRoot, locale, 'onboarding.json'), 'utf8');
      const json = JSON.parse(raw);

      assert.equal(typeof json.languageSelection?.title, 'string', `${locale} missing languageSelection.title`);
      assert.equal(typeof json.languageSelection?.description, 'string', `${locale} missing languageSelection.description`);
      assert.equal(typeof json.languageSelection?.recommended, 'string', `${locale} missing languageSelection.recommended`);
      assert.equal(typeof json.languageSelection?.selected, 'string', `${locale} missing languageSelection.selected`);
      assert.equal(typeof json.languageSelection?.choose, 'string', `${locale} missing languageSelection.choose`);
      assert.equal(typeof json.languageSelection?.error, 'string', `${locale} missing languageSelection.error`);
      assert.equal(typeof json.welcome?.steps?.languageSelection, 'string', `${locale} missing welcome.steps.languageSelection`);
      assert.equal(typeof json.actions?.continueWithLanguage, 'string', `${locale} missing actions.continueWithLanguage`);
      assert.equal(typeof json.actions?.applyingLanguage, 'string', `${locale} missing actions.applyingLanguage`);
    }
  });
});
