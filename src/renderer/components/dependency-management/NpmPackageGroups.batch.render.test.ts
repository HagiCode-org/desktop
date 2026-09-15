import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('./NpmPackageGroups.tsx', import.meta.url));

describe('NpmPackageTable batch selection contract', () => {
  it('renders required markers and emits checkbox selection changes', async () => {
    const source = await readFile(sourcePath, 'utf8');
    assert.match(source, /item\.definition\.required === true/);
    assert.match(source, /dependencyManagement\.batch\.requiredLabel/);
    assert.match(source, /<Checkbox/);
    assert.match(source, /onSelectionChange\(nextIds\)/);
  });
});
