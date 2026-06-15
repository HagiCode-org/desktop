import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');

describe('TurboEngine preload bridge contract', () => {
  it('exposes the typed TurboEngine bridge only when the feature flag is present', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /import type \{ TurboEngineLicenseBridge \} from '\.\.\/types\/turboengine-license\.js';/);
    assert.match(source, /import \{ turboEngineChannels \} from '\.\.\/types\/turboengine-license\.js';/);
    assert.match(source, /const TURBOENGINE_LICENSE_FEATURE_ARG = '--desktop-turboengine-license-enabled=1';/);
    assert.match(source, /const turboEngineLicenseFeatureEnabled = process\.argv\.includes\(TURBOENGINE_LICENSE_FEATURE_ARG\);/);
    assert.match(source, /const turboEngineLicenseBridge: TurboEngineLicenseBridge = \{/);
    assert.match(source, /getSnapshot: \(\) => ipcRenderer\.invoke\(turboEngineChannels\.getSnapshot\)/);
    assert.match(source, /verifyStartup: \(\) => ipcRenderer\.invoke\(turboEngineChannels\.verifyStartup\)/);
    assert.match(source, /refresh: \(\) => ipcRenderer\.invoke\(turboEngineChannels\.refresh\)/);
    assert.match(source, /purchase: \(\) => ipcRenderer\.invoke\(turboEngineChannels\.purchase\)/);
    assert.match(source, /ipcRenderer\.on\(turboEngineChannels\.changed, listener\)/);
    assert.match(source, /\.\.\.\(turboEngineLicenseFeatureEnabled \? \{ turboEngineLicense: turboEngineLicenseBridge \} : \{\}\)/);
  });
});
