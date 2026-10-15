// Consolidated report: merges per-case result.json files into one OS x CLI x method grid and applies the run gate.
// Usage: node scripts/agent-cli-probe/report.mjs --input <dir> [--strict] [--out <file>]
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateGate } from './classify-result.mjs';
import { OPERATING_SYSTEMS } from './install-cases.mjs';

const SYMBOL = Object.freeze({
  pass: 'pass',
  'probe-defect': 'FAIL',
  'env-failure': 'warn(env)',
  skipped: 'skip',
  xfail: 'xfail',
});

export function collectResultFiles(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...collectResultFiles(full));
    else if (entry.endsWith('.json') && entry !== 'state.json') files.push(full);
  }
  return files.sort();
}

export function loadResults(dir) {
  return collectResultFiles(dir)
    .map((file) => JSON.parse(readFileSync(file, 'utf8')))
    .filter((item) => item && item.schemaVersion === 1 && item.class);
}

/** Grid of OS columns and CLI/method rows. Cells not in the run are shown as "--". */
export function renderGrid(results) {
  const rows = new Map();
  for (const item of results) {
    const key = `${item.cliId} | ${item.method}`;
    if (!rows.has(key)) rows.set(key, {});
    rows.get(key)[item.os] = SYMBOL[item.class] ?? item.class;
  }
  const header = `| CLI / method | ${OPERATING_SYSTEMS.join(' | ')} |`;
  const divider = `| --- | ${OPERATING_SYSTEMS.map(() => '---').join(' | ')} |`;
  const body = [...rows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, cells]) => {
    const columns = OPERATING_SYSTEMS.map((os) => cells[os] ?? '--');
    return `| ${key} | ${columns.join(' | ')} |`;
  });
  return [header, divider, ...body].join('\n');
}

export function renderReport(results, gate) {
  const counts = Object.fromEntries(['pass', 'probe-defect', 'env-failure', 'skipped', 'xfail'].map((name) => [name, 0]));
  for (const item of results) counts[item.class] = (counts[item.class] ?? 0) + 1;
  const lines = [
    '## Agent CLI probe: consolidated report',
    '',
    `Cases: ${results.length}. ${Object.entries(counts).map(([name, count]) => `${name}: ${count}`).join(', ')}.`,
    '',
    renderGrid(results),
    '',
    '`FAIL` = probe-defect, `warn(env)` = env-failure, `skip` and `xfail` are shown separately from passes, `--` = not scheduled.',
    '',
  ];
  if (gate.reasons.length > 0) lines.push('### Blocking', ...gate.reasons.map((reason) => `- ${reason}`), '');
  if (gate.warnings.length > 0) lines.push('### Warnings (not blocking)', ...gate.warnings.map((warning) => `- ${warning}`), '');
  const xfails = results.filter((item) => item.class === 'xfail');
  if (xfails.length > 0) {
    lines.push('### Known issues (xfail)', ...xfails.map((item) => `- ${item.cliId} / ${item.method} on ${item.os}: ${item.knownIssue?.reason ?? ''}`), '');
  }
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const options = { input: null, strict: false, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--input') options.input = argv[++index];
    else if (token === '--strict') options.strict = true;
    else if (token === '--out') options.out = argv[++index];
    else throw new Error(`Unknown argument "${token}"`);
  }
  if (!options.input) throw new Error('--input is required');
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const results = loadResults(options.input);
  const gate = evaluateGate(results, { strict: options.strict });
  const report = renderReport(results, gate);
  if (options.out) writeFileSync(options.out, report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
  for (const warning of gate.warnings) console.log(`::warning title=agent-cli-probe::${warning}`);
  if (gate.failed) {
    for (const reason of gate.reasons) console.log(`::error title=agent-cli-probe::${reason}`);
    process.exitCode = 1;
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
