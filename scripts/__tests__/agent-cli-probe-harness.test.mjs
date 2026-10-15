import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { installCases, exclusions, validateRegistry, catalogCliIds, documentedMethods } from '../agent-cli-probe/install-cases.mjs';
import { planMatrix, resolveTiers, resolveStrict } from '../agent-cli-probe/plan-matrix.mjs';
import { isInstallAllowed, minimalInstallEnv, buildInstallPlan, runWithRetries, BACKOFF_MS, MAX_ATTEMPTS } from '../agent-cli-probe/install-cli.mjs';
import { buildSpawnArgs, locateBinary, verifyInstalledCli } from '../agent-cli-probe/verify-installed-cli.mjs';
import { mergePathEntries, buildRefreshedPath, parseRegPathValue } from '../agent-cli-probe/post-install-env.mjs';
import { classify, reachedProbe, evaluateCaseGate, evaluateGate, buildResult, renderStepSummary } from '../agent-cli-probe/classify-result.mjs';
import { renderGrid, renderReport, loadResults } from '../agent-cli-probe/report.mjs';
import { expandExpectedLocation, isInsideExpectedLocation, extractSemver } from '../agent-cli-probe/locations.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const docPath = path.join(repoRoot, 'docs', 'agent-cli-probe-integration-tests.md');

