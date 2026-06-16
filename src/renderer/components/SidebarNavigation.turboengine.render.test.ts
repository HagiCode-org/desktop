import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');
const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const storePath = path.resolve(process.cwd(), 'src/renderer/store/index.ts');
const turboEnginePagePath = path.resolve(process.cwd(), 'src/renderer/components/turboengine/TurboEnginePage.tsx');
const turboEngineTypesPath = path.resolve(process.cwd(), 'src/types/turboengine-license.ts');
const viewSlicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/viewSlice.ts');

describe('TurboEngine sidebar and shell wiring', () => {
  it('keeps TurboEngine visible beside the sponsor workspace and wires cached snapshot loading into the shell', async () => {
    const [sidebarSource, appSource, storeSource, turboPageSource, turboTypesSource, viewSliceSource] = await Promise.all([
      fs.readFile(sidebarPath, 'utf8'),
      fs.readFile(appPath, 'utf8'),
      fs.readFile(storePath, 'utf8'),
      fs.readFile(turboEnginePagePath, 'utf8'),
      fs.readFile(turboEngineTypesPath, 'utf8'),
      fs.readFile(viewSlicePath, 'utf8'),
    ]);

    assert.match(sidebarSource, /const turboEngineNavigationItem: NavigationItem = \{/);
    assert.match(sidebarSource, /id: 'turboengine'/);
    assert.match(sidebarSource, /labelKey: 'sidebar\.turboEngine'/);
    assert.match(sidebarSource, /emphasis: 'turboengine'/);
    assert.match(sidebarSource, /return \[\.\.\.baseItems, \.\.\.featuredNavigationItems, settingsNavigationItem\];/);
    assert.match(appSource, /import TurboEnginePage from '\.\/components\/turboengine\/TurboEnginePage';/);
    assert.match(appSource, /currentView === 'turboengine' && <TurboEnginePage \/>/);
    assert.match(turboPageSource, /const turboEngineBridgeAvailable = typeof window\.electronAPI\.turboEngineLicense\?\.getSnapshot === 'function';/);
    assert.match(turboPageSource, /openStorePage\(HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL\)/);
    assert.match(turboTypesSource, /export const HAGICODE_TURBOENGINE_STORE_ID = '9NSD809W18Z6';/);
    assert.match(storeSource, /setTurboEngineLicenseSnapshotFromEvent/);
    assert.match(storeSource, /store\.dispatch\(loadTurboEngineLicenseSnapshot\(\)\)/);
    assert.match(storeSource, /store\.dispatch\(verifyTurboEngineLicenseStartup\(\)\)/);
    assert.match(viewSliceSource, /'turboengine'/);
  });
});
