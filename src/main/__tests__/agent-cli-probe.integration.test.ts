import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { SystemDiagnosticManager } from '../system-diagnostic-manager.js';
import { resolveManagedCliExecutablePath } from '../managed-cli-executable-resolver.js';
import { catalogCliIds, installCases } from '../../../scripts/agent-cli-probe/install-cases.mjs';
import { expectedDirectories, isInsideExpectedLocation } from '../../../scripts/agent-cli-probe/locations.mjs';
import {
  assertControl,
  assertSurfaceA,
  assertSurfaceB,
  shimCandidates,
  type CommandProbeLike,
  type ContractViolation,
} from './agent-cli-probe-contract.js';

// ---- Single adapter to the production probe (the only coupling point, design D3) ----

/** Runs the unmodified production probe with its default environment handling. */
export async function runProductionProbe(): Promise<CommandProbeLike[]> {
  const result = await new SystemDiagnosticManager().run();
  return result.data.agentCli.probes;
}

/** Runs the unmodified managed resolver against a static path that does not exist. */
export async function runManagedResolver(binName: string, platform: NodeJS.Platform, staticExecutablePath: string): Promise<string> {
  return resolveManagedCliExecutablePath({ binName, platform, staticExecutablePath });
}

function osNameOf(platform: NodeJS.Platform): 'linux' | 'macos' | 'windows' {
  return platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';
}

function npmGlobalBinOf(platform: NodeJS.Platform): string | null {
  try {
    const prefix = execFileSync('npm', ['prefix', '-g'], { encoding: 'utf8', shell: platform === 'win32' }).trim();
    return platform === 'win32' ? prefix : path.join(prefix, 'bin');
  } catch {
    return null;
  }
}

function brewBinOf(): string | null {
  try {
    return path.join(execFileSync('brew', ['--prefix'], { encoding: 'utf8' }).trim(), 'bin');
  } catch {
    return null;
  }
}

// ---- Unit tests for the pure contract (always run) ----

const linuxDirs = ['/home/runner/.local/bin'];

function probe(overrides: Partial<CommandProbeLike>): CommandProbeLike {
  return { cliType: 'claude-code', status: 'available', resolvedPath: '/home/runner/.local/bin/claude', version: '2.1.211', message: null, ...overrides };
}

describe('agent CLI probe contract: surface A', () => {
  it('passes a correct available result', () => {
    const violations = assertSurfaceA({
      cliId: 'claude-code', probe: probe({}), referenceVersion: '2.1.211', expectedDirectories: linuxDirs,
      platform: 'linux', otherProbes: [probe({ cliType: 'codex', status: 'missing', resolvedPath: null, version: null })], allowedPreinstalled: [],
    });
    assert.deepEqual(violations, []);
  });

  it('fails when the version was taken from error text', () => {
    const violations = assertSurfaceA({
      cliId: 'claude-code', probe: probe({ version: 'error: unable to open config' }), referenceVersion: '2.1.211',
      expectedDirectories: linuxDirs, platform: 'linux', otherProbes: [], allowedPreinstalled: [],
    });
    assert.deepEqual(violations.map((item) => item.kind), ['version-not-semver']);
  });

  it('fails when the version differs from the reference', () => {
    const violations = assertSurfaceA({
      cliId: 'claude-code', probe: probe({ version: '2.1.0' }), referenceVersion: '2.1.211',
      expectedDirectories: linuxDirs, platform: 'linux', otherProbes: [], allowedPreinstalled: [],
    });
    assert.deepEqual(violations.map((item) => item.kind), ['version-mismatch']);
  });

  it('fails with wrong-location and names both paths', () => {
    const violations: ContractViolation[] = assertSurfaceA({
      cliId: 'claude-code', probe: probe({ resolvedPath: '/usr/games/claude' }), referenceVersion: '2.1.211',
      expectedDirectories: linuxDirs, platform: 'linux', otherProbes: [], allowedPreinstalled: [],
    });
    assert.deepEqual(violations.map((item) => item.kind), ['wrong-location']);
    assert.match(violations[0].message, /\/usr\/games\/claude/);
    assert.match(violations[0].message, /\/home\/runner\/\.local\/bin/);
  });

  it('fails a false positive for another catalog CLI that the case did not install', () => {
    const violations = assertSurfaceA({
      cliId: 'claude-code', probe: probe({}), referenceVersion: '2.1.211', expectedDirectories: linuxDirs,
      platform: 'linux', otherProbes: [probe({ cliType: 'codex', status: 'available', resolvedPath: '/usr/bin/codex', version: '1.0.0' })],
      allowedPreinstalled: [],
    });
    assert.deepEqual(violations.map((item) => item.kind), ['false-positive']);
  });

  it('does not flag an allowlisted preinstalled CLI', () => {
    const violations = assertSurfaceA({
      cliId: 'claude-code', probe: probe({}), referenceVersion: '2.1.211', expectedDirectories: linuxDirs,
      platform: 'linux', otherProbes: [probe({ cliType: 'codex', status: 'available', resolvedPath: '/usr/bin/codex', version: '1.0.0' })],
      allowedPreinstalled: ['codex'],
    });
    assert.deepEqual(violations, []);
  });
});

