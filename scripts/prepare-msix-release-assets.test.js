import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import test from 'node:test';
import { prepareMsixReleaseAssets } from './prepare-msix-release-assets.js';

test('prepareMsixReleaseAssets copies signed appx files into msix release assets without changing bytes', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-msix-assets-'));
  const appxPath = path.join(tempRoot, 'Hagicode Desktop 0.1.0.appx');
  const outputDirectory = path.join(tempRoot, 'release-assets');
  await fs.writeFile(appxPath, 'signed-appx-fixture', 'utf8');

  const assets = await prepareMsixReleaseAssets({
    sourcePaths: [appxPath],
    outputDirectory,
  });

  assert.equal(assets.length, 1);
  assert.equal(assets[0].copied, true);
  assert.equal(assets[0].sourceExtension, '.appx');
  assert.equal(assets[0].fileName, 'Hagicode Desktop 0.1.0.msix');
  assert.equal(await fs.readFile(assets[0].outputPath, 'utf8'), 'signed-appx-fixture');
});

test('prepareMsixReleaseAssets rejects unsupported source extensions', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-msix-assets-invalid-'));
  const invalidPath = path.join(tempRoot, 'Hagicode Desktop 0.1.0.zip');
  await fs.writeFile(invalidPath, 'fixture', 'utf8');

  await assert.rejects(
    prepareMsixReleaseAssets({
      sourcePaths: [invalidPath],
      outputDirectory: path.join(tempRoot, 'release-assets'),
    }),
    /Expected a \.appx or \.msix file/,
  );
});
