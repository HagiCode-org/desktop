import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

describe('main-process language to RSS synchronization contract', () => {
  it('persists the new language, updates the menu, and switches the RSS manager context from the shared IPC handler', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /ipcMain\.handle\('language-changed', async \(_, language: string\) => \{/);
    assert.match(source, /configManager\?\.setCurrentLanguage\(language\);/);
    assert.match(source, /menuManager\.updateMenuLanguage\(language\);/);
    assert.match(source, /rssFeedManager\?\.switchLanguage\(language\);/);
    assert.match(source, /return \{ success: true \};/);
  });

  it('boots the RSS manager from the persisted app language instead of a hard-coded feed context', async () => {
    const source = await fs.readFile(mainPath, 'utf8');

    assert.match(source, /const initialLanguage = configManager\.getCurrentLanguage\(\) \|\| 'zh-CN';/);
    assert.match(source, /rssFeedManager = RSSFeedManager\.getInstance\(\{\s*feedUrl: DEFAULT_RSS_FEED_URL,\s*language: initialLanguage,/s);
    assert.match(source, /menuManager\.createMenu\(initialLanguage, initialWebServiceStatus\.status === 'running'\);/);
  });
});
