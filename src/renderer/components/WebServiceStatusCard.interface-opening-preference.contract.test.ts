import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const cardPath = path.resolve(process.cwd(), 'src/renderer/components/WebServiceStatusCard.tsx');

describe('web service manual opening preference recording', () => {
  it('records in-app preference only after the existing opener succeeds', async () => {
    const source = await fs.readFile(cardPath, 'utf8');

    assert.match(
      source,
      /const result = await window\.electronAPI\.openHagicodeInApp\(url\);\s*if \(result\.success\) \{\s*await window\.electronAPI\.recordInterfaceOpeningMethod\('in-app'\);/s,
    );
  });

  it('records browser preference only after the existing opener succeeds', async () => {
    const source = await fs.readFile(cardPath, 'utf8');

    assert.match(
      source,
      /const result = await window\.electronAPI\.openExternal\(url\);\s*if \(result\.success\) \{\s*await window\.electronAPI\.recordInterfaceOpeningMethod\('browser'\);/s,
    );
  });
});
