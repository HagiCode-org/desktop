import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sourcePath = path.resolve(process.cwd(), 'src/main/version-manager.ts');

describe('version manager predownload reuse', () => {
  it('adds a predownload-only entrypoint that reuses the archive preparation helper', async () => {
    const source = await fs.readFile(sourcePath, 'utf8');

    assert.match(source, /async predownloadVersion\(/);
    assert.match(source, /const archive = await this\.ensureVersionArchive\(targetVersion, onProgress\)/);
  });

  it('reuses a verified cached archive before falling back to a fresh download', async () => {
    const source = await fs.readFile(sourcePath, 'utf8');

    assert.match(source, /const cachedArchive = await this\.tryUseCachedArchive\(targetVersion, cachePath, onProgress\)/);
    assert.match(source, /if \(cachedArchive\) \{/);
    assert.match(source, /await this\.hybridDownloadCoordinator\.download\(/);
    assert.match(source, /await fs\.rm\(cachePath, \{ force: true \}\)\.catch\(\(\) => undefined\)/);
  });
});
