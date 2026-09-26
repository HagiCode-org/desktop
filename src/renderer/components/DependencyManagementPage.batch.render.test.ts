import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('./DependencyManagementPage.tsx', import.meta.url));

describe('DependencyManagementPage batch command contract', () => {
  it('wires the current package selection and platform to a copyable batch dialog', async () => {
    const source = await readFile(sourcePath, 'utf8');
    assert.match(source, /useState<Set<ManagedNpmPackageId>>/);
    assert.match(source, /selectedPackageIds=\{selectedPackageIds\}/);
    assert.match(source, /onSelectionChange=\{updateSelectedIds\}/);
    assert.match(source, /<BatchCommandDialog/);
    assert.match(source, /definitions=\{selectedBatchPackageDefinitions\}/);
    assert.match(source, /platform=\{platform\}/);
  });
});
