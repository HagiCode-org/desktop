import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ManagedNpmPackageStatusSnapshot } from '../../../types/dependency-management.js';
import {
  evaluateDependencyRepairIntent,
  getSelectablePackageIds,
  getSelectedEligiblePackageIds,
  getSelectAllChecked,
  pruneSelectedPackageIds,
  prioritizePackagesForRepair,
  updateSelectAllPackageIds,
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

  it('recomputes selectable package ids when the hagiscript gate opens from the latest snapshot', () => {
    const packages = [
      createPackage('openspec', 'OpenSpec', 'not-installed'),
      createPackage('skills', 'Skills', 'unknown'),
      createPackage('codex', 'Codex', 'installed'),
    ];

    assert.deepEqual(getSelectablePackageIds(packages, {
      hagiscriptGateOpen: false,
      actionsDisabled: false,
    }), []);

    assert.deepEqual(getSelectablePackageIds(packages, {
      hagiscriptGateOpen: true,
      actionsDisabled: false,
    }), ['openspec', 'codex']);

    assert.deepEqual(getSelectablePackageIds(packages, {
      hagiscriptGateOpen: true,
      actionsDisabled: true,
    }), []);
  });

  it('keeps select-all and selected eligibility derived from the latest selectable ids', () => {
    const selectablePackageIds = ['openspec', 'codex'] as const;

    assert.deepEqual(getSelectedEligiblePackageIds(['skills', 'codex'], selectablePackageIds), ['codex']);
    assert.equal(getSelectAllChecked(['codex'], selectablePackageIds), 'indeterminate');
    assert.equal(getSelectAllChecked(['openspec', 'codex'], selectablePackageIds), true);
    assert.deepEqual(updateSelectAllPackageIds(['skills'], selectablePackageIds, true), ['skills', 'openspec', 'codex']);
    assert.deepEqual(updateSelectAllPackageIds(['skills', 'openspec'], selectablePackageIds, false), ['skills']);
  });

  it('removes selected package ids that are hidden or no longer install-eligible after a snapshot change', () => {
    const packages = [
      createPackage('openspec', 'OpenSpec', 'installed'),
      createPackage('skills', 'Skills', 'unknown'),
    ];

    assert.deepEqual(pruneSelectedPackageIds(['openspec', 'skills', 'codex'], packages, {
      hagiscriptGateOpen: true,
    }), ['openspec']);

    assert.deepEqual(pruneSelectedPackageIds(['openspec'], packages, {
      hagiscriptGateOpen: false,
    }), []);
  });
});
