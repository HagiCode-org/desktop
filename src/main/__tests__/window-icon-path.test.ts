import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveWindowIconPath } from '../window-icon-path.js';

describe('resolveWindowIconPath', () => {
  it('prefers the unpacked resources icon for packaged builds', () => {
    const iconPath = resolveWindowIconPath({
      appRootPath: '/opt/Hagicode/resources/app.asar',
      isPackaged: true,
      resourcesPath: '/opt/Hagicode/resources',
      existsSync: (targetPath) => targetPath === '/opt/Hagicode/resources/icon.png',
    });

    assert.equal(iconPath, '/opt/Hagicode/resources/icon.png');
  });

  it('falls back to the app-root icon when the unpacked icon is unavailable', () => {
    const iconPath = resolveWindowIconPath({
      appRootPath: '/workspace/hagicode-desktop',
      isPackaged: false,
      resourcesPath: '/unused',
      existsSync: () => false,
    });

    assert.equal(iconPath, '/workspace/hagicode-desktop/resources/icon.png');
  });
});
