// Installer step: runs one case's install method with retries, a per-case timeout and a
// CI-only execution guard. Managed npm and external installers are derived from the product
// definitions in src/shared/npm-managed-packages.ts (loaded lazily, so unit tests run under plain node).
// Usage: node scripts/agent-cli-probe/install-cli.mjs --case <id> [--dry-run] [--state <file>]
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installCases } from './install-cases.mjs';

export const MAX_ATTEMPTS = 3;
export const BACKOFF_MS = Object.freeze([15_000, 45_000]);
export const NPM_FETCH_RETRY_FLAGS = Object.freeze(['--fetch-retries=3', '--fetch-retry-mintimeout=5000']);
const KILL_GRACE_MS = 30_000;

/** Installs only run on hosted CI or after an explicit local opt-in. */
export function isInstallAllowed(env = process.env) {
  return env.GITHUB_ACTIONS === 'true' || env.HAGICODE_AGENT_CLI_PROBE_ALLOW_INSTALL === '1';
}

const PASSTHROUGH_ENV = new Set([
  'PATH', 'Path', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR',
  'LANG', 'LC_ALL', 'TERM', 'PATHEXT', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'ProgramData',
  'USER', 'USERNAME', 'SHELL', 'RUNNER_TEMP', 'COMSPEC', 'ComSpec', 'NODE_OPTIONS',
  // Install location and cache only. Registry auth settings are never passed.
  'NPM_CONFIG_PREFIX', 'npm_config_prefix', 'NPM_CONFIG_CACHE', 'npm_config_cache',
  // Windows installers branch on these (for example the 32-bit check in install.cmd).
  'PROCESSOR_ARCHITECTURE', 'PROCESSOR_ARCHITEW6432', 'PROCESSOR_IDENTIFIER', 'PROCESSOR_LEVEL',
  'PROCESSOR_REVISION', 'NUMBER_OF_PROCESSORS', 'OS', 'COMPUTERNAME', 'USERDOMAIN', 'SystemDrive',
  'windir', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'CommonProgramFiles', 'PSModulePath',
  'HOMEDRIVE', 'HOMEPATH',
]);

/** Installer environment: an allowlist only, so no token or repository secret is inherited. */
export function minimalInstallEnv(env = process.env) {
  const result = {};
  for (const [key, value] of Object.entries(env)) {
    if (PASSTHROUGH_ENV.has(key) && typeof value === 'string') result[key] = value;
  }
  return result;
}

/**
 * Builds the command for one case. Managed npm packages use the product's own install args.
 * @param {object} row registry row
 * @param {{platform: string, managedPackages: object[], buildInstallArgs: Function}} context
 */
export function buildInstallPlan(row, { platform, managedPackages = [], buildInstallArgs }) {
  const kind = row.install.kind;
  if (kind === 'managed-npm' || kind === 'managed-external') {
    const definition = managedPackages.find((item) => item.id === row.managedPackageId);
    if (!definition) throw new Error(`${row.id}: managed package "${row.managedPackageId}" not found`);
    if (kind === 'managed-npm') {
      const args = [...buildInstallArgs(definition), ...NPM_FETCH_RETRY_FLAGS];
      const display = `npm ${args.join(' ')}`;
      // npm is npm.cmd on Windows, which spawn cannot start directly.
      if (platform === 'win32') return { kind, argv: ['cmd.exe', '/d', '/s', '/c', display], display };
      return { kind, argv: ['npm', ...args], display };
    }
    const installer = definition.externalCli?.installers?.[platform];
    if (!installer) throw new Error(`${row.id}: no external installer for ${platform}`);
    const argv = [installer.command, ...installer.args];
    return { kind, argv, display: argv.join(' ') };
  }

  const command = row.install.command;
  if (kind === 'shell') {
    return { kind, argv: ['/bin/sh', '-c', command], display: command };
  }
  if (kind === 'powershell') {
    const argv = ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command];
    return { kind, argv, display: command };
  }
  if (kind === 'cmd') {
    return { kind, argv: ['cmd.exe', '/d', '/s', '/c', command], display: command };
  }
  throw new Error(`${row.id}: unsupported install kind "${kind}"`);
}

/**
 * Runs an install plan with bounded retries. `run` and `sleep` are injected for tests.
 * @returns {Promise<{attempts: number, succeeded: boolean, exitCode: number|null, stderrTail: string}>}
 */
