import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const illustrationsDir = path.resolve(process.cwd(), 'src/renderer/assets/illustrations');
const componentsDir = path.resolve(process.cwd(), 'src/renderer/components');

/** Largest accepted file: the pictures are decorative and ship inside the app, so each one stays small. */
const MAX_BYTES = 40 * 1024;
const MAX_TOTAL_BYTES = 160 * 1024;

async function listAvif(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { recursive: true });
  return entries.filter((entry) => entry.endsWith('.avif')).sort();
}

describe('desktop illustrations', () => {
  it('ships only AVIF files, each small, and a small total', async () => {
    const files = await listAvif(illustrationsDir);
    assert.equal(files.length, 14);

    let total = 0;
    for (const file of files) {
      const bytes = await fs.readFile(path.join(illustrationsDir, file));
      // ISO BMFF: bytes 4-8 are "ftyp", bytes 8-12 the major brand ("avif" for a still picture).
      assert.equal(bytes.subarray(4, 8).toString('latin1'), 'ftyp', `${file} is not an ISO media file`);
      assert.equal(bytes.subarray(8, 12).toString('latin1'), 'avif', `${file} is not AVIF`);
      assert.ok(bytes.length <= MAX_BYTES, `${file} is ${bytes.length} bytes, over ${MAX_BYTES}`);
      total += bytes.length;
    }
    assert.ok(total <= MAX_TOTAL_BYTES, `illustrations total ${total} bytes, over ${MAX_TOTAL_BYTES}`);
  });

  it('exports every file from the index exactly once', async () => {
    const files = await listAvif(illustrationsDir);
    const index = await fs.readFile(path.join(illustrationsDir, 'index.ts'), 'utf8');
    for (const file of files) {
      const importPath = `./${file.split(path.sep).join('/')}`;
      assert.equal(index.split(`'${importPath}'`).length - 1, 1, `${importPath} must be imported once`);
    }
  });

  it('renders every illustration as a decorative image', async () => {
    const sources = await fs.readdir(componentsDir, { recursive: true });
    const used = [];
    for (const relative of sources.filter((file) => file.endsWith('.tsx'))) {
      const source = await fs.readFile(path.join(componentsDir, relative), 'utf8');
      if (!source.includes('@/assets/illustrations')) continue;
      used.push(relative);
      const tags = source.match(/<img\b[\s\S]*?\/>/g) ?? [];
      const picture = tags.filter((tag) => /_IMAGES|PROMOTE_FALLBACK_COVERS/.test(tag));
      assert.ok(picture.length > 0, `${relative} imports illustrations but renders none`);
      for (const tag of picture) {
        assert.match(tag, /alt=""/, `${relative}: an illustration needs alt=""`);
        assert.match(tag, /aria-hidden="true"/, `${relative}: an illustration needs aria-hidden`);
      }
    }
    assert.equal(used.length, 10);
  });

  it('no longer uses emoji or glyph characters as pictures in the covered components', async () => {
    const files = [
      'HomeStoreDonationItem.tsx',
      'DependencyStartConfirmDialog.tsx',
      'DependencyWarningBanner.tsx',
      'InstallConfirmDialog.tsx',
    ];
    for (const file of files) {
      const source = await fs.readFile(path.join(componentsDir, file), 'utf8');
      assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}☀-➿]/u, `${file} still holds an emoji`);
    }
    const lib = await fs.readFile(path.resolve(process.cwd(), 'src/renderer/lib/msstore-donation-item.ts'), 'utf8');
    assert.doesNotMatch(lib, /emoji/);
  });
});
