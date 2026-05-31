import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const msixAssetsRoot = path.resolve(process.cwd(), 'resources', 'msix');
const requiredAssets = [
  { fileName: 'StoreLogo.png', width: 50, height: 50 },
  { fileName: 'Square44x44Logo.png', width: 44, height: 44 },
  { fileName: 'Square150x150Logo.png', width: 150, height: 150 },
  { fileName: 'Wide310x150Logo.png', width: 310, height: 150 },
] as const;

function readPngDimensions(targetPath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(targetPath);
  const pngSignature = '89504e470d0a1a0a';

  assert(buffer.length >= 24, 'PNG file is too small: ' + targetPath);
  assert.equal(buffer.subarray(0, 8).toString('hex'), pngSignature, 'PNG signature is valid for ' + targetPath);

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe('msix tile assets', () => {
  it('provides dedicated Store tile images so Forge MSIX packaging does not fall back to sample assets', () => {
    for (const asset of requiredAssets) {
      const assetPath = path.join(msixAssetsRoot, asset.fileName);
      assert(fs.existsSync(assetPath), 'expected MSIX asset to exist: ' + asset.fileName);

      const dimensions = readPngDimensions(assetPath);
      assert.equal(dimensions.width, asset.width, 'expected ' + asset.fileName + ' width to be ' + asset.width);
      assert.equal(dimensions.height, asset.height, 'expected ' + asset.fileName + ' height to be ' + asset.height);
    }
  });
});
