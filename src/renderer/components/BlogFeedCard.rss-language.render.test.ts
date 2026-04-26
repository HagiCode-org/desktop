import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const componentPath = path.resolve(process.cwd(), 'src/renderer/components/BlogFeedCard.tsx');

describe('blog feed card localized refresh contract', () => {
  it('keeps the first-load fetch behavior and triggers a dedicated RSS refresh after later language changes', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /const activeLanguage = i18n\.resolvedLanguage \?\? i18n\.language;/);
    assert.match(source, /const previousLanguageRef = useRef<string \| null>\(null\);/);
    assert.match(source, /if \(items\.length === 0\) \{\s*dispatch\(fetchFeedItems\(\)\);\s*\}/s);
    assert.match(source, /if \(previousLanguageRef\.current === null\) \{\s*previousLanguageRef\.current = activeLanguage;\s*return;\s*\}/s);
    assert.match(source, /if \(previousLanguageRef\.current !== activeLanguage\) \{\s*previousLanguageRef\.current = activeLanguage;\s*dispatch\(refreshFeedForLanguageChange\(activeLanguage\)\);\s*\}/s);
  });

  it('preserves the existing manual refresh, empty-state, and error-state affordances while scoping display formatting to the active language', async () => {
    const source = await fs.readFile(componentPath, 'utf8');

    assert.match(source, /const handleRefresh = \(\) => \{\s*dispatch\(refreshFeed\(\)\);\s*\};/s);
    assert.match(source, /const locale = activeLanguage\.startsWith\('zh'\) \? zhCN : undefined;/);
    assert.match(source, /t\('blogFeed\.error', '加载失败，请稍后重试'\)/);
    assert.match(source, /t\('blogFeed\.noArticles', '暂无文章'\)/);
    assert.match(source, /t\('blogFeed\.loading', '加载中\.\.\.'\)/);
  });
});
