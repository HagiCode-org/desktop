import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('RSS language preload bridge contract', () => {
  it('exposes a typed languageChanged bridge without changing the existing RSS bridge methods', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /languageChanged: \(language: string\) => Promise<\{ success: boolean; error\?: string \}>;/);
    assert.match(source, /languageChanged: \(language: string\) => ipcRenderer\.invoke\('language-changed', language\),/);
    assert.match(source, /rss: \{\s*getFeedItems: \(\) => ipcRenderer\.invoke\('rss-get-feed-items'\),\s*refreshFeed: \(\) => ipcRenderer\.invoke\('rss-refresh-feed'\),\s*getLastUpdate: \(\) => ipcRenderer\.invoke\('rss-get-last-update'\),\s*\}/s);
  });
});
