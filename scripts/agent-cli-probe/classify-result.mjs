// Maps step outcomes to one result class per case, writes result.json and the step summary,
// and applies the per-case gate. The class follows the phase in which the case stopped, never error text.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installCases, RESULT_CLASSES } from './install-cases.mjs';

const FAILED = new Set(['failure', 'cancelled']);
const OK = new Set(['success']);

/**
 * @param {object} input
 * @param {{control?: string, install?: string, oracle?: string, probe?: string}} input.steps GitHub step outcomes
 * @param {{ok: boolean, failures?: {kind: string, message: string}[]}} [input.probe] probe assertion result
 * @param {{reason: string, trackedBy: string}|null} [input.knownIssue]
 * @returns {{class: string, subtype: string|null, failingPhase: string|null, notices: string[], hint?: string}}
 */
export function classify({ steps = {}, probe = null, knownIssue = null }) {
  const notices = [];

  if (FAILED.has(steps.control)) {
    return { class: 'probe-defect', subtype: 'false-positive-before-install', failingPhase: 'control', notices };
  }
  if (FAILED.has(steps.install)) {
    return { class: 'env-failure', subtype: 'install-failed', failingPhase: 'install', notices };
  }
  if (FAILED.has(steps.oracle)) {
    return { class: 'env-failure', subtype: 'install-unusable', failingPhase: 'oracle', notices };
  }
  if (FAILED.has(steps.probe) || (probe && probe.ok === false)) {
    const subtype = probe?.failures?.[0]?.kind ?? 'contract';
    if (knownIssue) {
      return { class: 'xfail', subtype, failingPhase: 'probe', notices };
    }
    return { class: 'probe-defect', subtype, failingPhase: 'probe', notices };
  }
  if (OK.has(steps.probe) && (probe === null || probe.ok === true)) {
    if (knownIssue) {
      notices.push(`knownIssue can be removed: ${knownIssue.trackedBy} (${knownIssue.reason})`);
    }
    return { class: 'pass', subtype: null, failingPhase: null, notices };
  }
  return { class: 'skipped', subtype: 'probe-not-run', failingPhase: null, notices };
}

/** True when the probe step actually ran to a verdict. */
export function reachedProbe(steps = {}) {
  return OK.has(steps.probe) || FAILED.has(steps.probe);
}

/**
 * Per-case gate. Blocks on probe-defect, and on env-failure in strict mode.
 * @returns {{failed: boolean, reason: string|null}}
 */
export function evaluateCaseGate(result, { strict = false } = {}) {
  if (result.class === 'probe-defect') return { failed: true, reason: `probe-defect (${result.subtype ?? 'contract'}) in ${result.failingPhase}` };
  if (result.class === 'env-failure' && strict) return { failed: true, reason: `env-failure (${result.subtype}) in strict mode` };
  return { failed: false, reason: null };
}

/**
 * Run-level gate over every collected result. Fails on empty input, on zero results that reached the probe,
 * on any probe-defect, and on env-failure in strict mode. Warnings are returned for non-blocking env-failures.
 */
export function evaluateGate(results, { strict = false } = {}) {
  const reasons = [];
  const warnings = [];
  if (results.length === 0) {
    reasons.push('no case results were provided');
    return { failed: true, reasons, warnings };
  }
  if (!results.some((item) => item.reachedProbe)) {
    reasons.push('no case reached the probe step');
  }
  for (const item of results) {
    const label = `${item.os} / ${item.cliId} / ${item.method}`;
    if (item.class === 'probe-defect') {
      reasons.push(`${label}: probe-defect (${item.subtype ?? 'contract'}) in ${item.failingPhase}`);
    } else if (item.class === 'env-failure') {
      const message = `${label}: env-failure (${item.subtype})`;
      if (strict) reasons.push(`${message} in strict mode`);
      else warnings.push(message);
    }
  }
  return { failed: reasons.length > 0, reasons, warnings };
}

