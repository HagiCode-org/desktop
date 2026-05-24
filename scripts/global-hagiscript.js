import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HAGISCRIPT_VERSION_ENV = 'HAGICODE_HAGISCRIPT_VERSION';
const HAGISCRIPT_COMMAND_ENV = 'HAGICODE_HAGISCRIPT_COMMAND';
const HAGISCRIPT_PACKAGE_ROOT_ENV = 'HAGICODE_HAGISCRIPT_PACKAGE_ROOT';
const hagiscriptModuleCache = new Map();

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

function resolveDirectNpmCommands() {
  if (process.platform === 'win32') {
    return ['npm.cmd', 'npm.exe', 'npm'];
  }

  return ['npm'];
}

function runNpmCommand(args) {
  let lastResult = null;

  for (const command of resolveDirectNpmCommands()) {
    const result = spawnSync(command, args, {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      shell: useShellForCommand(command),
    });

    lastResult = result;
    if (!result.error || result.error.code !== 'ENOENT') {
      return result;
    }
  }

  return lastResult;
}

function resolveDirectHagiscriptCommands() {
  if (process.platform === 'win32') {
    return ['hagiscript.cmd', 'hagiscript.exe', 'hagiscript'];
  }

  return ['hagiscript'];
}

function resolveFallbackHagiscriptCommand() {
  const prefixResult = runNpmCommand(['config', 'get', 'prefix']);

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

function resolveEnvProvidedHagiscript(minimumVersion) {
  const version = process.env[HAGISCRIPT_VERSION_ENV]?.trim();
  const command = process.env[HAGISCRIPT_COMMAND_ENV]?.trim() || null;
  const packageRoot = process.env[HAGISCRIPT_PACKAGE_ROOT_ENV]?.trim() || null;

  if (!version) {
    return null;
  }

  const actual = parseVersion(version);
  const required = parseVersion(minimumVersion);
  if (!actual || !required) {
    throw new Error('hagiscript prerequisite check could not determine a semantic version from environment.');
  }
  if (compareVersions(actual, required) < 0) {
    throw new Error(`hagiscript ${minimumVersion}+ is required, but ${version} was provided by environment.`);
  }

  if (packageRoot && !fs.existsSync(packageRoot)) {
    throw new Error(`Environment-provided hagiscript package root was not found: ${packageRoot}`);
  }

  return {
    command: command || (process.platform === 'win32' ? 'hagiscript.cmd' : 'hagiscript'),
    version,
    scope: 'environment',
    packageRoot,
  };
}

function resolveInstalledHagiscript(minimumVersion = '0.1.8') {
  const envProvided = resolveEnvProvidedHagiscript(minimumVersion);
  if (envProvided) {
    return envProvided;
  }

  let result = null;
  let resolvedCommand = null;
  let resolvedScope = 'global';

  for (const command of resolveDirectHagiscriptCommands()) {
    result = runHagiscriptVersion(command);
    if (!result.error || result.error.code !== 'ENOENT') {
      resolvedCommand = command;
      resolvedScope = 'global';
      break;
    }
  }

  if (result?.error?.code === 'ENOENT') {
    const fallbackCommand = resolveFallbackHagiscriptCommand();
    if (fallbackCommand) {
      result = runHagiscriptVersion(fallbackCommand);
      resolvedCommand = fallbackCommand;
      resolvedScope = 'global';
    }
  }

  if (!resolvedCommand) {
    resolvedCommand = process.platform === 'win32' ? 'hagiscript.cmd' : 'hagiscript';
  }

  if (result.error) {
    throw new Error(`Required hagiscript installation is missing: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`hagiscript prerequisite check failed: ${(result.stderr || result.stdout || '').trim() || 'unknown error'}`);
  }

  const actual = parseVersion(result.stdout || result.stderr || '');
  const required = parseVersion(minimumVersion);
  if (!actual || !required) {
    throw new Error('hagiscript prerequisite check could not determine a semantic version.');
  }

  if (compareVersions(actual, required) < 0) {
    throw new Error(`hagiscript ${minimumVersion}+ is required, but ${actual.join('.')} is installed globally.`);
  }

  return {
    command: resolvedCommand,
    version: actual.join('.'),
    scope: resolvedScope,
    packageRoot: null,
  };
}

function resolveGlobalNodeModulesRoot() {
  const npmRootResult = runNpmCommand(['root', '-g']);

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
  const resolved = resolveInstalledHagiscript(minimumVersion);
  if (resolved.packageRoot) {
    return resolved.packageRoot;
  }
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

export function buildResolvedHagiscriptEnvironment(minimumVersion = '0.1.8') {
  const resolved = resolveInstalledHagiscript(minimumVersion);
  const packageRoot = resolveGlobalHagiscriptPackageRoot(minimumVersion);
  return {
    [HAGISCRIPT_VERSION_ENV]: resolved.version,
    [HAGISCRIPT_COMMAND_ENV]: resolved.command,
    [HAGISCRIPT_PACKAGE_ROOT_ENV]: packageRoot,
  };
}

function resolveImportableHagiscriptModulePath(packageRoot, relativeCandidates) {
  const matchedPath = relativeCandidates
    .map((relativePath) => path.join(packageRoot, relativePath))
    .find((candidate) => fs.existsSync(candidate));

  if (matchedPath) {
    return matchedPath;
  }

  throw new Error(
    `Unable to locate hagiscript module. Checked: ${relativeCandidates.join(', ')} under ${packageRoot}`,
  );
}

async function importGlobalHagiscriptModule(relativeCandidates, minimumVersion = '0.1.8') {
  const packageRoot = resolveGlobalHagiscriptPackageRoot(minimumVersion);
  const targetPath = resolveImportableHagiscriptModulePath(packageRoot, relativeCandidates);
  if (!hagiscriptModuleCache.has(targetPath)) {
    hagiscriptModuleCache.set(targetPath, import(pathToFileURL(targetPath).href));
  }

  return hagiscriptModuleCache.get(targetPath);
}

export async function extractZipArchiveWithGlobalHagiscript(
  archivePath,
  destination,
  minimumVersion = '0.2.7',
) {
  const module = await importGlobalHagiscriptModule(
    ['dist/runtime/zip-extract.js', 'runtime/lib/zip-extract.mjs'],
    minimumVersion,
  );

  if (typeof module.extractZipArchive !== 'function') {
    throw new Error('Resolved hagiscript zip extraction module does not export extractZipArchive().');
  }

  return module.extractZipArchive(archivePath, destination);
}
