import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { desktopAgentCliCatalog } from '../../shared/agent-cli-catalog.js';
import { managedNpmPackages, buildManagedPackageGlobalInstallCommand } from '../../shared/npm-managed-packages.js';
import { catalogCliIds, documentedMethods, exclusions, installCases } from '../../../scripts/agent-cli-probe/install-cases.mjs';
import { buildInstallPlan } from '../../../scripts/agent-cli-probe/install-cli.mjs';
import { getManagedPackageInstallArgs } from '../../shared/npm-managed-packages.js';

interface CoverageCase { id: string; cliId: string; method: string; managedPackageId: string | null }
interface CoverageExclusion { cliId: string; method: string; reason: string }
interface ManagedPackageLike { id: string; agentCliId?: string; category: string; externalCli?: unknown }

export interface CoverageInput {
  catalogIds: readonly string[];
  registryCatalogIds: readonly string[];
  managedAgentPackages: readonly ManagedPackageLike[];
  cases: readonly CoverageCase[];
  exclusions: readonly CoverageExclusion[];
  documentedMethods: Readonly<Record<string, readonly string[]>>;
}

/**
 * Coverage guard. Returns one message per gap; an empty array means the registry is complete.
 * Every gap message names the CLI, package or method it concerns.
 */
export function findCoverageGaps(input: CoverageInput): string[] {
  const gaps: string[] = [];
  const covered = (cliId: string, method: string) =>
    input.cases.some((item) => item.cliId === cliId && item.method === method)
    || input.exclusions.some((item) => item.cliId === cliId && item.method === method);

  for (const id of input.catalogIds) {
    if (!input.registryCatalogIds.includes(id)) gaps.push(`catalog CLI "${id}" is missing from the registry catalog list`);
    const hasCase = input.cases.some((item) => item.cliId === id);
    const hasExclusion = input.exclusions.some((item) => item.cliId === id);
    if (!hasCase && !hasExclusion) gaps.push(`catalog CLI "${id}" has neither a case nor an exclusion`);
  }
  for (const id of input.registryCatalogIds) {
    if (!input.catalogIds.includes(id)) gaps.push(`registry lists "${id}", which is not in the catalog`);
  }

  for (const pkg of input.managedAgentPackages) {
    if (!pkg.agentCliId && !pkg.externalCli) continue;
    const hasCase = input.cases.some((item) => item.managedPackageId === pkg.id);
    if (!hasCase) gaps.push(`managed agent-cli package "${pkg.id}" has no case`);
  }

  for (const [cliId, methods] of Object.entries(input.documentedMethods)) {
    for (const method of methods) {
      if (!covered(cliId, method)) gaps.push(`documented method ${cliId}/${method} has neither a case nor an exclusion`);
    }
  }

  for (const item of input.exclusions) {
    if (!item.reason || item.reason.trim().length === 0) gaps.push(`exclusion ${item.cliId}/${item.method} has an empty reason`);
  }
  return gaps;
}

function realInput(): CoverageInput {
  return {
    catalogIds: desktopAgentCliCatalog.map((item) => item.id),
    registryCatalogIds: catalogCliIds,
    managedAgentPackages: managedNpmPackages.filter((item) => item.category === 'agent-cli' || Boolean(item.externalCli)),
    cases: installCases,
    exclusions,
    documentedMethods,
  };
}

describe('agent CLI probe coverage guard', () => {
  it('covers every catalog CLI, managed agent package and documented method in the real registry', () => {
    assert.deepEqual(findCoverageGaps(realInput()), []);
  });

  it('names a catalog CLI that has neither a case nor an exclusion', () => {
    const input = realInput();
    const gaps = findCoverageGaps({ ...input, catalogIds: [...input.catalogIds, 'new-cli'], registryCatalogIds: [...input.registryCatalogIds, 'new-cli'] });
    assert.ok(gaps.some((message) => message.includes('"new-cli"') && message.includes('neither a case nor an exclusion')), gaps.join('\n'));
  });

  it('fails when a managed agent npm package has no case', () => {
    const input = realInput();
    const gaps = findCoverageGaps({
      ...input,
      managedAgentPackages: [...input.managedAgentPackages, { id: 'fixture-agent', agentCliId: 'codex', category: 'agent-cli' }],
    });
    assert.ok(gaps.some((message) => message.includes('"fixture-agent"')), gaps.join('\n'));
  });

  it('fails when a documented Claude Code method is neither a case nor an exclusion', () => {
    const input = realInput();
    const gaps = findCoverageGaps({
      ...input,
      documentedMethods: { ...input.documentedMethods, 'claude-code': [...input.documentedMethods['claude-code'], 'snap'] },
    });
    assert.ok(gaps.some((message) => message.includes('claude-code/snap')), gaps.join('\n'));
  });

  it('fails when an exclusion has an empty reason', () => {
    const input = realInput();
    const gaps = findCoverageGaps({ ...input, exclusions: [...input.exclusions, { cliId: 'codex', method: 'x', reason: '  ' }] });
    assert.ok(gaps.some((message) => message.includes('codex/x') && message.includes('empty reason')), gaps.join('\n'));
  });
});

describe('agent CLI probe install commands follow the product definition', () => {
  it('derives the pi npm command from the package definition, with its pin and --ignore-scripts', () => {
    const row = installCases.find((item) => item.id === 'pi/npm');
    assert.ok(row);
    const plan = buildInstallPlan(row, {
      platform: 'linux',
      managedPackages: managedNpmPackages,
      buildInstallArgs: (definition) => getManagedPackageInstallArgs(definition),
    });
    assert.match(plan.display, /@earendil-works\/pi-coding-agent@0\.78\.1/);
    assert.match(plan.display, /--ignore-scripts/);
    const pi = managedNpmPackages.find((item) => item.id === 'pi');
    assert.ok(pi);
    assert.equal(buildManagedPackageGlobalInstallCommand(pi).includes('--ignore-scripts'), true);
  });

  it('takes the Oh My Pi installer from externalCli.installers', () => {
    const row = installCases.find((item) => item.id === 'oh-my-pi/external-installer');
    assert.ok(row);
    const plan = buildInstallPlan(row, {
      platform: 'win32',
      managedPackages: managedNpmPackages,
      buildInstallArgs: (definition) => getManagedPackageInstallArgs(definition),
    });
    assert.equal(plan.argv[0], 'powershell.exe');
    assert.match(plan.display, /omp\.sh\/install\.ps1/);
  });
});
