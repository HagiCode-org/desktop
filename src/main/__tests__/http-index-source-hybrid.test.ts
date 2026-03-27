import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sourcePath = path.resolve(process.cwd(), 'src/main/package-sources/http-index-source.ts');

describe('http index hybrid metadata support', () => {
  it('keeps the 100MB threshold and hybrid metadata fields in the parser', async () => {
    const source = await fs.readFile(sourcePath, 'utf8');

    assert.match(source, /HYBRID_THRESHOLD_BYTES = 100 \* 1024 \* 1024/);
    assert.match(source, /torrentUrl\?: string/);
    assert.match(source, /infoHash\?: string/);
    assert.match(source, /webSeeds\?: string\[\]/);
    assert.match(source, /sha256\?: string/);
    assert.match(source, /legacyHttpFallback/);
    assert.match(source, /isLatestDesktopAsset/);
    assert.match(source, /isLatestWebAsset/);
  });

  it('keeps compatibility with legacy files projections when assets are absent', async () => {
    const source = await fs.readFile(sourcePath, 'utf8');

    assert.match(source, /files\?: Array<string \| HttpIndexLegacyFile>/);
    assert.match(source, /normalizeVersionAssets\(versionEntry: HttpIndexVersion\)/);
    assert.match(source, /normalizeLegacyFile\(fileEntry: string \| HttpIndexLegacyFile\)/);
    assert.match(source, /extractNameFromPath\(pathValue\?: string\)/);
  });
});