/** Builds the machine-readable result for one case job. */
export function buildResult({ row, osName, arch, runner, steps, probe, attempts, referenceVersion, verdict, resolvedPath, hint = null }) {
  const cls = verdict.class;
  if (!RESULT_CLASSES.includes(cls)) throw new Error(`Unknown result class ${cls}`);
  return {
    schemaVersion: 1,
    caseId: row.id,
    cliId: row.cliId,
    method: row.method,
    tier: row.tier,
    os: osName,
    arch,
    runner,
    class: cls,
    subtype: verdict.subtype,
    failingPhase: verdict.failingPhase,
    attempts,
    referenceVersion: referenceVersion ?? null,
    probeVersion: probe?.version ?? null,
    resolvedPath: resolvedPath ?? probe?.resolvedPath ?? null,
    expectedLocation: row.expectedLocation?.[osName] ?? [],
    reachedProbe: reachedProbe(steps),
    steps: { control: steps.control ?? '', install: steps.install ?? '', oracle: steps.oracle ?? '', probe: steps.probe ?? '' },
    knownIssue: row.knownIssue ?? null,
    notices: verdict.notices,
    hint,
    verifiedOn: row.verifiedOn,
    source: row.source,
  };
}

/** Markdown step summary for one case. */
export function renderStepSummary(result) {
  const lines = [
    `### Agent CLI probe: ${result.cliId} / ${result.method}`,
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| OS / architecture | ${result.os} (${result.arch}), runner ${result.runner} |`,
    `| CLI / method | ${result.cliId} / ${result.method} |`,
    `| Reference version | ${result.referenceVersion ?? '-'} |`,
    `| Probe version | ${result.probeVersion ?? '-'} |`,
    `| Resolved path | ${result.resolvedPath ?? '-'} |`,
    `| Result class | **${result.class}**${result.subtype ? ` / ${result.subtype}` : ''} |`,
    `| Failing phase | ${result.failingPhase ?? '-'} |`,
    `| Install attempts | ${result.attempts ?? '-'} |`,
  ];
  if (result.hint) lines.push(`| Network hint | ${result.hint} |`);
  if (result.knownIssue) lines.push(`| Known issue | ${result.knownIssue.reason} (${result.knownIssue.trackedBy}) |`);
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const options = { caseId: null, outDir: null, strict: false, gate: false, state: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--case') options.caseId = argv[++index];
    else if (token === '--out') options.outDir = argv[++index];
    else if (token === '--state') options.state = argv[++index];
    else if (token === '--strict') options.strict = true;
    else if (token === '--gate') options.gate = true;
    else throw new Error(`Unknown argument "${token}"`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const row = installCases.find((item) => item.id === options.caseId);
  if (!row) throw new Error(`Unknown case id "${options.caseId}"`);
  const stateFile = options.state ?? path.join(process.env.RUNNER_TEMP ?? '/tmp', 'agent-cli-probe', 'state.json');
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
  const platform = process.platform;
  const osName = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';

  const steps = {
    control: process.env.STEP_CONTROL_OUTCOME ?? '',
    install: process.env.STEP_INSTALL_OUTCOME ?? '',
    oracle: process.env.STEP_ORACLE_OUTCOME ?? '',
    probe: process.env.STEP_PROBE_OUTCOME ?? '',
  };
  const verdict = classify({ steps, probe: state.probe ?? null, knownIssue: row.knownIssue });
  const result = buildResult({
    row,
    osName,
    arch: process.arch,
    runner: process.env.RUNNER_OS ? `${process.env.RUNNER_OS}/${process.env.RUNNER_ARCH ?? process.arch}` : `${osName}/${process.arch}`,
    steps,
    probe: state.probe ?? null,
    attempts: state.install?.attempts ?? null,
    referenceVersion: state.oracle?.version ?? null,
    resolvedPath: state.probe?.resolvedPath ?? null,
    verdict,
    hint: state.install?.hint ?? null,
  });

  const outDir = options.outDir ?? path.join(process.env.RUNNER_TEMP ?? '/tmp', 'agent-cli-probe', 'results');
  const safeName = row.id.replace(/[^A-Za-z0-9._-]+/g, '__');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, `${safeName}.json`), `${JSON.stringify(result, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderStepSummary(result));

  for (const notice of result.notices) console.log(`::notice title=knownIssue::${notice}`);
  console.log(`class ${result.class}${result.subtype ? ` / ${result.subtype}` : ''} (${row.id})`);

  if (options.gate) {
    const gate = evaluateCaseGate(result, { strict: options.strict });
    if (gate.failed) {
      console.error(`::error title=agent-cli-probe::${gate.reason}`);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
