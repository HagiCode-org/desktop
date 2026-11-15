import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { desktopAgentCliCatalog } from '../agent-cli-catalog.js';
import { runtimeManagedPackageManifestPackages } from '../generated/managed-package-manifest.js';
import {
  findManagedNpmPackage,
  isManagedNpmPackageId,
  managedNpmPackages,
} from '../npm-managed-packages.js';

describe('retired Reasonix CLI', () => {
  it('keeps the directory at 12 entries without the reasonix id or its dsnix candidate', () => {
    assert.equal(desktopAgentCliCatalog.length, 12);
    assert.equal(desktopAgentCliCatalog.some((entry) => entry.id === 'reasonix'), false);
    assert.equal(
      desktopAgentCliCatalog.some((entry) => entry.commandCandidates?.includes('dsnix')),
      false,
    );
  });

  it('agrees across the catalog, package definitions and the generated runtime manifest', () => {
    assert.equal(findManagedNpmPackage('reasonix'), null);
    assert.equal(isManagedNpmPackageId('reasonix'), false);
    assert.equal(managedNpmPackages.some((definition) => definition.id === 'reasonix'), false);
    assert.equal(runtimeManagedPackageManifestPackages['reasonix'], undefined);
    assert.equal(managedNpmPackages.some((definition) => definition.packageName === 'reasonix'), false);
  });

  it('ignores a persisted reasonix id without throwing', () => {
    const persistedIds = ['reasonix', 'pi'];
    const resolved = persistedIds.filter((id) => isManagedNpmPackageId(id));
    assert.deepEqual(resolved, ['pi']);
  });
});