export async function runWithRetries({ plan, run, sleep, maxAttempts = MAX_ATTEMPTS, backoffMs = BACKOFF_MS, timeoutMs }) {
  let last = { exitCode: null, stderrTail: '' };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await run(plan, { timeoutMs });
    if (last.exitCode === 0) {
      return { attempts: attempt, succeeded: true, exitCode: 0, stderrTail: last.stderrTail ?? '' };
    }
    if (attempt < maxAttempts) {
      await sleep(backoffMs[Math.min(attempt - 1, backoffMs.length - 1)]);
    }
  }
  return { attempts: maxAttempts, succeeded: false, exitCode: last.exitCode, stderrTail: last.stderrTail ?? '' };
}

function tail(text, lines = 20) {
  return String(text ?? '').split(/\r?\n/).filter(Boolean).slice(-lines).join('\n');
}

/** Real executor: spawns the planned command with the minimal environment and kills it on timeout. */
export function spawnPlan(plan, { env, timeoutMs, cwd }) {
  return new Promise((resolve) => {
    const [command, ...args] = plan.argv;
    const child = spawn(command, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS).unref();
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stderrTail: tail(`${stderr}\n${error.message}`) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: timedOut ? null : code, stderrTail: tail(stderr) });
    });
  });
}

function readState(file) {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function writeStatePatch(file, patch) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...readState(file), ...patch }, null, 2)}\n`);
}

function npmGlobalBinFor(platform, env) {
  try {
    const prefix = execFileSync('npm', ['prefix', '-g'], { encoding: 'utf8', env, shell: platform === 'win32' }).trim();
    return platform === 'win32' ? prefix : path.join(prefix, 'bin');
  } catch {
    return null;
  }
}

/** Homebrew is not on the minimal PATH, so the known prefixes are tried directly. */
const BREW_BINARIES = ['/home/linuxbrew/.linuxbrew/bin/brew', '/opt/homebrew/bin/brew', '/usr/local/bin/brew'];

function brewBinFor(env) {
  const brew = BREW_BINARIES.find((candidate) => existsSync(candidate));
  if (!brew) return null;
  try {
    return path.join(execFileSync(brew, ['--prefix'], { encoding: 'utf8', env }).trim(), 'bin');
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const options = { dryRun: false, state: null, caseId: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') options.dryRun = true;
    else if (token === '--case') options.caseId = argv[++index];
    else if (token === '--state') options.state = argv[++index];
    else throw new Error(`Unknown argument "${token}"`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const row = installCases.find((item) => item.id === options.caseId);
  if (!row) throw new Error(`Unknown case id "${options.caseId}"`);

  const platform = process.platform;
  const osName = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';
  if (!row.os.includes(osName)) throw new Error(`${row.id} does not run on ${osName}`);

  const managed = await import('../../src/shared/npm-managed-packages.ts');
  const plan = buildInstallPlan(row, {
    platform,
    managedPackages: managed.managedNpmPackages,
    buildInstallArgs: (definition) => managed.getManagedPackageInstallArgs(definition),
  });

  if (options.dryRun) {
    console.log(`[dry-run] ${row.id} (${plan.kind}): ${plan.display}`);
    console.log('[dry-run] nothing was executed');
    return;
  }
  if (!isInstallAllowed()) {
    console.error('Refusing to run an installer: set GITHUB_ACTIONS=true or HAGICODE_AGENT_CLI_PROBE_ALLOW_INSTALL=1 (or use --dry-run).');
    process.exitCode = 2;
    return;
  }

  const env = minimalInstallEnv(process.env);
  const statePath = options.state ?? path.join(process.env.RUNNER_TEMP ?? '/tmp', 'agent-cli-probe', 'state.json');
  const catalog = await import('../../src/shared/agent-cli-catalog.ts');
  const catalogEntry = catalog.desktopAgentCliCatalog.find((item) => item.id === row.cliId);
  const managedDefinition = managed.managedNpmPackages.find((item) => item.id === row.managedPackageId);
  const binName = managedDefinition?.binName ?? catalogEntry?.commandName ?? row.cliId;
  const outcome = await runWithRetries({
    plan,
    timeoutMs: row.timeoutMinutes * 60_000,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    run: (planToRun, { timeoutMs }) => spawnPlan(planToRun, { env, timeoutMs, cwd: process.cwd() }),
  });
  writeStatePatch(statePath, {
    caseId: row.id,
    binName,
    npmGlobalBin: npmGlobalBinFor(platform, env),
    brewBin: brewBinFor(env),
    install: { attempts: outcome.attempts, succeeded: outcome.succeeded, exitCode: outcome.exitCode, stderrTail: outcome.stderrTail, display: plan.display },
  });
  console.log(`install ${row.id}: ${outcome.succeeded ? 'ok' : 'failed'} after ${outcome.attempts} attempt(s)`);
  if (!outcome.succeeded) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
