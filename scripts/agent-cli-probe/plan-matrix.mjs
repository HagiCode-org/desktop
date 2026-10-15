// Planner: filters the case registry and emits the GitHub Actions matrix.
// Usage: node scripts/agent-cli-probe/plan-matrix.mjs [--trigger <event>] [--tier core|extended|all]
//        [--os linux|macos|windows] [--cli <id>] [--strict] [--dry-run]
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installCases, exclusions, validateRegistry, RUNNER_IMAGES, OPERATING_SYSTEMS, catalogCliIds } from './install-cases.mjs';

/** Tiers selected for a trigger. Schedules run everything; PR and push run core only. */
export function resolveTiers({ trigger = 'pull_request', tier = '' } = {}) {
  if (trigger === 'schedule') return ['core', 'extended'];
  if (tier === 'all') return ['core', 'extended'];
  if (tier === 'core' || tier === 'extended') return [tier];
  return ['core'];
}

/** Strict mode: scheduled runs always, manual runs when requested. */
export function resolveStrict({ trigger = 'pull_request', strict = false } = {}) {
  return trigger === 'schedule' || strict === true || strict === 'true';
}

/**
 * Builds matrix entries: one per (case, supported OS) that matches every filter.
 * @returns {{entries: object[], strict: boolean, tiers: string[]}}
 */
export function planMatrix({ cases = installCases, trigger = 'pull_request', tier = '', os = '', cli = '', strict = false, validation = {} } = {}) {
  if (os && !OPERATING_SYSTEMS.includes(os)) throw new Error(`Unknown operating system filter "${os}"`);
  if (cli && !catalogCliIds.includes(cli)) throw new Error(`Unknown CLI filter "${cli}"`);

  const problems = validateRegistry({ cases, exclusionRows: exclusions, ...validation });
  if (problems.length > 0) {
    throw new Error(`Invalid agent CLI probe registry:\n- ${problems.join('\n- ')}`);
  }

  const tiers = resolveTiers({ trigger, tier });
  const strictRun = resolveStrict({ trigger, strict });
  const entries = [];

  for (const row of cases) {
    if (!tiers.includes(row.tier)) continue;
    if (cli && row.cliId !== cli) continue;
    for (const systemName of row.os) {
      if (os && systemName !== os) continue;
      entries.push({
        name: `${systemName} / ${row.cliId} / ${row.method}`,
        caseId: row.id,
        cliId: row.cliId,
        method: row.method,
        tier: row.tier,
        os: systemName,
        runner: RUNNER_IMAGES[systemName],
        container: row.container ?? '',
        strict: strictRun,
      });
    }
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));
  return { entries, strict: strictRun, tiers };
}

function parseArgs(argv) {
  const options = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') options.dryRun = true;
    else if (token === '--strict') options.strict = true;
    else if (token === '--trigger') options.trigger = argv[++index];
    else if (token === '--tier') options.tier = argv[++index];
    else if (token === '--os') options.os = argv[++index];
    else if (token === '--cli') options.cli = argv[++index];
    else throw new Error(`Unknown argument "${token}"`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const trigger = options.trigger || process.env.GITHUB_EVENT_NAME || 'pull_request';
  const plan = planMatrix({ ...options, trigger });
  const matrix = { include: plan.entries };
  const line = `matrix=${JSON.stringify(matrix)}`;

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
  }

  console.log(`Planned ${plan.entries.length} job(s) (tiers: ${plan.tiers.join(', ')}; strict: ${plan.strict})`);
  for (const entry of plan.entries) {
    console.log(`  ${entry.name}  [${entry.tier}] ${entry.runner}${entry.container ? ` container=${entry.container}` : ''}`);
  }
  if (options.dryRun) {
    console.log(line);
  }
  if (plan.entries.length === 0) {
    console.error('No case matched the requested filters.');
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
