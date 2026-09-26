import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('./BatchCommandDialog.tsx', import.meta.url));

describe('BatchCommandDialog shell selection contract', () => {
  it('labels the keyboard-accessible shell selector and copies the displayed command', async () => {
    const source = await readFile(sourcePath, 'utf8');

    assert.match(source, /<RadioGroup[\s\S]*?aria-labelledby="batch-command-shell-label"/);
    assert.match(source, /<Label id="batch-command-shell-label">/);
    assert.match(source, /htmlFor="batch-command-shell-cmd"/);
    assert.match(source, /htmlFor="batch-command-shell-powershell"/);
    assert.match(source, /setShell\('cmd'\)/);
    assert.match(source, /writeText\(command\)/);
    assert.match(source, /destinationHint/);
    assert.match(source, /isWindows \?/);
  });
});