describe('agent CLI probe contract: control phase', () => {
  it('expects missing before install', () => {
    assert.equal(assertControl({ cliId: 'codex', probe: probe({ cliType: 'codex', status: 'missing', resolvedPath: null, version: null }), allowedPreinstalled: [] }).outcome, 'missing');
  });

  it('records a preinstalled, allowlisted CLI as skipped', () => {
    assert.equal(assertControl({ cliId: 'codex', probe: probe({ cliType: 'codex' }), allowedPreinstalled: ['codex'] }).outcome, 'skipped');
  });

  it('flags a false positive before install', () => {
    assert.equal(assertControl({ cliId: 'codex', probe: probe({ cliType: 'codex' }), allowedPreinstalled: [] }).outcome, 'false-positive');
  });
});

describe('agent CLI probe contract: expected-location matcher', () => {
  it('matches $HOME and %USERPROFILE% expansions', () => {
    const dirs = expectedDirectories({ expectedLocation: { linux: ['$HOME/.local/bin'], windows: ['%USERPROFILE%/.local/bin'] } }, 'linux', { platform: 'linux', env: { HOME: '/home/runner' } });
    assert.deepEqual(dirs, ['/home/runner/.local/bin']);
    const winDirs = expectedDirectories({ expectedLocation: { windows: ['%USERPROFILE%/.local/bin'] } }, 'windows', { platform: 'win32', env: { USERPROFILE: 'C:\\Users\\R' } });
    assert.deepEqual(winDirs, ['c:/users/r/.local/bin']);
    assert.equal(isInsideExpectedLocation('C:\\Users\\R\\.local\\bin\\claude.exe', winDirs, 'win32'), true);
  });

  it('tolerates trailing and mixed separators', () => {
    assert.equal(isInsideExpectedLocation('/home/runner//.local/bin/claude', ['/home/runner/.local/bin/'], 'linux'), true);
  });

  it('matches the lexical path of a symlinked bin without realpath', () => {
    assert.equal(isInsideExpectedLocation('/usr/local/bin/claude', ['/usr/local/bin'], 'linux'), true);
    assert.equal(isInsideExpectedLocation('/opt/claude/bin/claude', ['/usr/local/bin'], 'linux'), false);
  });
});

describe('agent CLI probe contract: surface B', () => {
  it('passes the real shim on Windows when .cmd takes precedence', () => {
    const violations = assertSurfaceB({
      binName: 'claude', platform: 'win32', staticPath: 'C:/nonexistent/claude.cmd',
      resolvedPath: 'C:/Users/R/AppData/Roaming/npm/claude.cmd', existingNames: ['claude.cmd', 'claude.ps1', 'claude'],
      probeVersion: '2.1.211', referenceVersion: '2.1.211',
    });
    assert.deepEqual(violations, []);
  });

  it('fails when the static fallback is returned', () => {
    const violations = assertSurfaceB({
      binName: 'claude', platform: 'linux', staticPath: '/x/claude', resolvedPath: '/x/claude',
      existingNames: ['claude'], probeVersion: '2.1.211', referenceVersion: '2.1.211',
    });
    assert.deepEqual(violations.map((item) => item.kind), ['surface-b-fallback']);
  });

  it('fails when a higher-precedence shim exists but is not chosen', () => {
    const violations = assertSurfaceB({
      binName: 'claude', platform: 'win32', staticPath: 'C:/nonexistent/claude.cmd',
      resolvedPath: 'C:/npm/claude', existingNames: ['claude.cmd', 'claude'],
      probeVersion: '2.1.211', referenceVersion: '2.1.211',
    });
    assert.deepEqual(violations.map((item) => item.kind), ['surface-b-shim-order']);
  });

  it('lists Windows shim candidates in order and POSIX as the extensionless file only', () => {
    assert.deepEqual(shimCandidates('claude', 'win32'), ['claude.cmd', 'claude.ps1', 'claude']);
    assert.deepEqual(shimCandidates('claude', 'linux'), ['claude']);
  });
});

