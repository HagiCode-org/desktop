import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const versionManagerPath = path.resolve(process.cwd(), 'src/main/version-manager.ts');

describe('version manager install flow', () => {
  it('logs install completion using the validated version status instead of an undefined identifier', async () => {
    const source = await fs.readFile(versionManagerPath, 'utf-8');

    assert.match(
      source,
      /Version installed successfully:', versionId, 'status:', versionInfo\.status/,
    );
    assert.equal(
      source.includes("Version installed successfully:', versionId, 'status:', status"),
      false,
    );
  });
});
