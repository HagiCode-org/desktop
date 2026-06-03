import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isWindowsStoreRuntime,
  looksLikeWindowsStoreInstallPath,
} from '../windows-store-runtime.js';

describe('windows store runtime detection', () => {
  it('detects WindowsApps install roots only when present in the executable path', () => {
    assert.equal(looksLikeWindowsStoreInstallPath('C:\\Program Files\\WindowsApps\\HagiCode\\app.exe'), true);
    assert.equal(looksLikeWindowsStoreInstallPath('C:\\repos\\hagicode\\node_modules\\electron\\dist\\electron.exe'), false);
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
