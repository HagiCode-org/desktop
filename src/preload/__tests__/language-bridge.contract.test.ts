import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('language preload bridge contract', () => {
  it('exposes a typed languageChanged bridge and no longer exposes the RSS bridge', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /languageChanged: \(language: string\) => Promise<\{ success: boolean; error\?: string \}>;/);
    assert.match(source, /languageChanged: \(language: string\) => ipcRenderer\.invoke\('language-changed', language\),/);
    assert.doesNotMatch(source, /rss-get-feed-items|rss: \{/);
  });
});
