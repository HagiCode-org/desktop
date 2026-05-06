import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function parseVersion(raw) {
  const match = String(raw).match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map((value) => Number.parseInt(value, 10)) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }
  return 0;
}

function runHagiscriptVersion(command) {
  return spawnSync(command, ['--version'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
  });
}

function resolveDirectHagiscriptCommands() {
  if (process.platform === 'win32') {
    return ['hagiscript.cmd', 'hagiscript.exe', 'hagiscript'];
  }

  return ['hagiscript'];
}

function resolveFallbackHagiscriptCommand() {
  const prefixResult = spawnSync('npm', ['config', 'get', 'prefix'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
  });

  if (prefixResult.error || (prefixResult.status ?? 1) !== 0) {
    return null;
  }

  const prefix = String(prefixResult.stdout ?? '').trim();
  if (!prefix) {
    return null;
  }

  const candidates = process.platform === 'win32'
    ? [
        path.join(prefix, 'hagiscript.cmd'),
        path.join(prefix, 'hagiscript.exe'),
        path.join(prefix, 'hagiscript'),
      ]
    : [
        path.join(prefix, 'bin', 'hagiscript'),
        path.join(prefix, 'hagiscript'),
      ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function assertGlobalHagiscriptAvailable(minimumVersion = '0.1.7') {
  let result = null;
  for (const command of resolveDirectHagiscriptCommands()) {
    result = runHagiscriptVersion(command);
    if (!result.error || result.error.code !== 'ENOENT') {
      break;
    }
  }

  if (result?.error?.code === 'ENOENT') {
    const fallbackCommand = resolveFallbackHagiscriptCommand();
    if (fallbackCommand) {
      result = runHagiscriptVersion(fallbackCommand);
    }
  }

  if (result.error) {
    throw new Error(`Global hagiscript prerequisite is missing: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Global hagiscript prerequisite check failed: ${(result.stderr || result.stdout || '').trim() || 'unknown error'}`);
  }

  const actual = parseVersion(result.stdout || result.stderr || '');
  const required = parseVersion(minimumVersion);
  if (!actual || !required) {
    throw new Error('Global hagiscript prerequisite check could not determine a semantic version.');
  }

  if (compareVersions(actual, required) < 0) {
    throw new Error(`Global hagiscript ${minimumVersion}+ is required, but ${actual.join('.')} is installed.`);
  }

  return actual.join('.');
}
