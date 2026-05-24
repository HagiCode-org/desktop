import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { assertMsixPackageMode, listArchiveEntries } from './verify-msix-package-mode.js';

async function createMsixFixture(fileName, entryNames) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-msix-mode-'));
  const msixPath = path.join(tempRoot, fileName);
  const zip = new AdmZip();
  for (const entryName of entryNames) {
    zip.addFile(entryName, Buffer.from('fixture', 'utf8'));
  }
  zip.writeZip(msixPath);
  return msixPath;
}

test('assertMsixPackageMode accepts normal-mode packages', async () => {
  const msixPath = await createMsixFixture('normal.msix', [
    'AppxManifest.xml',
    'resources.pak',
    'extra/runtime/components/dotnet/runtime/win-x64/current/dotnet.exe',
  ]);

  const entries = listArchiveEntries(msixPath);
  assert.doesNotThrow(() => assertMsixPackageMode(entries, 'normal'));
});

test('assertMsixPackageMode rejects portable-fixed payloads in normal mode', async () => {
  const msixPath = await createMsixFixture('steam.msix', [
    'AppxManifest.xml',
    'extra/portable-fixed/current/manifest.json',
  ]);

  const entries = listArchiveEntries(msixPath);
  assert.throws(() => assertMsixPackageMode(entries, 'normal'), /portable-fixed payloads/);
});
