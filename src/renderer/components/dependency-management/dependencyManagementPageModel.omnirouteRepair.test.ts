import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ManagedNpmPackageStatusSnapshot } from '../../../types/dependency-management.js';
import {
  evaluateDependencyRepairIntent,
  prioritizePackagesForRepair,
} from './dependencyManagementPageModel.js';

function createPackage(
  id: ManagedNpmPackageStatusSnapshot['id'],
  displayName: string,
  status: ManagedNpmPackageStatusSnapshot['status'],
): ManagedNpmPackageStatusSnapshot {
  return {
    id,
    definition: {
      id,
      packageName: displayName.toLowerCase(),
      displayName,
      descriptionKey: `dependencyManagement.packages.${id}.description`,
      binName: displayName.toLowerCase(),
      installSpec: displayName.toLowerCase(),
      category: id === 'omniroute' ? 'developer-tool' : 'workflow',
      installMode: 'hagiscript-sync',
    },
    status,
    version: status === 'installed' ? '1.0.0' : null,
    packageRoot: `/tmp/${id}`,
    executablePath: status === 'installed' ? `/tmp/${id}/bin` : null,
  };
}

describe('dependency-management OmniRoute repair helpers', () => {
  it('prioritizes highlighted repair targets before unrelated packages', () => {
    const packages = [
      createPackage('openspec', 'OpenSpec', 'installed'),
      createPackage('omniroute', 'OmniRoute', 'not-installed'),
      createPackage('pm2', 'PM2', 'unknown'),
      createPackage('skills', 'Skills', 'installed'),
    ];

    const prioritized = prioritizePackagesForRepair(packages, ['pm2', 'omniroute']);

    assert.deepEqual(
      prioritized.map((item) => item.id),
      ['omniroute', 'pm2', 'openspec', 'skills'],
    );
  });

  it('marks repair completion as blocked until every targeted package is installed', () => {
    const packages = [
      createPackage('pm2', 'PM2', 'installed'),
      createPackage('omniroute', 'OmniRoute', 'unknown'),
      createPackage('openspec', 'OpenSpec', 'installed'),
    ];

    const evaluation = evaluateDependencyRepairIntent(packages, {
      targetPackageIds: ['pm2', 'omniroute'],
    });

    assert.equal(evaluation.ready, false);
    assert.deepEqual(evaluation.pendingPackageIds, ['omniroute']);
  });

  it('allows return to OmniRoute only after every targeted package is available', () => {
    const packages = [
      createPackage('pm2', 'PM2', 'installed'),
      createPackage('omniroute', 'OmniRoute', 'installed'),
      createPackage('openspec', 'OpenSpec', 'installed'),
    ];

    const evaluation = evaluateDependencyRepairIntent(packages, {
      targetPackageIds: ['pm2', 'omniroute'],
    });

    assert.equal(evaluation.ready, true);
    assert.deepEqual(evaluation.pendingPackageIds, []);
  });
});
