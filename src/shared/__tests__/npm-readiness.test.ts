import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateNpmReadiness,
  managedNpmPackages,
  npmInstallableAgentCliPackages,
  optionalManagedNpmPackages,
  requiredManagedNpmPackages,
} from '../npm-managed-packages.js';
import type {
  ManagedNpmPackageId,
  ManagedNpmPackageStatus,
  ManagedNpmPackageStatusSnapshot,
  NpmManagementSnapshot,
} from '../../types/npm-management.js';

function createSnapshot(statusOverrides: Partial<Record<ManagedNpmPackageId, ManagedNpmPackageStatus>>): NpmManagementSnapshot {
  const packages: ManagedNpmPackageStatusSnapshot[] = managedNpmPackages.map((definition) => {
    const status = statusOverrides[definition.id] ?? 'installed';

    return {
      id: definition.id,
      definition,
      status,
      version: status === 'installed' ? '1.0.0' : null,
      packageRoot: `/managed/${definition.id}`,
      executablePath: status === 'installed' ? `/managed/bin/${definition.binName}` : null,
    };
  });

  return {
    environment: {
      available: true,
      toolchainRoot: '/managed',
      nodeRuntimeRoot: '/managed/node',
      npmGlobalPrefix: '/managed/npm-global',
      npmGlobalBinRoot: '/managed/npm-global/bin',
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
    mirrorSettings: {
      enabled: false,
      registryUrl: null,
    },
    activeOperation: null,
    generatedAt: '2026-04-26T00:00:00.000Z',
  };
}

describe('npm readiness evaluation', () => {
  it('groups required, optional, and npm-installable Agent CLI packages from the managed catalog', () => {
    const summary = evaluateNpmReadiness(createSnapshot({}), ['codex']);

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
    const summary = evaluateNpmReadiness(createSnapshot({ openspec: 'not-installed' }), ['codex']);

    assert.equal(summary.requiredReady, false);
    assert.equal(summary.ready, false);
    assert.deepEqual(summary.missingRequiredPackageIds, ['openspec']);
    assert.equal(summary.blockingReasons.some((reason) => reason.code === 'required-packages-missing'), true);
  });

  it('keeps optional package status visible without blocking readiness', () => {
    const summary = evaluateNpmReadiness(createSnapshot({}), ['codex']);

    assert.equal(summary.optionalPackages.every((item) => item.definition.required !== true), true);
    assert.equal(summary.requiredReady, true);
    assert.equal(summary.agentCliReady, true);
    assert.equal(summary.ready, true);
  });

  it('ignores unknown Agent CLI ids and does not let them satisfy readiness', () => {
    const summary = evaluateNpmReadiness(createSnapshot({}), ['unknown-cli']);

    assert.equal(summary.agentCliReady, false);
    assert.equal(summary.ready, false);
    assert.deepEqual(summary.selectedAgentCliPackageIds, []);
    assert.deepEqual(summary.ignoredSelectedAgentCliPackageIds, ['unknown-cli']);
    assert.equal(summary.blockingReasons.some((reason) => reason.code === 'agent-cli-not-selected'), true);
  });

  it('satisfies Agent CLI readiness when a selected supported Agent CLI is installed', () => {
    const summary = evaluateNpmReadiness(createSnapshot({}), ['codex', 'claude-code']);

    assert.equal(summary.agentCliReady, true);
    assert.equal(summary.ready, true);
    assert.deepEqual(summary.selectedAgentCliPackageIds, ['codex', 'claude-code']);
    assert.deepEqual(summary.installedSelectedAgentCliPackageIds, ['codex', 'claude-code']);
  });

  it('blocks Agent CLI readiness when selected packages are supported but not installed', () => {
    const summary = evaluateNpmReadiness(createSnapshot({ codex: 'not-installed' }), ['codex']);

    assert.equal(summary.agentCliReady, false);
    assert.equal(summary.ready, false);
    assert.deepEqual(summary.missingSelectedAgentCliPackageIds, ['codex']);
    assert.equal(summary.blockingReasons.some((reason) => reason.code === 'agent-cli-not-installed'), true);
  });
});
