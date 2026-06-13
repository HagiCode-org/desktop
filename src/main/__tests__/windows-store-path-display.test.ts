import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createPathDisplayInfo,
  resolveWindowsStorePackageFamilyName,
  resolveWindowsStoreVirtualizedPhysicalPath,
} from '../windows-store-path-display.js';

describe('windows store path display', () => {
  it('derives the package family name from a WindowsApps executable path', () => {
    const packageFamilyName = resolveWindowsStorePackageFamilyName(
      'C:\\Program Files\\WindowsApps\\newbe36524.Hagicode_0.1.0.0_x64__8wekyb3d8bbwe\\Hagicode Desktop.exe',
    );

    assert.equal(packageFamilyName, 'newbe36524.Hagicode_8wekyb3d8bbwe');
  });

  it('maps roaming AppData paths into the package LocalCache roaming root', () => {
    const physicalPath = resolveWindowsStoreVirtualizedPhysicalPath(
      'C:\\Users\\Tester\\AppData\\Roaming\\Hagicode Desktop\\runtime-data',
      {
        isWindowsStore: true,
        platform: 'win32',
        execPath: 'C:\\Program Files\\WindowsApps\\newbe36524.Hagicode_0.1.0.0_x64__8wekyb3d8bbwe\\Hagicode Desktop.exe',
        env: {
          LOCALAPPDATA: 'C:\\Users\\Tester\\AppData\\Local',
          APPDATA: 'C:\\Users\\Tester\\AppData\\Roaming',
        },
      },
    );

    assert.equal(
      physicalPath,
      'C:\\Users\\Tester\\AppData\\Local\\Packages\\newbe36524.Hagicode_8wekyb3d8bbwe\\LocalCache\\Roaming\\Hagicode Desktop\\runtime-data',
    );
  });

  it('maps local AppData paths into the package LocalCache local root', () => {
    const physicalPath = resolveWindowsStoreVirtualizedPhysicalPath(
      'C:\\Users\\Tester\\AppData\\Local\\Hagicode Desktop\\logs',
      {
        isWindowsStore: true,
        platform: 'win32',
        execPath: 'C:\\Program Files\\WindowsApps\\newbe36524.Hagicode_0.1.0.0_x64__8wekyb3d8bbwe\\Hagicode Desktop.exe',
        env: {
          LOCALAPPDATA: 'C:\\Users\\Tester\\AppData\\Local',
          APPDATA: 'C:\\Users\\Tester\\AppData\\Roaming',
        },
      },
    );

    assert.equal(
      physicalPath,
      'C:\\Users\\Tester\\AppData\\Local\\Packages\\newbe36524.Hagicode_8wekyb3d8bbwe\\LocalCache\\Local\\Hagicode Desktop\\logs',
    );
  });

  it('keeps non-store paths unchanged in display metadata', () => {
    const info = createPathDisplayInfo('/tmp/hagicode/runtime-data', {
      isWindowsStore: false,
      platform: 'linux',
    });

    assert.equal(info.displayPath, '/tmp/hagicode/runtime-data');
    assert.equal(info.physicalPath, null);
    assert.equal(info.virtualizationKind, 'none');
  });

  it('does not re-virtualize paths that are already under the package cache root', () => {
    const info = createPathDisplayInfo(
      'C:\\Users\\Tester\\AppData\\Local\\Packages\\newbe36524.Hagicode_8wekyb3d8bbwe\\LocalCache\\Roaming\\Hagicode Desktop\\runtime-data',
      {
        isWindowsStore: true,
        platform: 'win32',
        execPath: 'C:\\Program Files\\WindowsApps\\newbe36524.Hagicode_0.1.0.0_x64__8wekyb3d8bbwe\\Hagicode Desktop.exe',
        env: {
          LOCALAPPDATA: 'C:\\Users\\Tester\\AppData\\Local',
          APPDATA: 'C:\\Users\\Tester\\AppData\\Roaming',
        },
      },
    );

    assert.equal(
      info.displayPath,
      'C:\\Users\\Tester\\AppData\\Local\\Packages\\newbe36524.Hagicode_8wekyb3d8bbwe\\LocalCache\\Roaming\\Hagicode Desktop\\runtime-data',
    );
    assert.equal(info.physicalPath, null);
    assert.equal(info.virtualizationKind, 'none');
  });
});