function temp(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agent-cli-probe-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe('registry', () => {
  it('is valid as shipped', () => {
    assert.deepEqual(validateRegistry({ cases: installCases, exclusionRows: exclusions, catalogIds: catalogCliIds, managedPackageIds: [] }), []);
  });

  it('rejects a duplicate case id, an unknown OS and an unknown CLI id', () => {
    const base = installCases[0];
    const problems = validateRegistry({
      cases: [base, { ...base, os: ['plan9'] }, { ...installCases[1], id: base.id, cliId: 'not-a-cli' }],
      exclusionRows: [],
      catalogIds: catalogCliIds,
    });
    assert.ok(problems.some((item) => item.includes('duplicate case id')), problems.join('\n'));
    assert.ok(problems.some((item) => item.includes('unknown operating system "plan9"')), problems.join('\n'));
    assert.ok(problems.some((item) => item.includes('unknown CLI id "not-a-cli"')), problems.join('\n'));
  });

  it('rejects an exclusion without a reason and a knownIssue without a tracker', () => {
    const base = installCases[0];
    const problems = validateRegistry({
      cases: [{ ...base, knownIssue: { reason: 'x' } }],
      exclusionRows: [{ cliId: 'codex', method: 'm', reason: '' }],
      catalogIds: catalogCliIds,
    });
    assert.ok(problems.some((item) => item.includes('knownIssue needs reason and trackedBy')));
    assert.ok(problems.some((item) => item.includes('reason is required')));
  });

  it('keeps Windows WinGet cases out of the matrix while the runner image lacks WinGet', () => {
    assert.equal(installCases.some((item) => item.method === 'winget'), false);
    assert.ok(exclusions.some((item) => item.method === 'winget' && item.cliId === 'claude-code'));
  });

  it('documents every multi-method CLI method', () => {
    for (const [cliId, methods] of Object.entries(documentedMethods)) {
      for (const method of methods) {
        const covered = installCases.some((item) => item.cliId === cliId && item.method === method)
          || exclusions.some((item) => item.cliId === cliId && item.method === method);
        assert.ok(covered, `${cliId}/${method} is neither a case nor an exclusion`);
      }
    }
  });
});

describe('planner', () => {
  it('tier selection per trigger', () => {
    assert.deepEqual(resolveTiers({ trigger: 'pull_request' }), ['core']);
    assert.deepEqual(resolveTiers({ trigger: 'push' }), ['core']);
    assert.deepEqual(resolveTiers({ trigger: 'schedule' }), ['core', 'extended']);
    assert.deepEqual(resolveTiers({ trigger: 'workflow_dispatch', tier: 'all' }), ['core', 'extended']);
    assert.deepEqual(resolveTiers({ trigger: 'workflow_dispatch', tier: '' }), ['core']);
    assert.equal(resolveStrict({ trigger: 'schedule' }), true);
    assert.equal(resolveStrict({ trigger: 'workflow_dispatch', strict: 'true' }), true);
    assert.equal(resolveStrict({ trigger: 'pull_request' }), false);
  });

  it('a pull request runs core cases only and never an extended case', () => {
    const { entries } = planMatrix({ trigger: 'pull_request' });
    assert.ok(entries.length > 0);
    assert.ok(entries.every((entry) => entry.tier === 'core'));
  });

  it('a schedule runs both tiers in strict mode', () => {
    const plan = planMatrix({ trigger: 'schedule' });
    assert.equal(plan.strict, true);
    assert.ok(plan.entries.some((entry) => entry.tier === 'extended'));
  });

  it('each filter alone and combined narrows the matrix', () => {
    const all = planMatrix({ trigger: 'workflow_dispatch', tier: 'all' }).entries;
    const linux = planMatrix({ trigger: 'workflow_dispatch', tier: 'all', os: 'linux' }).entries;
    const claude = planMatrix({ trigger: 'workflow_dispatch', tier: 'all', cli: 'claude-code' }).entries;
    const both = planMatrix({ trigger: 'workflow_dispatch', tier: 'all', os: 'linux', cli: 'claude-code' }).entries;
    assert.ok(linux.length < all.length);
    assert.ok(claude.length < all.length);
    assert.ok(both.length < linux.length && both.length < claude.length);
    assert.ok(linux.every((entry) => entry.os === 'linux'));
    assert.ok(both.every((entry) => entry.os === 'linux' && entry.cliId === 'claude-code'));
  });

  it('schedules a method only on the operating systems it supports, with OS, CLI and method in the job name', () => {
    const entries = planMatrix({ trigger: 'workflow_dispatch', tier: 'all', cli: 'claude-code' }).entries;
    const homebrew = entries.filter((entry) => entry.method === 'homebrew-cask');
    assert.deepEqual(homebrew.map((entry) => entry.os), ['macos']);
    assert.equal(homebrew[0].name, 'macos / claude-code / homebrew-cask');
    assert.equal(entries.some((entry) => entry.method === 'native-powershell' && entry.os !== 'windows'), false);
  });

  it('exits with an error for an invalid registry before any job is planned', () => {
    const bad = [{ ...installCases[0], id: installCases[0].id, cliId: 'unknown-cli' }];
    assert.throws(() => planMatrix({ cases: bad }), /unknown CLI id/);
  });

  it('rejects unknown filters', () => {
    assert.throws(() => planMatrix({ os: 'plan9' }), /Unknown operating system filter/);
    assert.throws(() => planMatrix({ cli: 'nope' }), /Unknown CLI filter/);
  });
});

describe('installer step', () => {
  it('is refused without the CI or local opt-in', () => {
    assert.equal(isInstallAllowed({}), false);
    assert.equal(isInstallAllowed({ GITHUB_ACTIONS: 'true' }), true);
    assert.equal(isInstallAllowed({ HAGICODE_AGENT_CLI_PROBE_ALLOW_INSTALL: '1' }), true);
  });

  it('passes no secrets into the installer environment', () => {
    const env = minimalInstallEnv({ PATH: '/bin', HOME: '/h', GITHUB_TOKEN: 'secret', NPM_TOKEN: 'secret', AWS_SECRET_ACCESS_KEY: 'x' });
    assert.deepEqual(Object.keys(env).sort(), ['HOME', 'PATH']);
  });

  it('retries with 15 s and 45 s back-off and records the attempt count', async () => {
    const sleeps = [];
    const calls = [];
    const outcome = await runWithRetries({
      plan: { argv: ['x'] },
      run: async () => { calls.push(1); return { exitCode: 1, stderrTail: 'boom' }; },
      sleep: async (ms) => { sleeps.push(ms); },
      timeoutMs: 1000,
    });
    assert.equal(outcome.succeeded, false);
    assert.equal(outcome.attempts, MAX_ATTEMPTS);
    assert.equal(calls.length, MAX_ATTEMPTS);
    assert.deepEqual(sleeps, [15_000, 45_000]);
    assert.deepEqual(BACKOFF_MS, [15_000, 45_000]);
    assert.equal(outcome.stderrTail, 'boom');
  });

  it('stops retrying after a success', async () => {
    let count = 0;
    const outcome = await runWithRetries({
      plan: { argv: ['x'] },
      run: async () => { count += 1; return { exitCode: count < 2 ? 1 : 0 }; },
      sleep: async () => {},
    });
    assert.equal(outcome.succeeded, true);
    assert.equal(outcome.attempts, 2);
  });

  it('builds the managed npm command with fetch retry flags, using the injected definition', () => {
    const plan = buildInstallPlan(
      { id: 'x/npm', install: { kind: 'managed-npm' }, managedPackageId: 'pi' },
      { platform: 'linux', managedPackages: [{ id: 'pi' }], buildInstallArgs: () => ['install', '-g', '--ignore-scripts', 'pi@0.78.1'] },
    );
    assert.equal(plan.argv[0], 'npm');
    assert.ok(plan.argv.includes('--fetch-retries=3'));
    assert.ok(plan.argv.includes('--fetch-retry-mintimeout=5000'));
    assert.ok(plan.display.includes('--ignore-scripts'));
  });

  it('chooses the shell per install kind', () => {
    const shell = buildInstallPlan({ id: 'a', install: { kind: 'shell', command: 'echo hi' }, managedPackageId: null }, { platform: 'linux', managedPackages: [] });
    assert.deepEqual(shell.argv, ['/bin/sh', '-c', 'echo hi']);
    const cmd = buildInstallPlan({ id: 'b', install: { kind: 'cmd', command: 'dir' }, managedPackageId: null }, { platform: 'win32', managedPackages: [] });
    assert.deepEqual(cmd.argv.slice(0, 3), ['cmd.exe', '/d', '/s']);
  });
});

describe('oracle', () => {
  it('builds per-platform spawn rules for every shim type', () => {
    assert.deepEqual(buildSpawnArgs({ platform: 'win32', filePath: 'C:\\npm\\claude.cmd', args: ['--version'] }).command, 'cmd.exe');
    assert.equal(buildSpawnArgs({ platform: 'win32', filePath: 'C:\\npm\\claude.ps1', args: ['--version'] }).command, 'powershell.exe');
    assert.deepEqual(buildSpawnArgs({ platform: 'win32', filePath: 'C:\\npm\\claude.exe', args: ['--version'] }), { command: 'C:\\npm\\claude.exe', args: ['--version'] });
    assert.deepEqual(buildSpawnArgs({ platform: 'linux', filePath: '/usr/bin/claude', args: ['--version'] }), { command: '/usr/bin/claude', args: ['--version'] });
  });

  it('locates the binary in expected directories before PATH', (t) => {
    const dir = temp(t);
    mkdirSync(path.join(dir, 'exp'));
    writeFileSync(path.join(dir, 'exp', 'claude'), '');
    writeFileSync(path.join(dir, 'claude'), '');
    assert.equal(locateBinary({ binName: 'claude', directories: [path.join(dir, 'exp')], pathEntries: [dir], platform: 'linux' }), path.join(dir, 'exp', 'claude'));
    assert.equal(locateBinary({ binName: 'missing', directories: [dir], pathEntries: [], platform: 'linux' }), null);
  });

  it('captures a reference version from a runnable CLI and reports unusable ones', async () => {
    const ok = await verifyInstalledCli({ binPath: '/x/claude', platform: 'linux', run: async () => ({ exitCode: 0, stdout: 'claude 2.1.211\n', stderr: '' }) });
    assert.deepEqual([ok.ok, ok.version], [true, '2.1.211']);
    const bad = await verifyInstalledCli({ binPath: '/x/claude', platform: 'linux', run: async () => ({ exitCode: 127, stdout: '', stderr: 'not found' }) });
    assert.equal(bad.ok, false);
    const missing = await verifyInstalledCli({ binPath: null, platform: 'linux', run: async () => ({ exitCode: 0, stdout: '1.0.0', stderr: '' }) });
    assert.equal(missing.reason, 'binary missing');
  });
});

describe('post-install environment', () => {
  it('merges persisted Machine and User PATH without duplicates, case-insensitively on Windows', () => {
    const merged = mergePathEntries([['C:\\Windows', 'C:\\Tools\\'], ['c:\\windows', 'C:\\Users\\R\\bin']], 'win32');
    assert.deepEqual(merged, ['C:\\Windows', 'C:\\Tools', 'C:\\Users\\R\\bin']);
  });

  it('uses only persisted entries on Windows and passes POSIX PATH through', () => {
    assert.equal(buildRefreshedPath({ platform: 'win32', basePath: 'D:\\unpersisted', machinePath: 'C:\\A', userPath: 'C:\\B' }), 'C:\\A;C:\\B');
    assert.equal(buildRefreshedPath({ platform: 'linux', basePath: '/a:/b', machinePath: '', userPath: '' }), '/a:/b');
  });

  it('parses a reg query Path line and expands %VARS%', () => {
    const output = '\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_EXPAND_SZ    %USERPROFILE%\\.local\\bin;C:\\Tools\r\n';
    assert.equal(parseRegPathValue(output, { USERPROFILE: 'C:\\Users\\R' }), 'C:\\Users\\R\\.local\\bin;C:\\Tools');
  });
});

describe('classifier truth table', () => {
  const known = { reason: 'upstream bug', trackedBy: 'ISSUE-1' };
  const cases = [
    // [steps, probe, knownIssue, expectedClass, expectedPhase]
    [{ control: 'success', install: 'success', oracle: 'success', probe: 'success' }, { ok: true }, null, 'pass', null],
    [{ control: 'success', install: 'success', oracle: 'success', probe: 'success' }, { ok: true }, known, 'pass', null],
    [{ control: 'success', install: 'success', oracle: 'success', probe: 'failure' }, { ok: false, failures: [{ kind: 'version-mismatch' }] }, null, 'probe-defect', 'probe'],
    [{ control: 'success', install: 'success', oracle: 'success', probe: 'failure' }, { ok: false, failures: [{ kind: 'wrong-location' }] }, known, 'xfail', 'probe'],
    [{ control: 'success', install: 'failure', oracle: '', probe: '' }, null, null, 'env-failure', 'install'],
    [{ control: 'success', install: 'failure', oracle: '', probe: '' }, null, known, 'env-failure', 'install'],
    [{ control: 'success', install: 'success', oracle: 'failure', probe: '' }, null, null, 'env-failure', 'oracle'],
    [{ control: 'success', install: 'success', oracle: 'failure', probe: '' }, null, known, 'env-failure', 'oracle'],
    [{ control: 'failure', install: '', oracle: '', probe: '' }, null, null, 'probe-defect', 'control'],
    [{ control: 'failure', install: '', oracle: '', probe: '' }, null, known, 'probe-defect', 'control'],
    [{ control: 'skipped', install: 'success', oracle: 'success', probe: 'success' }, { ok: true }, null, 'pass', null],
    [{ control: 'success', install: 'cancelled', oracle: '', probe: '' }, null, null, 'env-failure', 'install'],
  ];

  for (const [steps, probe, knownIssue, expectedClass, expectedPhase] of cases) {
    it(`${JSON.stringify(steps)} with knownIssue=${knownIssue ? 'set' : 'null'} -> ${expectedClass}`, () => {
      const verdict = classify({ steps, probe, knownIssue });
      assert.equal(verdict.class, expectedClass);
      assert.equal(verdict.failingPhase, expectedPhase);
    });
  }

  it('never converts install, oracle or control failures to xfail, even with knownIssue', () => {
    for (const steps of [
      { control: 'success', install: 'failure', oracle: '', probe: '' },
      { control: 'success', install: 'success', oracle: 'failure', probe: '' },
      { control: 'failure', install: '', oracle: '', probe: '' },
    ]) {
      assert.notEqual(classify({ steps, knownIssue: known }).class, 'xfail');
    }
  });

  it('emits a notice when a knownIssue case passes', () => {
    const verdict = classify({ steps: { control: 'success', install: 'success', oracle: 'success', probe: 'success' }, probe: { ok: true }, knownIssue: known });
    assert.equal(verdict.notices.length, 1);
    assert.match(verdict.notices[0], /ISSUE-1/);
  });

  it('reachedProbe is true only when the probe step produced a verdict', () => {
    assert.equal(reachedProbe({ probe: 'success' }), true);
    assert.equal(reachedProbe({ probe: 'failure' }), true);
    assert.equal(reachedProbe({ install: 'failure' }), false);
  });
});

describe('result.json and summary', () => {
  const row = installCases.find((item) => item.id === 'claude-code/native-sh');
  const steps = { control: 'success', install: 'success', oracle: 'success', probe: 'success' };
  const verdict = classify({ steps, probe: { ok: true }, knownIssue: null });
  const result = buildResult({
    row, osName: 'linux', arch: 'x64', runner: 'ubuntu-latest', steps,
    probe: { version: '2.1.211' }, attempts: 1, referenceVersion: '2.1.211', verdict, resolvedPath: '/home/runner/.local/bin/claude',
  });

  it('writes the documented result fields', () => {
    for (const key of ['schemaVersion', 'caseId', 'cliId', 'method', 'os', 'arch', 'runner', 'class', 'subtype', 'failingPhase', 'attempts', 'referenceVersion', 'probeVersion', 'resolvedPath', 'steps']) {
      assert.ok(key in result, key);
    }
    assert.equal(result.class, 'pass');
    assert.equal(result.probeVersion, '2.1.211');
  });

  it('renders the step summary with the class and failing phase', () => {
    const summary = renderStepSummary(result);
    assert.match(summary, /\*\*pass\*\*/);
    assert.match(summary, /Reference version \| 2\.1\.211/);
    assert.match(summary, /Failing phase \| -/);
    const defect = buildResult({ row, osName: 'linux', arch: 'x64', runner: 'ubuntu-latest', steps, probe: { version: '9' }, attempts: 1, referenceVersion: '2.1.211', verdict: { class: 'probe-defect', subtype: 'version-mismatch', failingPhase: 'probe', notices: [] } });
    assert.match(renderStepSummary(defect), /\*\*probe-defect\*\* \/ version-mismatch/);
    const envFail = buildResult({ row, osName: 'linux', arch: 'x64', runner: 'ubuntu-latest', steps: { install: 'failure' }, probe: null, attempts: 3, referenceVersion: null, verdict: { class: 'env-failure', subtype: 'install-failed', failingPhase: 'install', notices: [] } });
    assert.match(renderStepSummary(envFail), /\*\*env-failure\*\* \/ install-failed/);
    assert.match(renderStepSummary(envFail), /Install attempts \| 3/);
  });
});

describe('gate', () => {
  const pass = { class: 'pass', reachedProbe: true, os: 'linux', cliId: 'a', method: 'm', subtype: null, failingPhase: null };
  const defect = { ...pass, os: 'macos', class: 'probe-defect', subtype: 'wrong-location', failingPhase: 'probe' };
  const envFail = { ...pass, os: 'windows', class: 'env-failure', subtype: 'install-failed', reachedProbe: false, failingPhase: 'install' };

  it('PR policy: env-failure warns but does not block', () => {
    const gate = evaluateGate([pass, envFail], { strict: false });
    assert.equal(gate.failed, false);
    assert.equal(gate.warnings.length, 1);
  });

  it('strict policy: env-failure blocks', () => {
    assert.equal(evaluateGate([pass, envFail], { strict: true }).failed, true);
  });

  it('probe-defect blocks in both policies', () => {
    assert.equal(evaluateGate([pass, defect], { strict: false }).failed, true);
    assert.equal(evaluateGate([pass, defect], { strict: true }).failed, true);
  });

  it('fails when no case reached the probe, even in non-strict mode', () => {
    const gate = evaluateGate([envFail], { strict: false });
    assert.equal(gate.failed, true);
    assert.ok(gate.reasons.some((reason) => reason.includes('no case reached the probe step')));
  });

  it('fails on empty input', () => {
    assert.equal(evaluateGate([], { strict: false }).failed, true);
  });

  it('one OS failing while the others pass still reports every result', () => {
    const results = [pass, defect, { ...pass, os: 'windows' }];
    const report = renderReport(results, evaluateGate(results, { strict: false }));
    assert.match(report, /FAIL/);
    assert.match(report, /pass/);
  });

  it('per-case gate blocks probe-defect, and env-failure only in strict mode', () => {
    assert.equal(evaluateCaseGate({ class: 'probe-defect', subtype: 'x', failingPhase: 'probe' }).failed, true);
    assert.equal(evaluateCaseGate({ class: 'env-failure', subtype: 'install-failed' }, { strict: false }).failed, false);
    assert.equal(evaluateCaseGate({ class: 'env-failure', subtype: 'install-failed' }, { strict: true }).failed, true);
    assert.equal(evaluateCaseGate({ class: 'xfail' }).failed, false);
  });
});

describe('consolidated report', () => {
  it('renders OS columns with class symbols and separates xfail', (t) => {
    const dir = temp(t);
    writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ schemaVersion: 1, class: 'pass', cliId: 'claude-code', method: 'npm', os: 'linux', reachedProbe: true }));
    writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ schemaVersion: 1, class: 'xfail', cliId: 'claude-code', method: 'npm', os: 'macos', reachedProbe: true, knownIssue: { reason: 'r', trackedBy: 't' } }));
    writeFileSync(path.join(dir, 'state.json'), '{}');
    const results = loadResults(dir);
    assert.equal(results.length, 2);
    const grid = renderGrid(results);
    assert.match(grid, /\| claude-code \| npm \| pass \| xfail \| -- \|/);
    assert.match(renderReport(results, evaluateGate(results)), /Known issues \(xfail\)/);
  });
});

