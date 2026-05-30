import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { minVersion } from 'semver';
import {
  evaluateDependencyReadiness,
  getManagedPackageRequiredVersionRange,
  isManagedPackageVersionSatisfied,
  managedNpmPackages,
  npmInstallableAgentCliPackages,
  optionalManagedNpmPackages,
  requiredManagedNpmPackages,
} from '../../../dist/shared/npm-managed-packages.js';
import type {
  ManagedNpmPackageId,
  ManagedNpmPackageDefinition,
  ManagedNpmPackageStatus,
  ManagedNpmPackageStatusSnapshot,
  DependencyManagementSnapshot,
} from '../../../dist/types/dependency-management.js';

function createSnapshot(
  statusOverrides: Partial<Record<ManagedNpmPackageId, ManagedNpmPackageStatus>>,
  versionOverrides: Partial<Record<ManagedNpmPackageId, string | null>> = {},
  definitionOverrides: Partial<Record<ManagedNpmPackageId, Partial<ManagedNpmPackageDefinition>>> = {},
): DependencyManagementSnapshot {
  const packages: ManagedNpmPackageStatusSnapshot[] = managedNpmPackages.map((definition) => {
    const effectiveDefinition = {
      ...definition,
      ...definitionOverrides[definition.id],
    };
    const status = statusOverrides[definition.id] ?? 'installed';
    const requiredVersionRange = getManagedPackageRequiredVersionRange(effectiveDefinition);
    const version = status === 'installed'
      ? (
        versionOverrides[definition.id]
        ?? minVersion(requiredVersionRange ?? '')?.version
        ?? '1.0.0'
      )
      : null;

    return {
      id: definition.id,
      definition: effectiveDefinition,
      status,
      version,
      packageRoot: `/managed/${definition.id}`,
      executablePath: status === 'installed' ? `/managed/bin/${definition.binName}` : null,
    };
  });

  return {
    environment: {
      available: true,
      toolchainRoot: '/managed',
      nodeRuntimeRoot: '/managed/node',
      nodeVersion: 'v24.0.0',
      nodeMajorVersion: '24',
      npmGlobalPrefix: '/managed/node',
      npmGlobalBinRoot: '/managed/node/bin',
      npmGlobalModulesRoot: '/managed/node/lib/node_modules',
      npmCacheRoot: '/managed/node/npmCache',
      node: {
        status: 'available',
        executablePath: '/managed/node/bin/node',
        version: 'v24.0.0',
      },
      npm: {
        status: 'available',
        executablePath: '/managed/node/bin/npm',
        version: '10.9.2',
      },
    },
    packages,
    vendoredRuntimes: [],
    activeRuntimeActivation: null,
    mirrorSettings: {
      enabled: false,
      registryUrl: null,
    },
    activeOperation: null,
    generatedAt: '2026-04-26T00:00:00.000Z',
  };
}

