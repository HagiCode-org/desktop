import { spawnSync } from 'node:child_process';

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

export function assertGlobalHagiscriptAvailable(minimumVersion = '0.1.7') {
  const result = spawnSync('hagiscript', ['--version'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
  });

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
