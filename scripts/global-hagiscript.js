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
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);

  return spawnSync(command, ['--version'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: useShell,
  });
}

function useShellForCommand(command) {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
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

function resolveInstalledHagiscript(minimumVersion = '0.1.8') {
  let result = null;
  let resolvedCommand = null;
  for (const command of resolveDirectHagiscriptCommands()) {
    result = runHagiscriptVersion(command);
    if (!result.error || result.error.code !== 'ENOENT') {
      resolvedCommand = command;
      break;
    }
  }

  if (result?.error?.code === 'ENOENT') {
    const fallbackCommand = resolveFallbackHagiscriptCommand();
    if (fallbackCommand) {
      result = runHagiscriptVersion(fallbackCommand);
      resolvedCommand = fallbackCommand;
    }
  }

  if (!resolvedCommand) {
    resolvedCommand = process.platform === 'win32' ? 'hagiscript.cmd' : 'hagiscript';
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

  return {
    command: resolvedCommand,
    version: actual.join('.'),
  };
}

function resolveGlobalNodeModulesRoot() {
  const npmRootResult = spawnSync('npm', ['root', '-g'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
  });

  if (npmRootResult.error) {
    throw new Error(`Failed to resolve global npm root for hagiscript: ${npmRootResult.error.message}`);
  }
  if ((npmRootResult.status ?? 1) !== 0) {
    throw new Error(`Failed to resolve global npm root for hagiscript: ${(npmRootResult.stderr || npmRootResult.stdout || '').trim() || 'unknown error'}`);
  }

  const npmRoot = String(npmRootResult.stdout ?? '').trim();
  if (!npmRoot) {
    throw new Error('Global npm root for hagiscript is empty.');
  }

  return npmRoot;
}

export function resolveGlobalHagiscriptCommand(minimumVersion = '0.1.8') {
  return resolveInstalledHagiscript(minimumVersion).command;
}

export function resolveGlobalHagiscriptPackageRoot(minimumVersion = '0.1.8') {
  resolveInstalledHagiscript(minimumVersion);
  const packageRoot = path.join(resolveGlobalNodeModulesRoot(), '@hagicode', 'hagiscript');
  if (!fs.existsSync(packageRoot)) {
    throw new Error(`Global hagiscript package root was not found: ${packageRoot}`);
  }
  return packageRoot;
}

export function getHagiscriptSpawnOptions(command) {
  return {
    shell: useShellForCommand(command),
  };
}

export function assertGlobalHagiscriptAvailable(minimumVersion = '0.1.8') {
  return resolveInstalledHagiscript(minimumVersion).version;
}
