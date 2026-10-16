import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const i18nThunkPath = path.resolve(process.cwd(), 'src/renderer/store/thunks/i18nThunks.ts');

describe('renderer language thunk contract', () => {
  it('synchronizes the main-process language during both startup restore and manual language switches', async () => {
    const source = await fs.readFile(i18nThunkPath, 'utf8');

    assert.match(source, /async function syncMainProcessLanguage\(language: string\): Promise<void> \{/);
    assert.match(source, /\.languageChanged\(language\);/);
    assert.match(source, /const nextLanguage = resolveDesktopLanguageCode\(language\);/);
    assert.match(source, /await i18n\.changeLanguage\(nextLanguage\);\s*await syncMainProcessLanguage\(nextLanguage\);/s);
    assert.match(source, /const resolvedLanguage = resolveDesktopLanguageCode\(savedLanguage \|\| i18n\.resolvedLanguage \|\| i18n\.language\);/);
    assert.match(source, /await syncMainProcessLanguage\(resolvedLanguage\);/);
    assert.match(source, /localStorage\.setItem\('appSettings\.language', nextLanguage\);/);
    assert.match(source, /document\.documentElement\.lang = language;/);
  });
});