describe('agent CLI probe contract: registry', () => {
  it('has a probe surface and a location for every case', () => {
    for (const row of installCases) {
      assert.ok(catalogCliIds.includes(row.cliId), row.id);
      assert.ok(row.probeSurfaces.length > 0, row.id);
    }
  });
});

// ---- Gated integration run (skipped unless a case is selected) ----

const caseId = process.env.HAGICODE_AGENT_CLI_PROBE_CASE ?? '';
const phase = process.env.HAGICODE_AGENT_CLI_PROBE_PHASE ?? 'probe';
const statePath = process.env.HAGICODE_AGENT_CLI_PROBE_STATE
  ?? path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'agent-cli-probe', 'state.json');

function readState(): Record<string, unknown> {
  return existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
}

function writeState(patch: Record<string, unknown>): void {
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify({ ...readState(), ...patch }, null, 2)}\n`);
}

describe('agent CLI probe integration', { skip: caseId ? false : 'HAGICODE_AGENT_CLI_PROBE_CASE is not set' }, () => {
  it(`runs phase "${phase}" for ${caseId}`, async () => {
    const row = installCases.find((item) => item.id === caseId);
    assert.ok(row, `unknown case ${caseId}`);
    const platform = process.platform;
    const osName = osNameOf(platform);
    assert.ok(row.os.includes(osName), `${caseId} does not run on ${osName}`);

    if (phase === 'control') {
      const probes = await runProductionProbe();
      const own = probes.find((item) => item.cliType === row.cliId) ?? { cliType: row.cliId, status: 'absent', resolvedPath: null, version: null, message: null };
      const verdict = assertControl({ cliId: row.cliId, probe: own, allowedPreinstalled: row.runnerPreinstalled });
      writeState({ control: verdict });
      assert.ok(verdict.outcome === 'missing' || verdict.outcome === 'skipped', verdict.message);
      return;
    }

    const state = readState() as { oracle?: { version?: string } };
    const referenceVersion = state.oracle?.version;
    assert.ok(referenceVersion, 'oracle reference version missing from state; run the oracle step first');
    const context = { platform, env: process.env, npmGlobalBin: npmGlobalBinOf(platform), brewBin: brewBinOf() };
    const directories = expectedDirectories(row, osName, context);
    const probes = await runProductionProbe();
    const own = probes.find((item) => item.cliType === row.cliId);
    const violations: ContractViolation[] = assertSurfaceA({
      cliId: row.cliId, probe: own, referenceVersion, expectedDirectories: directories, platform,
      otherProbes: probes, allowedPreinstalled: row.runnerPreinstalled,
    });

    if (row.probeSurfaces.includes('B') && row.managedPackageId && row.install.kind === 'managed-npm') {
      const binName = own?.commandCandidates?.[0] ?? row.cliId;
      const staticPath = path.join(mkdtempSync(path.join(os.tmpdir(), 'probe-static-')), 'does-not-exist', binName);
      const resolved = await runManagedResolver(binName, platform, staticPath);
      const binDir = npmGlobalBinOf(platform);
      const existingNames = binDir && existsSync(binDir) ? readdirSync(binDir) : [];
      const probeB = resolved && existsSync(resolved) ? runVersionOf(resolved, platform) : null;
      violations.push(...assertSurfaceB({
        binName, platform, staticPath, resolvedPath: resolved, existingNames,
        probeVersion: probeB ? extractSemverOrNull(probeB) : null, referenceVersion,
      }));
      rmSync(path.dirname(path.dirname(staticPath)), { recursive: true, force: true });
    }

    writeState({
      probe: {
        ok: violations.length === 0,
        status: own?.status ?? 'absent',
        version: own?.version ?? null,
        resolvedPath: own?.resolvedPath ?? null,
        failures: violations,
      },
    });
    assert.deepEqual(violations, [], violations.map((item) => `${item.kind}: ${item.message}`).join('\n'));
  });
});

/** Runs the resolved executable with --version, using the oracle's per-platform spawn rules. */
function runVersionOf(file: string, platform: NodeJS.Platform): string | null {
  const invocation = platform === 'win32' && /\.cmd$/i.test(file)
    ? { command: 'cmd.exe', args: ['/d', '/s', '/c', `"${file}" --version`] }
    : platform === 'win32' && /\.ps1$/i.test(file)
      ? { command: 'powershell.exe', args: ['-NoProfile', '-File', file, '--version'] }
      : { command: file, args: ['--version'] };
  const result = spawnSync(invocation.command, invocation.args, { encoding: 'utf8', timeout: 60_000, windowsHide: true });
  return extractSemverOrNull(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
}

function extractSemverOrNull(output: string): string | null {
  const match = output.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/);
  return match ? match[0] : null;
}
