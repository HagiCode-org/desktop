import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const thunkPath = path.resolve(process.cwd(), 'src/renderer/store/thunks/webServiceThunks.ts');

describe('web service initialize thunk contracts', () => {
  it('does not let late background hydration overwrite an active startup transition', async () => {
    const source = await fs.readFile(thunkPath, 'utf8');
    const section = source.slice(source.indexOf('export const initializeWebService'));

    assert.doesNotMatch(section, /dispatch\(setStatus\('stopped'\)\);/);
    assert.match(section, /const currentState = \(getState\(\) as \{/);
    assert.match(section, /status: ProcessStatus;/);
    assert.match(section, /phase: StartupPhase;/);
    assert.match(section, /const shouldSkipStaleHydration = currentState\.isOperating/);
    assert.match(section, /currentState\.status === 'starting'/);
    assert.match(section, /currentState\.phase === StartupPhase\.CheckingDependencies/);
    assert.match(section, /if \(!shouldSkipStaleHydration\) \{\s*dispatch\(setProcessInfo\(status\)\);\s*\}/s);
  });
});
