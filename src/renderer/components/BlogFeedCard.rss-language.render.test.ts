import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const componentPath = path.resolve(process.cwd(), 'src/renderer/components/BlogFeedCard.tsx');

describe('blog feed card localized refresh contract', () => {
  it('keeps the first-load fetch behavior and triggers a dedicated RSS refresh after later language changes', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /const activeLanguage = resolveDesktopLanguageCode\(i18n\.resolvedLanguage \?\? i18n\.language\);/);
    assert.match(source, /const previousLanguageRef = useRef<string \| null>\(null\);/);
    assert.match(source, /if \(items\.length === 0\) \{\s*dispatch\(fetchFeedItems\(\)\);\s*\}/s);
    assert.match(source, /if \(previousLanguageRef\.current === null\) \{\s*previousLanguageRef\.current = activeLanguage;\s*return;\s*\}/s);
    assert.match(source, /if \(previousLanguageRef\.current !== activeLanguage\) \{\s*previousLanguageRef\.current = activeLanguage;\s*dispatch\(refreshFeedForLanguageChange\(activeLanguage\)\);\s*\}/s);
  });

  it('preserves the existing manual refresh, empty-state, and error-state affordances while scoping display formatting to the active language', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /const handleRefresh = \(\) => \{\s*dispatch\(refreshFeed\(\)\);\s*\};/s);
    assert.match(source, /const handleOpenRss = async \(\) => \{\s*const result = await window\.electronAPI\.openExternal\(resolveRSSFeedUrl\(activeLanguage\)\);/s);
    assert.match(source, /t\('blogFeed\.openRss'\)/);
    assert.match(source, /date\.toLocaleDateString\(activeLanguage,/);
    assert.match(source, /date\.toLocaleString\(activeLanguage,/);
    assert.match(source, /t\('blogFeed\.error'\)/);
    assert.match(source, /t\('blogFeed\.noArticles'\)/);
    assert.match(source, /t\('blogFeed\.loading'\)/);
    // User-facing copy lives in the locale resources, never as inline fallback literals.
    assert.doesNotMatch(source, /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af\u0400-\u04ff]/);
  });
});
