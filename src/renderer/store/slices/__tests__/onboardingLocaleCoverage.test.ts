import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { load } from 'js-yaml';
import { SUPPORTED_DESKTOP_LANGUAGE_CODES } from '../../../../shared/desktop-languages.js';

const localesRoot = path.resolve(process.cwd(), 'src/renderer/i18n/locales');

describe('onboarding locale coverage', () => {
  it('includes the onboarding language-selection keys for every supported Desktop locale', async () => {
    for (const locale of SUPPORTED_DESKTOP_LANGUAGE_CODES) {
      const raw = await fs.readFile(path.join(localesRoot, locale, 'onboarding.yml'), 'utf8');
      const data = load(raw) as Record<string, any>;

      assert.equal(typeof data.languageSelection?.title, 'string', `${locale} missing languageSelection.title`);
      assert.equal(typeof data.languageSelection?.description, 'string', `${locale} missing languageSelection.description`);
      assert.equal(typeof data.languageSelection?.recommended, 'string', `${locale} missing languageSelection.recommended`);
      assert.equal(typeof data.languageSelection?.selected, 'string', `${locale} missing languageSelection.selected`);
      assert.equal(typeof data.languageSelection?.choose, 'string', `${locale} missing languageSelection.choose`);
      assert.equal(typeof data.languageSelection?.error, 'string', `${locale} missing languageSelection.error`);
      assert.equal(typeof data.welcome?.steps?.languageSelection, 'string', `${locale} missing welcome.steps.languageSelection`);
      assert.equal(typeof data.actions?.continueWithLanguage, 'string', `${locale} missing actions.continueWithLanguage`);
      assert.equal(typeof data.actions?.applyingLanguage, 'string', `${locale} missing actions.applyingLanguage`);
    }
  });
});