describe('dependency readiness evaluation', () => {
  it('groups required, optional, and npm-installable Agent CLI packages from the managed catalog', () => {
    const summary = evaluateDependencyReadiness(createSnapshot({}), ['codex']);

    assert.deepEqual(
      summary.requiredPackages.map((item) => item.id),
      requiredManagedNpmPackages.map((item) => item.id),
    );
    assert.deepEqual(
      summary.optionalPackages.map((item) => item.id),
      optionalManagedNpmPackages.map((item) => item.id),
    );
    assert.deepEqual(
      summary.agentCliPackages.map((item) => item.id),
      npmInstallableAgentCliPackages.map((item) => item.id),
    );
  });

  it('blocks readiness when a required package is missing', () => {
    const summary = evaluateDependencyReadiness(createSnapshot({ openspec: 'not-installed' }), ['codex']);

    assert.equal(summary.requiredReady, false);
    assert.equal(summary.ready, false);
    assert.deepEqual(summary.missingRequiredPackageIds, ['openspec']);
    assert.deepEqual(summary.versionMismatchRequiredPackageIds, []);
    assert.equal(summary.blockingReasons.some((reason) => reason.code === 'required-packages-missing'), true);
  });

  it('keeps non-required PM2 version visibility without blocking readiness', () => {
    const summary = evaluateDependencyReadiness(createSnapshot({}, { pm2: '6.0.14' }), ['codex']);

    assert.equal(summary.requiredReady, true);
    assert.equal(summary.ready, true);
    assert.deepEqual(summary.missingRequiredPackageIds, []);
    assert.deepEqual(summary.versionMismatchRequiredPackageIds, []);
    assert.equal(summary.optionalPackages.some((item) => item.id === 'pm2' && item.versionSatisfied === false), true);
    assert.equal(summary.blockingReasons.some((reason) => reason.code === 'required-packages-missing'), false);
  });

  it('uses the snapshot definition when a managed package is configured to latest or dev', () => {
    const latestSnapshot = createSnapshot(
      {},
      { pm2: '9.9.9' },
      {
        pm2: {
          installSpec: 'pm2@latest',
          requiredVersionRange: undefined,
        },
      },
    );

    const latestSummary = evaluateDependencyReadiness(latestSnapshot, ['codex']);
    const latestPm2 = latestSummary.optionalPackages.find((item) => item.id === 'pm2');
    assert.equal(latestPm2?.installSpec, 'pm2@latest');
    assert.equal(latestPm2?.requiredVersionRange, null);
    assert.equal(latestPm2?.versionSatisfied, true);

    const devSnapshot = createSnapshot(
      {},
      { pm2: '7.0.1-dev.5' },
      {
        pm2: {
          installSpec: 'pm2@dev',
          requiredVersionRange: undefined,
        },
      },
    );

    const devSummary = evaluateDependencyReadiness(devSnapshot, ['codex']);
    const devPm2 = devSummary.optionalPackages.find((item) => item.id === 'pm2');
    assert.equal(devPm2?.installSpec, 'pm2@dev');
    assert.equal(devPm2?.requiredVersionRange, null);
    assert.equal(devPm2?.versionSatisfied, true);
  });

  it('treats catalog-pinned managed package versions as minimum supported versions', () => {
    const summary = evaluateDependencyReadiness(createSnapshot({}, { openspec: '1.3.1', pm2: '7.1.0' }), ['codex']);
    const openspec = summary.requiredPackages.find((item) => item.id === 'openspec');
    const pm2 = summary.optionalPackages.find((item) => item.id === 'pm2');

    assert.equal(openspec?.requiredVersionRange, '>=1.3.1');
    assert.equal(openspec?.versionSatisfied, true);
    assert.equal(pm2?.requiredVersionRange, '>=7.0.1');
    assert.equal(pm2?.versionSatisfied, true);
    assert.equal(summary.requiredReady, true);
  });

  it('still allows exact-version checks when a snapshot definition explicitly requires one', () => {
    const pm2Definition = managedNpmPackages.find((definition) => definition.id === 'pm2');
    if (!pm2Definition) {
      throw new Error('pm2 definition missing from managed catalog');
    }

    assert.equal(
      isManagedPackageVersionSatisfied(
        {
          ...pm2Definition,
          installSpec: 'pm2@7.0.1',
          requiredVersionRange: '7.0.1',
        },
        '7.0.0',
      ),
      false,
    );
  });

  it('keeps optional package status visible without blocking readiness', () => {
    const summary = evaluateDependencyReadiness(createSnapshot({}), ['codex']);

    assert.equal(summary.optionalPackages.every((item) => item.definition.required !== true), true);
    assert.equal(summary.requiredReady, true);
    assert.equal(summary.agentCliReady, true);
    assert.equal(summary.ready, true);
  });

  it('does not block base launch readiness when optional dependencies are missing', () => {
    const optionalPackageId = optionalManagedNpmPackages[0]?.id;

    if (!optionalPackageId) {
      assert.equal(evaluateDependencyReadiness(createSnapshot({}), ['codex']).optionalPackages.length, 0);
      return;
    }

    const summary = evaluateDependencyReadiness(createSnapshot({ [optionalPackageId]: 'not-installed' }), ['codex']);

    assert.equal(summary.requiredReady, true);
    assert.equal(summary.agentCliReady, true);
    assert.equal(summary.ready, true);
    assert.equal(summary.optionalPackages.some((item) => item.id === optionalPackageId && item.status === 'not-installed'), true);
  });


  it('ignores unknown Agent CLI ids and does not let them satisfy readiness', () => {
    const summary = evaluateDependencyReadiness(createSnapshot({}), ['unknown-cli']);

    assert.equal(summary.agentCliReady, false);
    assert.equal(summary.ready, false);
    assert.deepEqual(summary.selectedAgentCliPackageIds, []);
    assert.deepEqual(summary.ignoredSelectedAgentCliPackageIds, ['unknown-cli']);
    assert.equal(summary.blockingReasons.some((reason) => reason.code === 'agent-cli-not-selected'), true);
  });

  it('satisfies Agent CLI readiness when a selected supported Agent CLI is installed', () => {
    const summary = evaluateDependencyReadiness(createSnapshot({}), ['codex', 'claude-code']);

    assert.equal(summary.agentCliReady, true);
    assert.equal(summary.ready, true);
    assert.deepEqual(summary.selectedAgentCliPackageIds, ['codex', 'claude-code']);
    assert.deepEqual(summary.installedSelectedAgentCliPackageIds, ['codex', 'claude-code']);
  });

  it('blocks Agent CLI readiness when selected packages are supported but not installed', () => {
    const summary = evaluateDependencyReadiness(createSnapshot({ codex: 'not-installed' }), ['codex']);

    assert.equal(summary.agentCliReady, false);
    assert.equal(summary.ready, false);
    assert.deepEqual(summary.missingSelectedAgentCliPackageIds, ['codex']);
    assert.deepEqual(summary.versionMismatchSelectedAgentCliPackageIds, []);
    assert.equal(summary.blockingReasons.some((reason) => reason.code === 'agent-cli-not-installed'), true);
  });
});
