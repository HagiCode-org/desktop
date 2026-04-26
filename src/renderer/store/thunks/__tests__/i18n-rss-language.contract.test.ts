import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const i18nThunkPath = path.resolve(process.cwd(), 'src/renderer/store/thunks/i18nThunks.ts');
const rssThunkPath = path.resolve(process.cwd(), 'src/renderer/store/thunks/rssFeedThunks.ts');

describe('renderer language and RSS thunk contract', () => {
  it('synchronizes the main-process language during both startup restore and manual language switches', async () => {
    const source = await fs.readFile(i18nThunkPath, 'utf8');

    assert.match(source, /async function syncMainProcessLanguage\(language: string\): Promise<void> \{/);
    assert.match(source, /\.languageChanged\(language\);/);
    assert.match(source, /await i18n\.changeLanguage\(language\);\s*await syncMainProcessLanguage\(language\);/s);
    assert.match(source, /const resolvedLanguage = savedLanguage \|\| i18n\.resolvedLanguage \|\| i18n\.language;/);
    assert.match(source, /await syncMainProcessLanguage\(resolvedLanguage\);/);
    assert.match(source, /localStorage\.setItem\('appSettings\.language', language\);/);
  });

  it('adds a dedicated language-change RSS refresh path that clears stale visible state before loading the new feed context', async () => {
    const source = await fs.readFile(rssThunkPath, 'utf8');

    assert.match(source, /export const refreshFeedForLanguageChange = createAsyncThunk\(/);
    assert.match(source, /resetVisibleState: true,/);
    assert.match(source, /dispatch\(setItems\(\[\]\)\);/);
    assert.match(source, /dispatch\(setLastUpdate\(null\)\);/);
    assert.match(source, /const lastUpdate: string \| null = await window\.electronAPI\.rss\.getLastUpdate\(\);\s*dispatch\(setLastUpdate\(lastUpdate\)\);/s);
  });
});
