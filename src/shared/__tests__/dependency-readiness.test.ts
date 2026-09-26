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

  it('treats catalog-pinned managed package versions as minimum supported versions', () => {
    const summary = evaluateDependencyReadiness(createSnapshot({}, { openspec: '1.3.1' }), ['codex']);
    const openspec = summary.requiredPackages.find((item) => item.id === 'openspec');

    assert.equal(openspec?.requiredVersionRange, '1.3.1');
    assert.equal(openspec?.versionSatisfied, true);
    assert.equal(summary.requiredReady, true);
  });

  it('still allows exact-version checks when a snapshot definition explicitly requires one', () => {
    const openspecDefinition = managedNpmPackages.find((definition) => definition.id === 'openspec');
    if (!openspecDefinition) {
      throw new Error('openspec definition missing from managed catalog');
    }

    assert.equal(
      isManagedPackageVersionSatisfied(
        {
          ...openspecDefinition,
          installSpec: '@fission-ai/openspec@1.3.1',
          requiredVersionRange: '1.3.1',
        },
        '1.3.0',
      ),
      false,
    );
  });

  it('does not require PM2 for dependency readiness', () => {
    const summary = evaluateDependencyReadiness(createSnapshot({}), ['codex']);

    assert.equal(summary.optionalPackages.every((item) => item.definition.required !== true), true);
    assert.equal(managedNpmPackages.some((item) => item.id === 'pm2'), false);
    assert.equal(summary.requiredPackages.some((item) => item.packageName === 'pm2'), false);
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

  it('treats Oh My Pi as an Agent CLI', () => {
    const summary = evaluateDependencyReadiness(createSnapshot({
      'oh-my-pi': 'not-installed',
    }), ['oh-my-pi']);

    assert.equal(summary.agentCliReady, false);
    assert.equal(summary.ready, false);
    assert.deepEqual(summary.missingSelectedAgentCliPackageIds, ['oh-my-pi']);
    assert.equal(summary.blockingReasons.some((reason) => reason.code === 'agent-cli-not-installed'), true);
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
