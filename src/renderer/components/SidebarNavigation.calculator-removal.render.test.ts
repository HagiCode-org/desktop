import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const localesRoot = path.resolve(process.cwd(), 'src/renderer/i18n/locales');

describe('desktop sidebar AI replacement calculator removal', () => {
  it('exposes no calculator entry, icon, URL, or translation key in the sidebar', async () => {
    const source = await fs.readFile(sidebarPath, 'utf8');

    assert.equal(source.includes('cost.hagicode.com'), false);
    assert.equal(source.includes('cost-calculator'), false);
    assert.equal(source.includes('costCalculator'), false);
    assert.equal(source.includes('remainingExternalLinkItems'), false);
    assert.equal(/\bCalculator\b/.test(source), false);
  });

  it('ships no costCalculator translation in any locale source', async () => {
    const locales = await fs.readdir(localesRoot, { withFileTypes: true });
    const commonFiles = locales
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(localesRoot, entry.name, 'common.yml'));

    assert.ok(commonFiles.length > 0);

    for (const file of commonFiles) {
      const text = await fs.readFile(file, 'utf8');
      assert.equal(text.includes('costCalculator'), false, file);
    }
  });
});
