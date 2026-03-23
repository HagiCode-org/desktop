import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const scriptPath = path.resolve(process.cwd(), 'scripts/dev-with-portable-runtime.js');
const docsPath = path.resolve(process.cwd(), 'docs/development.md');

describe('portable version dev startup', () => {
  it('registers a dedicated dev command for portable version mode', async () => {
    const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    assert.equal(pkg.scripts['dev:portable-version'], 'node scripts/dev-with-portable-runtime.js');
  });

  it('defaults the portable runtime root to workspace extracted outputs and allows env or .env overrides', async () => {
    const source = await fs.readFile(scriptPath, 'utf-8');

    assert.match(source, /HAGICODE_PORTABLE_RUNTIME_ROOT/);
    assert.match(source, /local_deployment', 'linux-x64'/);
    assert.match(source, /local_deployment', 'linux-x64-nort'/);
    assert.match(source, /local_publishment', '\.local-publishment', 'linux-x64'/);
    assert.match(source, /local_publishment', '\.local-publishment', 'linux-x64-nort'/);
    assert.match(source, /release-structured', 'linux-x64'/);
    assert.match(source, /release-structured', 'linux-x64-nort'/);
    assert.match(source, /\.env\.development\.local/);
    assert.match(source, /staged a dev bridge payload/);
    assert.match(source, /Set HAGICODE_PORTABLE_RUNTIME_ROOT to an extracted runtime directory to override the default/);
  });

  it('documents the dedicated dev command and override contract', async () => {
    const docs = await fs.readFile(docsPath, 'utf-8');

    assert.match(docs, /npm run dev:portable-version/);
    assert.match(docs, /HAGICODE_PORTABLE_RUNTIME_ROOT/);
    assert.match(docs, /local_deployment\/linux-x64/);
    assert.match(docs, /local_publishment\/\.local-publishment\/linux-x64-nort/);
    assert.match(docs, /\.env\.local/);
    assert.match(docs, /temporary dev bridge payload/);
  });
});
