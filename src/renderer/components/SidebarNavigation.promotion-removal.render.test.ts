import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sourceRoots = [
  path.resolve(process.cwd(), 'src/renderer/components'),
  path.resolve(process.cwd(), 'src/renderer/hooks'),
  path.resolve(process.cwd(), 'src/renderer/lib'),
];

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath);
    }

    return /\.(?:ts|tsx|js)$/.test(entry.name) ? [entryPath] : [];
  }));

  return files.flat();
}

describe('desktop promotion surface removal', () => {
  it('does not load or render remote promotion cards in Desktop', async () => {
    const files = (await Promise.all(sourceRoots.map((root) => collectSourceFiles(root)))).flat();
    const sources = await Promise.all(files
      .filter((file) => !file.endsWith('SidebarNavigation.promotion-removal.render.test.ts'))
      .map(async (file) => ({
      file,
      text: await fs.readFile(file, 'utf8'),
    })));

    for (const { file, text } of sources) {
      assert.equal(text.includes('promote.json'), false, file);
      assert.equal(text.includes('promote_content.json'), false, file);
      assert.equal(text.includes('SidebarPromotion'), false, file);
      assert.equal(text.includes('useSidebarPromotion'), false, file);
      assert.equal(/wishlist|愿望单/i.test(text), false, file);
    }
  });
});
