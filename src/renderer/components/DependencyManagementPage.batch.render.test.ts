import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('./DependencyManagementPage.tsx', import.meta.url));

describe('DependencyManagementPage batch command contract', () => {
  it('shares selection across groups and opens a copyable batch dialog', async () => {
    const source = await readFile(sourcePath, 'utf8');
    assert.match(source, /useState<Set<ManagedNpmPackageId>>/);
    assert.match(source, /selectedIds=\{selectedIds\.filter\(\(id\) => basePackageIdSet\.has\(id\)\)\}/);
    assert.match(source, /selectedIds=\{selectedIds\.filter\(\(id\) => agentCliPackageIdSet\.has\(id\)\)\}/);
    assert.match(source, /disabled=\{selectedPackageIds\.size === 0\}/);
    assert.match(source, /<BatchCommandDialog/);
  });
});
