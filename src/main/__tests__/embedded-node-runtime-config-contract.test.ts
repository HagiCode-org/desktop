import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const runtimeConfigSourcePath = path.resolve(process.cwd(), 'src/main/embedded-node-runtime-config.ts');

describe('embedded node runtime config contract', () => {
  it('resolves the packaged runtime manifest from app.asar resources when source paths are unavailable', async () => {
    const source = await fs.readFile(runtimeConfigSourcePath, 'utf8');

    assert.match(source, /fileURLToPath\(import\.meta\.url\)/);
    assert.match(source, /process\.cwd\(\), 'resources', 'embedded-node-runtime', 'runtime-manifest\.json'/);
    assert.match(source, /moduleDirectory, '\.\.\/\.\.\/resources\/embedded-node-runtime\/runtime-manifest\.json'/);
    assert.match(source, /fs\.existsSync\(candidate\)/);
    assert.match(source, /Pinned embedded Node runtime manifest was not found/);
  });
});
