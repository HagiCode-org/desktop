#!/usr/bin/env node
/**
 * Builds the cat-head sprite sheet used by the sidebar logo and the start button.
 *
 * The 20 heads are picked from repos/img-gen's `cat-head-gallery` (1000 heads, 1024 x 1024 AVIF): one per
 * art style, chosen so each stays readable at 36 px and the backdrop colours do not repeat. The sheet is a
 * 5 x 4 grid of 96 px cells (2x of the 48 px largest display size), read row by row, and is encoded as AVIF.
 *
 * Usage: node scripts/build-cat-sprite.mjs [--source <cat-head-gallery dir>] [--check]
 * Needs `ffmpeg` (libaom-av1) and ImageMagick (`magick`) on PATH.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CAT_SPRITE_KEYS = [
  'g001-flat-vector-01',
  'g002-ukiyo-e-01',
  'g005-oil-impasto-01',
  'g010-neon-line-01',
  'g016-bauhaus-geometry-01',
  'g017-cyanotype-01',
  'g024-mid-century-gouache-01',
  'g025-voxel-01',
  'g027-gameboy-lcd-01',
  'g034-vaporwave-01',
  'g035-synthwave-chrome-01',
  'g041-glossy-balloon-01',
  'g042-blue-white-porcelain-01',
  'g051-naive-folk-art-01',
  'g058-red-paper-cut-01',
  'g060-kawaii-pastel-01',
  'g061-retro-90s-anime-01',
  'g072-glossy-3d-icon-01',
  'g083-warhol-silkscreen-01',
  'g095-constellation-map-01',
];

const CELL = 96;
const COLUMNS = 5;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'src/renderer/assets/cat-sprite/cat-heads.avif');

function main() {
  const args = process.argv.slice(2);
  const sourceFlag = args.indexOf('--source');
  const source = path.resolve(
    sourceFlag >= 0 ? args[sourceFlag + 1] : path.join(root, '../img-gen/out/r2/cat-head-gallery'),
  );
  const rows = Math.ceil(CAT_SPRITE_KEYS.length / COLUMNS);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-sprite-'));

  try {
    const cells = CAT_SPRITE_KEYS.map((key, index) => {
      const input = path.join(source, `${key}.avif`);
      if (!fs.existsSync(input)) {
        throw new Error(`Missing source head: ${input}`);
      }
      const cell = path.join(work, `${String(index).padStart(2, '0')}.png`);
      execFileSync('ffmpeg', [
        '-loglevel', 'error', '-y', '-i', input,
        '-vf', `scale=${CELL}:${CELL}:flags=lanczos`, cell,
      ]);
      return cell;
    });

    const sheet = path.join(work, 'sheet.png');
    execFileSync('magick', [
      'montage', ...cells, '-tile', `${COLUMNS}x${rows}`, '-geometry', `${CELL}x${CELL}+0+0`, sheet,
    ]);
    execFileSync('ffmpeg', [
      '-loglevel', 'error', '-y', '-i', sheet,
      '-c:v', 'libaom-av1', '-crf', '30', '-b:v', '0', '-cpu-used', '2', '-still-picture', '1', '-pix_fmt', 'yuv420p',
      outputPath,
    ]);
    console.log(`${path.relative(root, outputPath)}: ${fs.statSync(outputPath).size} bytes, ${COLUMNS * CELL}x${rows * CELL}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
