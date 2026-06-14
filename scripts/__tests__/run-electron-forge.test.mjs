import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.HAGICODE_SKIP_RUN_ELECTRON_FORGE_MAIN = '1';
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

test('synchronizes a fresh development MSIX registration layout from the unpacked app', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-msix-dev-layout-'));
  const unpackedDir = path.join(tmpRoot, 'win-unpacked');
  const stageDir = path.join(tmpRoot, 'msix-stage');
  const manifestPath = path.join(tmpRoot, 'Package.appxmanifest');
  const assetsPath = path.join(tmpRoot, 'assets');

  try {
    await fs.mkdir(path.join(unpackedDir, 'resources'), { recursive: true });
    await fs.writeFile(path.join(unpackedDir, 'Hagicode Desktop.exe'), 'exe', 'utf8');
    await fs.writeFile(path.join(unpackedDir, 'resources', 'app.asar'), 'asar', 'utf8');
    await fs.writeFile(manifestPath, '<Package><Applications><Application Executable="app\\Hagicode Desktop.exe" /></Applications></Package>', 'utf8');
    await fs.mkdir(assetsPath, { recursive: true });
    await fs.writeFile(path.join(assetsPath, 'StoreLogo.png'), 'logo', 'utf8');

    const stageAppDir = await helpers.syncMsixDeveloperRegistrationLayout(unpackedDir, {
      stageDir,
      manifestPath,
      assetsPath,
    });

    assert.equal(stageAppDir, path.join(stageDir, 'app'));
    assert.equal(await fs.readFile(path.join(stageAppDir, 'Hagicode Desktop.exe'), 'utf8'), 'exe');
    assert.equal(await fs.readFile(path.join(stageAppDir, 'resources', 'app.asar'), 'utf8'), 'asar');
    assert.equal(
      await fs.readFile(path.join(stageAppDir, 'AppxManifest.xml'), 'utf8'),
      '<Package><Applications><Application Executable="Hagicode Desktop.exe" /></Applications></Package>',
    );
    assert.equal(await fs.readFile(path.join(stageAppDir, 'Assets', 'StoreLogo.png'), 'utf8'), 'logo');

    const metadata = JSON.parse(await fs.readFile(path.join(stageAppDir, 'resources', 'distribution-metadata.json'), 'utf8'));
    assert.equal(metadata.channel, 'win-store');
    assert.equal(metadata.mode, 'fusion');
    assert.equal(metadata.extensions.source, 'msix-dev-registration-layout');
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('rewrites packaged MSIX executable paths for development registration manifests', () => {
  assert.equal(
    helpers.createDevRegisterManifest('<Application Executable="app\\Hagicode Desktop.exe" />'),
    '<Application Executable="Hagicode Desktop.exe" />',
  );

  assert.equal(
    helpers.createDevRegisterManifest("<Application Executable='app/Hagicode Desktop.exe' />"),
    "<Application Executable='Hagicode Desktop.exe' />",
  );
});

test('uses a dedicated directory for development MSIX registration layouts', () => {
  assert.equal(
    helpers.resolveDevMsixRegistrationStageDir('build/msix-stage'),
    path.resolve('build/msix-stage-dev-registration'),
  );
});
