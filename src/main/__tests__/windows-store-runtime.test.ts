import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  isWindowsStoreRuntime,
  looksLikeWindowsStoreDevelopmentPackage,
  looksLikeWindowsStoreInstallPath,
} from '../windows-store-runtime.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('windows store runtime detection', () => {
  it('detects WindowsApps install roots only when present in the executable path', () => {
    assert.equal(looksLikeWindowsStoreInstallPath('C:\\Program Files\\WindowsApps\\HagiCode\\app.exe'), true);
    assert.equal(looksLikeWindowsStoreInstallPath('C:\\repos\\hagicode\\node_modules\\electron\\dist\\electron.exe'), false);
  });

  it('detects development AppX layouts outside WindowsApps when an adjacent AppxManifest registers a full-trust app', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-winstore-devpkg-'));
    const execPath = path.join(tempRoot, 'Hagicode Desktop.exe');
    tempDirectories.push(tempRoot);
    await fs.writeFile(path.join(tempRoot, 'AppxManifest.xml'), `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10">
  <Identity Name="newbe36524.Hagicode" Publisher="CN=8B6C8A94-AAE5-4C8B-9202-A29EA42B042F" Version="0.1.0.0" />
  <Applications>
    <Application Id="newbe36524.Hagicode" Executable="Hagicode Desktop.exe" EntryPoint="Windows.FullTrustApplication" />
  </Applications>
</Package>
`, 'utf8');

    assert.equal(looksLikeWindowsStoreDevelopmentPackage(execPath), true);
    assert.equal(isWindowsStoreRuntime({
      platform: 'win32',
      processWindowsStore: false,
      execPath,
      isPackaged: true,
      defaultApp: false,
    }), true);
  });

  it('does not treat arbitrary adjacent AppxManifest files as Windows Store runtime unless they describe a full-trust app', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-winstore-devpkg-invalid-'));
    const execPath = path.join(tempRoot, 'Hagicode Desktop.exe');
    tempDirectories.push(tempRoot);
    await fs.writeFile(path.join(tempRoot, 'AppxManifest.xml'), `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10">
  <Identity Name="newbe36524.Hagicode" Publisher="CN=8B6C8A94-AAE5-4C8B-9202-A29EA42B042F" Version="0.1.0.0" />
</Package>
`, 'utf8');

    assert.equal(looksLikeWindowsStoreDevelopmentPackage(execPath), false);
    assert.equal(isWindowsStoreRuntime({
      platform: 'win32',
      processWindowsStore: false,
      execPath,
      isPackaged: true,
      defaultApp: false,
    }), false);
  });

  it('does not treat Electron default-app development runs as Windows Store runtime', () => {
    const detected = isWindowsStoreRuntime({
      platform: 'win32',
      processWindowsStore: true,
      execPath: 'C:\\repos\\hagicode\\node_modules\\electron\\dist\\electron.exe',
      isPackaged: false,
      defaultApp: true,
    });

    assert.equal(detected, false);
  });

  it('treats packaged WindowsApps launches as Windows Store runtime', () => {
    const detected = isWindowsStoreRuntime({
      platform: 'win32',
      processWindowsStore: true,
      execPath: 'C:\\Program Files\\WindowsApps\\newbe36524.HagicodeDesktop\\Hagicode Desktop.exe',
      isPackaged: true,
      defaultApp: false,
    });

    assert.equal(detected, true);
  });

  it('honors the explicit runtime override flag', () => {
    const detected = isWindowsStoreRuntime({
      platform: 'win32',
      inheritedFlag: 'true',
      processWindowsStore: false,
      execPath: 'C:\\repos\\hagicode\\node_modules\\electron\\dist\\electron.exe',
      isPackaged: false,
      defaultApp: true,
    });

    assert.equal(detected, true);
  });
});
