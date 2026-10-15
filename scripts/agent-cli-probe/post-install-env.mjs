// Rebuilds the environment a freshly opened terminal would see after an install.
// Windows: only the persisted Machine and User Path values are used. Entries the install never persisted are not added.
// Linux and macOS: pass-through, because installers persist to shell startup files and the probe's login shell reads them.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MACHINE_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';
const USER_KEY = 'HKCU\\Environment';

function normalizeEntry(entry) {
  return entry.trim().replace(/[\\/]+$/, '');
}

/** Merges path lists, keeping the first occurrence. Comparison is case-insensitive on Windows. */
export function mergePathEntries(lists, platform) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const raw of list) {
      const entry = normalizeEntry(String(raw ?? ''));
      if (!entry) continue;
      const key = platform === 'win32' ? entry.toLowerCase() : entry;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(entry);
    }
  }
  return merged;
}

/** Splits a PATH value using the platform delimiter. */
export function splitPath(value, platform) {
  return String(value ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
}

/** Parses one `reg query ... /v Path` output and expands %VAR% references from env. */
export function parseRegPathValue(output, env = {}) {
  const line = String(output).split(/\r?\n/).find((item) => /^\s+Path\s+REG_(EXPAND_)?SZ\s+/i.test(item));
  if (!line) return null;
  const value = line.replace(/^\s+Path\s+REG_(EXPAND_)?SZ\s+/i, '').trimEnd();
  return value.replace(/%([^%]+)%/g, (match, name) => env[name] ?? env[name.toUpperCase()] ?? match);
}

/**
 * Builds the refreshed PATH. On Windows only persisted Machine and User entries are used.
 * On POSIX the base PATH is returned unchanged.
 */
export function buildRefreshedPath({ platform, basePath = '', machinePath = '', userPath = '' }) {
  if (platform !== 'win32') return basePath;
  return mergePathEntries([splitPath(machinePath, 'win32'), splitPath(userPath, 'win32')], 'win32').join(';');
}

function readRegistryPath(key, env) {
  try {
    const output = execFileSync('reg.exe', ['query', key, '/v', 'Path'], { encoding: 'utf8', windowsHide: true });
    return parseRegPathValue(output, env) ?? '';
  } catch {
    return '';
  }
}

function main() {
  const statePath = process.argv[2] ?? path.join(process.env.RUNNER_TEMP ?? '/tmp', 'agent-cli-probe', 'state.json');
  const platform = process.platform;
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const machinePath = platform === 'win32' ? readRegistryPath(MACHINE_KEY, process.env) : '';
  const userPath = platform === 'win32' ? readRegistryPath(USER_KEY, process.env) : '';
  const refreshed = buildRefreshedPath({
    platform,
    basePath: process.env.PATH ?? process.env.Path ?? '',
    machinePath,
    userPath,
  });
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify({ ...state, refreshedPath: refreshed }, null, 2)}\n`);
  // The refreshed PATH is stored in state and applied inside the probe test process.
  // It is not exported through GITHUB_ENV, because on Windows that creates a second PATH key next to `Path`.
  console.log(`env refresh: ${platform === 'win32' ? 'persisted Machine+User PATH merged' : 'pass-through'} (${splitPath(refreshed, platform).length} entries)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