describe('locations', () => {
  it('expands tokens and matches lexically', () => {
    assert.equal(expandExpectedLocation('$HOME/.local/bin', { platform: 'linux', env: { HOME: '/home/r' } }), '/home/r/.local/bin');
    assert.equal(expandExpectedLocation('%USERPROFILE%/x', { platform: 'win32', env: {} }), null);
    assert.equal(isInsideExpectedLocation('/usr/local/bin/codex', ['/usr/local/bin'], 'linux'), true);
    assert.equal(isInsideExpectedLocation('/usr/local/binx/codex', ['/usr/local/bin'], 'linux'), false);
    assert.equal(extractSemver('codex-cli 0.44.0'), '0.44.0');
  });
});

describe('documentation', () => {
  const doc = readFileSync(docPath, 'utf8');

  it('its result-class table names exactly the classes the classifier uses', () => {
    const tableRows = doc.split('\n').filter((line) => /^\|\s*`[a-z-]+`\s*\|/.test(line));
    const classes = tableRows.map((line) => line.match(/`([a-z-]+)`/)[1]);
    for (const cls of ['pass', 'probe-defect', 'env-failure', 'skipped', 'xfail']) {
      assert.ok(classes.includes(cls), `class ${cls} missing from taxonomy table`);
    }
  });

  it('its example registry row passes registry validation', () => {
    const match = doc.match(/```js agent-cli-probe-example\n([\s\S]*?)```/);
    assert.ok(match, 'example block missing');
    const row = new Function(`return (${match[1].trim()});`)();
    assert.deepEqual(validateRegistry({ cases: [row], exclusionRows: [], catalogIds: [...catalogCliIds, 'example-cli'], managedPackageIds: ['example-cli'] }), []);
  });

  it('documents the workflow trigger and input names', () => {
    const workflow = readFileSync(path.join(repoRoot, '.github', 'workflows', 'agent-cli-probe-integration.yml'), 'utf8');
    for (const input of ['tier', 'os', 'cli', 'strict']) {
      assert.match(workflow, new RegExp(`\\n {6}${input}:`));
      assert.match(doc, new RegExp(`\`${input}\``));
    }
  });
});
