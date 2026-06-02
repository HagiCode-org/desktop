import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const helpers = await import(new URL('../run-electron-forge.js', import.meta.url));

test('detects the macOS DMG detach race signature only for darwin dmg builds', () => {
  const error = new Error('Command failed: hdiutil detach /Volumes/Hagicode Desktop\nhdiutil: detach failed - No such file or directory');

  assert.equal(helpers.isMacDmgDetachRaceError(error, {
    platform: 'darwin',
    arch: 'x64',
    targets: ['dmg'],
  }), true);

  assert.equal(helpers.isMacDmgDetachRaceError(error, {
    platform: 'darwin',
    arch: 'x64',
    targets: ['zip'],
  }), false);

  assert.equal(helpers.isMacDmgDetachRaceError(error, {
    platform: 'linux',
    arch: 'x64',
    targets: ['dmg'],
  }), false);
});

test('recovers macOS DMG detach race only when the expected dmg artifact exists', async () => {
  const error = new Error('Command failed: hdiutil detach /Volumes/Hagicode Desktop\nhdiutil: detach failed - No such file or directory');
  const dmgPath = helpers.getExpectedForgeArtifactPaths('darwin', 'x64', ['dmg'])[0];
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-dmg-race-'));
  const backupPath = `${dmgPath}.bak-test`;
  let movedExistingArtifact = false;

  try {
    await fs.mkdir(path.dirname(dmgPath), { recursive: true });

    try {
      await fs.rename(dmgPath, backupPath);
      movedExistingArtifact = true;
    } catch {
      // No pre-existing artifact to preserve.
    }

    const missing = await helpers.recoverMacDmgDetachRace(error, {
      platform: 'darwin',
      arch: 'x64',
      targets: ['dmg'],
    });
    assert.equal(missing, null);

    await fs.writeFile(dmgPath, path.join(tmpRoot, 'placeholder'), 'utf8');
    const recovered = await helpers.recoverMacDmgDetachRace(error, {
      platform: 'darwin',
      arch: 'x64',
      targets: ['dmg'],
    });

    assert.ok(recovered);
    assert.equal(recovered.length, 1);
    assert.deepEqual(recovered[0].artifacts, [dmgPath]);
    assert.equal(recovered[0].platform, 'darwin');
    assert.equal(recovered[0].arch, 'x64');
  } finally {
    await fs.rm(dmgPath, { force: true });
    if (movedExistingArtifact) {
      await fs.rename(backupPath, dmgPath);
    } else {
      await fs.rm(backupPath, { force: true });
    }
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
