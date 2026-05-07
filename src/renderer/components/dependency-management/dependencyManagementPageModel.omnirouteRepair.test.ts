import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  ManagedNpmPackageStatusSnapshot,
  VendoredRuntimeStatusSnapshot,
} from '../../../types/dependency-management.js';
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
  version?: string | null,
): ManagedNpmPackageStatusSnapshot {
  return {
    id,
    definition: {
      id,
      packageName: displayName.toLowerCase(),
      displayName,
      descriptionKey: `dependencyManagement.packages.${id}.description`,
      binName: displayName.toLowerCase(),
      installSpec: id === 'pm2' ? 'pm2@7.0.1' : displayName.toLowerCase(),
      category: 'workflow',
      installMode: 'hagiscript-sync',
    },
    status,
    version: status === 'installed' ? (version ?? '1.0.0') : null,
    packageRoot: `/tmp/${id}`,
    executablePath: status === 'installed' ? `/tmp/${id}/bin` : null,
  };
}

function createRuntime(
  id: VendoredRuntimeStatusSnapshot['id'],
  status: VendoredRuntimeStatusSnapshot['status'],
): VendoredRuntimeStatusSnapshot {
  return {
    id,
    definition: {
      id,
      displayName: id === 'omniroute' ? 'OmniRoute' : 'Code Server',
      descriptionKey: `dependencyManagement.vendoredRuntimes.${id}.description`,
      packageId: id,
      managedByDesktop: true,
      bundledNodeRuntime: id === 'omniroute',
      supportsStartStop: true,
      supportsRepair: true,
    },
    installStatus: status === 'missing' ? 'not-installed' : status === 'damaged' ? 'failed' : 'installed',
    status,
    version: status === 'ready' ? '1.0.0' : null,
    runtimeRoot: `/tmp/${id}`,
    metadataPath: status === 'missing' ? null : `/tmp/${id}/metadata.json`,
    wrapperPath: status === 'missing' ? null : `/tmp/${id}/bin/${id}`,
    entryScriptPath: status === 'missing' ? null : `/tmp/${id}/bin/${id}.mjs`,
    packageId: id,
    schemaVersion: status === 'missing' ? null : 1,
    bundledNodeRuntime: id === 'omniroute',
    managedByDesktop: true,
    primaryAction: status === 'ready' ? 'start' : 'repair',
    diagnostics: [],
    health: {
      metadataValid: status === 'ready',
      wrapperPresent: status === 'ready',
      entryScriptPresent: status === 'ready',
      nodeRuntimePresent: id === 'omniroute' ? status === 'ready' : null,
    },
  };
}

describe('dependency-management OmniRoute repair helpers', () => {
  it('prioritizes highlighted repair targets before unrelated packages', () => {
    const packages = [
      createPackage('openspec', 'OpenSpec', 'installed'),
      createPackage('pm2', 'PM2', 'unknown'),
      createPackage('skills', 'Skills', 'installed'),
    ];

    const prioritized = prioritizePackagesForRepair(packages, ['pm2']);

    assert.deepEqual(
      prioritized.map((item) => item.id),
      ['pm2', 'openspec', 'skills'],
    );
  });

  it('marks repair completion as blocked until every targeted runtime and package is ready', () => {
    const packages = [
      createPackage('pm2', 'PM2', 'installed'),
      createPackage('openspec', 'OpenSpec', 'installed'),
    ];
    const runtimes = [
      createRuntime('omniroute', 'damaged'),
    ];

    const evaluation = evaluateDependencyRepairIntent(packages, runtimes, {
      targetRuntimeIds: ['omniroute'],
      targetPackageIds: ['pm2'],
    });

    assert.equal(evaluation.ready, false);
    assert.deepEqual(evaluation.pendingPackageIds, []);
    assert.deepEqual(evaluation.pendingRuntimeIds, ['omniroute']);
  });

  it('keeps repair completion blocked when a targeted package is installed at an unsupported version', () => {
    const packages = [
      createPackage('pm2', 'PM2', 'installed', '6.0.14'),
    ];

    const evaluation = evaluateDependencyRepairIntent(packages, [], {
      targetPackageIds: ['pm2'],
      targetRuntimeIds: [],
    });

    assert.equal(evaluation.ready, false);
    assert.deepEqual(evaluation.pendingPackageIds, ['pm2']);
  });

  it('allows return to OmniRoute only after every targeted package is available', () => {
    const packages = [
      createPackage('pm2', 'PM2', 'installed'),
      createPackage('openspec', 'OpenSpec', 'installed'),
    ];
    const runtimes = [
      createRuntime('omniroute', 'ready'),
    ];

    const evaluation = evaluateDependencyRepairIntent(packages, runtimes, {
      targetRuntimeIds: ['omniroute'],
      targetPackageIds: ['pm2'],
    });

    assert.equal(evaluation.ready, true);
    assert.deepEqual(evaluation.pendingPackageIds, []);
    assert.deepEqual(evaluation.pendingRuntimeIds, []);
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
