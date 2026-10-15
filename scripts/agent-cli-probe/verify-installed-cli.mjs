// Oracle: runs the installed CLI directly to capture its reference version.
// It imports no probe code (SystemDiagnosticManager or the managed resolver), by design.
// Usage: node scripts/agent-cli-probe/verify-installed-cli.mjs --case <id> [--state <file>]
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installCases } from './install-cases.mjs';
import { expectedDirectories, executableNamesFor, extractSemver } from './locations.mjs';

/** Spawn rules: .cmd via cmd.exe, .ps1 via PowerShell, everything else direct. */
export function buildSpawnArgs({ platform, filePath, args = [] }) {
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(filePath)) {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', [`"${filePath}"`, ...args].join(' ')] };
  }
  if (platform === 'win32' && /\.ps1$/i.test(filePath)) {
    return { command: 'powershell.exe', args: ['-NoProfile', '-File', filePath, ...args] };
  }
  return { command: filePath, args };
}

/** Finds the binary in the expected directories first, then on PATH. Returns the first existing candidate. */
export function locateBinary({ binName, directories, pathEntries = [], platform, exists = existsSync }) {
  const names = executableNamesFor(binName, platform);
  for (const directory of [...directories, ...pathEntries]) {
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Runs `<bin> --version` directly. `run` is injected: it receives {command, args} and resolves {exitCode, stdout, stderr}.
 * @returns {Promise<{ok: boolean, version: string|null, reason: string}>}
 */
export async function verifyInstalledCli({ binPath, platform, run, versionArgs = ['--version'] }) {
  if (!binPath) return { ok: false, version: null, reason: 'binary missing' };
  const spawnArgs = buildSpawnArgs({ platform, filePath: binPath, args: versionArgs });
  let result;
  try {
    result = await run(spawnArgs);
  } catch (error) {
    return { ok: false, version: null, reason: `spawn failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (result.exitCode !== 0) {
    return { ok: false, version: null, reason: `exit code ${result.exitCode}` };
  }
  const version = extractSemver(result.stdout || result.stderr);
  if (!version) {
    return { ok: false, version: null, reason: 'no semver-shaped version in output' };
  }
  return { ok: true, version, reason: 'ok' };
}

function runDirect({ command, args }) {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', timeout: 60_000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ exitCode: typeof error.code === 'number' ? error.code : 1, stdout: String(stdout ?? ''), stderr: String(stderr ?? error.message) });
        return;
      }
      resolve({ exitCode: 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function npmGlobalBinNow(platform) {
  try {
    const prefix = execFileSync('npm', ['prefix', '-g'], { encoding: 'utf8', shell: platform === 'win32' }).trim();
    return platform === 'win32' ? prefix : path.join(prefix, 'bin');
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const options = { caseId: null, state: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--case') options.caseId = argv[++index];
    else if (argv[index] === '--state') options.state = argv[++index];
    else throw new Error(`Unknown argument "${argv[index]}"`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const row = installCases.find((item) => item.id === options.caseId);
  if (!row) throw new Error(`Unknown case id "${options.caseId}"`);
  const platform = process.platform;
  const osName = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';
  const statePath = options.state ?? path.join(process.env.RUNNER_TEMP ?? '/tmp', 'agent-cli-probe', 'state.json');
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const binName = state.binName ?? row.cliId;
  const npmGlobalBin = state.npmGlobalBin ?? npmGlobalBinNow(platform);

  const directories = expectedDirectories(row, osName, {
    platform,
    env: process.env,
    npmGlobalBin,
    brewBin: state.brewBin ?? null,
  });
  const pathEntries = (process.env.PATH ?? process.env.Path ?? '').split(path.delimiter).filter(Boolean);
  const binPath = locateBinary({ binName, directories, pathEntries, platform });
  const verdict = await verifyInstalledCli({ binPath, platform, run: runDirect });

  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify({ ...state, oracle: { binPath, ...verdict } }, null, 2)}\n`);
  console.log(`oracle ${row.id}: ${verdict.ok ? `ok ${verdict.version} at ${binPath}` : `unusable (${verdict.reason})`}`);
  if (!verdict.ok) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
