import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const pagePath = path.resolve(process.cwd(), 'src/renderer/components/turboengine/TurboEnginePage.tsx');
const slicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/turboEngineLicenseSlice.ts');
const typesPath = path.resolve(process.cwd(), 'src/types/turboengine-license.ts');

describe('TurboEngine workspace renderer', () => {
  it('renders TurboEngine status, diagnostics, refresh, purchase, and Store handoff paths', async () => {
    const [pageSource, sliceSource, typesSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(slicePath, 'utf8'),
      fs.readFile(typesPath, 'utf8'),
    ]);

    assert.match(pageSource, /HAGICODE_TURBOENGINE_STORE_ID/);
    assert.match(pageSource, /snapshot\?\.diagnostics\.length/);
    assert.match(pageSource, /dispatch\(refreshTurboEngineLicenseSnapshot\(\)\)/);
    assert.match(pageSource, /dispatch\(purchaseTurboEngineLicense\(\)\)/);
    assert.match(pageSource, /dispatch\(verifyTurboEngineLicenseStartup\(\)\)/);
    assert.match(pageSource, /turboEngine\.purchaseOutcome\./);
    assert.match(pageSource, /turboEngine\.unsupported\.nonStoreDescription/);
    assert.match(pageSource, /openStorePage\(HAGICODE_TURBOENGINE_STORE_WEB_URL\)/);
    assert.match(pageSource, /openStorePage\(HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL\)/);
    assert.match(sliceSource, /'turboEngineLicense\/loadSnapshot'/);
    assert.match(sliceSource, /'turboEngineLicense\/verifyStartup'/);
    assert.match(sliceSource, /'turboEngineLicense\/refreshSnapshot'/);
    assert.match(sliceSource, /'turboEngineLicense\/purchase'/);
    assert.match(typesSource, /turboEngineAccess/);
  });
});
