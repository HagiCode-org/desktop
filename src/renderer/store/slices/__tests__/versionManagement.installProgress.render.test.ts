import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pagePath = path.resolve(process.cwd(), 'src/renderer/components/VersionManagementPage.tsx');

describe('version management install progress rendering', () => {
  it('renders install progress only for the currently installing version', async () => {
    const source = await fs.readFile(pagePath, 'utf8');

    assert.match(source, /installingVersionId === version\.id/);
    assert.match(source, /renderInstallTelemetry\(version\.id\)/);
  });
});
