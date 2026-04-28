import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DESKTOP_LANGUAGES,
  getDesktopLanguageShortLabel,
  isChineseDesktopLanguage,
  normalizeDesktopLanguageCode,
  resolveDesktopLanguageCode,
} from '../desktop-languages.js';

describe('desktop language configuration', () => {
  it('exposes the expanded supported desktop language list', () => {
    assert.deepEqual(DESKTOP_LANGUAGES.map((language) => language.code), [
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
    ]);
  });

  it('normalizes common locale variants to supported application locales', () => {
    assert.equal(normalizeDesktopLanguageCode('zh_TW'), 'zh-Hant');
    assert.equal(normalizeDesktopLanguageCode('zh-HK'), 'zh-Hant');
    assert.equal(normalizeDesktopLanguageCode('zh-Hans-CN'), 'zh-CN');
    assert.equal(normalizeDesktopLanguageCode('ja'), 'ja-JP');
    assert.equal(normalizeDesktopLanguageCode('pt'), 'pt-BR');
    assert.equal(resolveDesktopLanguageCode('unsupported-locale'), 'zh-CN');
  });

  it('keeps UI helpers aligned with the supported language metadata', () => {
    assert.equal(getDesktopLanguageShortLabel('ko'), '한');
    assert.equal(isChineseDesktopLanguage('zh-Hant'), true);
    assert.equal(isChineseDesktopLanguage('ru-RU'), false);
  });
});
