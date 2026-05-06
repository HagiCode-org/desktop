import fsSync from 'node:fs';
import path from 'node:path';
import type { BundledNodeRuntimePolicyDecision } from './bundled-node-runtime-policy.js';
import type { NodeMajorNpmGlobalPaths } from './portable-toolchain-paths.js';

export interface PortableToolchainPathAccessor {
  getPortableToolchainRoot(): string;
  getPortableToolchainBinRoot(): string;
  getPortableNodeBinRoot(): string;
  getPortableNpmGlobalBinRoot(): string;
}

export interface InjectPortableToolchainEnvOptions {
  platform?: NodeJS.Platform;
  existsSync?: (path: string) => boolean;
  activationPolicy?: BundledNodeRuntimePolicyDecision;
  npmGlobalPaths?: NodeMajorNpmGlobalPaths | null;
}

export interface PortableToolchainEnvResult {
  env: NodeJS.ProcessEnv;
  pathKey: string;
  injectedPaths: string[];
  toolchainRoot: string;
  markerInjected: boolean;
  usedBundledToolchain: boolean;
  fellBackToSystemPath: boolean;
  resolutionSource: 'bundled-desktop' | 'system';
  missingInjectedPaths: string[];
  activationPolicy?: BundledNodeRuntimePolicyDecision;
  npmGlobalPaths?: NodeMajorNpmGlobalPaths | null;
}

export interface ManagedCliPathEnvResult {
  env: NodeJS.ProcessEnv;
  pathKey: string;
  pathEntries: string[];
  managedCliPath: string | null;
  managedNpmGlobalPath: string | null;
  inheritedPathValue?: string;
  npmGlobalPaths?: NodeMajorNpmGlobalPaths | null;
}

export interface CodeServerRuntimeEnvResult extends PortableToolchainEnvResult {
  runtimeRoot: string;
}

const SERVER_NODE_ENV_KEYS = [
  'NODE_PATH',
  'NODE',
  'npm_node_execpath',
  'npm_execpath',
  'HAGICODE_NPM_GLOBAL_PREFIX',
  'HAGICODE_NPM_GLOBAL_BIN_ROOT',
  'HAGICODE_NPM_GLOBAL_MODULES_ROOT',
  'HAGICODE_NPM_CACHE_ROOT',
  'HAGICODE_NODE_MAJOR_VERSION',
  'HAGICODE_PORTABLE_TOOLCHAIN_ROOT',
  'HAGICODE_AGENT_CLI_PATH',
  'HAGICODE_NPM_GLOBAL_PATH',
  'npm_config_prefix',
  'NPM_CONFIG_PREFIX',
  'npm_config_global_prefix',
  'NPM_CONFIG_GLOBAL_PREFIX',
  'npm_config_globalconfig',
  'NPM_CONFIG_GLOBALCONFIG',
  'NPM_CONFIG_GLOBAL_CONFIG',
] as const;

function normalizePathForComparison(entry: string, platform: NodeJS.Platform): string {
  const resolved = path.resolve(entry);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function getPathDelimiter(platform: NodeJS.Platform): string {
  return platform === 'win32' ? ';' : ':';
}

function splitPathEntries(value: string | undefined, platform: NodeJS.Platform): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(getPathDelimiter(platform))
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
}

function buildResolvedPathEntries(
  baseEnv: NodeJS.ProcessEnv,
  prependedEntries: readonly string[],
  platform: NodeJS.Platform,
): {
  pathKey: string;
  inheritedPathValue?: string;
  pathEntries: string[];
} {
  const pathKey = resolvePathEnvKey(baseEnv, platform);
  const inheritedPathValue = baseEnv[pathKey] ?? baseEnv.PATH ?? baseEnv.Path;
  const inheritedEntries = splitPathEntries(inheritedPathValue, platform);

  return {
    pathKey,
    inheritedPathValue,
    pathEntries: dedupePathEntries([...prependedEntries, ...inheritedEntries], platform),
  };
}

function applyResolvedPathEntries(
  env: NodeJS.ProcessEnv,
  resolvedPathEntries: { pathKey: string; inheritedPathValue?: string; pathEntries: readonly string[] },
  platform: NodeJS.Platform,
): void {
  if (resolvedPathEntries.pathEntries.length > 0 || resolvedPathEntries.inheritedPathValue !== undefined) {
    env[resolvedPathEntries.pathKey] = resolvedPathEntries.pathEntries.join(getPathDelimiter(platform));
  }
}

export function resolvePathEnvKey(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): string {
  const existingKey = Object.keys(env).find(key => key.toLowerCase() === 'path');
  if (existingKey) {
    return existingKey;
  }

  return platform === 'win32' ? 'Path' : 'PATH';
}

export function dedupePathEntries(
  entries: readonly string[],
  platform: NodeJS.Platform = process.platform,
): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }

    const normalized = normalizePathForComparison(trimmed, platform);
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(trimmed);
  }

  return unique;
}

export function collectPortableToolchainPathEntries(
  pathAccessor: PortableToolchainPathAccessor,
  options: InjectPortableToolchainEnvOptions = {},
): { toolchainRoot: string; injectedPaths: string[]; missingInjectedPaths: string[] } {
  const existsSync = options.existsSync ?? fsSync.existsSync;
  const platform = options.platform ?? process.platform;
  const candidates = [
    pathAccessor.getPortableToolchainBinRoot(),
    pathAccessor.getPortableNodeBinRoot(),
    options.npmGlobalPaths?.npmGlobalBinRoot ?? pathAccessor.getPortableNpmGlobalBinRoot(),
  ];

  return {
    toolchainRoot: pathAccessor.getPortableToolchainRoot(),
    injectedPaths: dedupePathEntries(candidates.filter(candidate => (
      candidate === options.npmGlobalPaths?.npmGlobalBinRoot || existsSync(candidate)
    )), platform),
    missingInjectedPaths: candidates.filter(candidate => (
      candidate !== options.npmGlobalPaths?.npmGlobalBinRoot && !existsSync(candidate)
    )),
  };
}

export function injectPortableToolchainEnv(
  baseEnv: NodeJS.ProcessEnv,
  pathAccessor: PortableToolchainPathAccessor,
  options: InjectPortableToolchainEnvOptions = {},
): PortableToolchainEnvResult {
  const platform = options.platform ?? process.platform;
  const toolchainEntries = collectPortableToolchainPathEntries(pathAccessor, options);
  const activationPolicy = options.activationPolicy;
  const activeInjectedPaths = activationPolicy?.enabled === false ? [] : toolchainEntries.injectedPaths;
  const resolvedPathEntries = buildResolvedPathEntries(baseEnv, activeInjectedPaths, platform);
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
  };

  applyResolvedPathEntries(env, resolvedPathEntries, platform);

  const markerInjected = activeInjectedPaths.length > 0;
  if (markerInjected) {
    env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT = toolchainEntries.toolchainRoot;
    if (options.npmGlobalPaths) {
      const inheritedNodePathEntries = splitPathEntries(baseEnv.NODE_PATH, platform);
      env.NODE_PATH = dedupePathEntries([
        options.npmGlobalPaths.npmGlobalModulesRoot,
        ...inheritedNodePathEntries,
      ], platform).join(getPathDelimiter(platform));
      env.HAGICODE_NPM_GLOBAL_PREFIX = options.npmGlobalPaths.npmGlobalPrefix;
      env.HAGICODE_NPM_GLOBAL_BIN_ROOT = options.npmGlobalPaths.npmGlobalBinRoot;
      env.HAGICODE_NPM_GLOBAL_MODULES_ROOT = options.npmGlobalPaths.npmGlobalModulesRoot;
      env.HAGICODE_NPM_CACHE_ROOT = options.npmGlobalPaths.npmCacheRoot;
      env.HAGICODE_NODE_MAJOR_VERSION = options.npmGlobalPaths.nodeMajorVersion;
    }
  } else {
    delete env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT;
    delete env.HAGICODE_NPM_GLOBAL_PREFIX;
    delete env.HAGICODE_NPM_GLOBAL_BIN_ROOT;
    delete env.HAGICODE_NPM_GLOBAL_MODULES_ROOT;
    delete env.HAGICODE_NPM_CACHE_ROOT;
    delete env.HAGICODE_NODE_MAJOR_VERSION;
  }

  return {
    env,
    pathKey: resolvedPathEntries.pathKey,
    injectedPaths: activeInjectedPaths,
    toolchainRoot: toolchainEntries.toolchainRoot,
    markerInjected,
    usedBundledToolchain: markerInjected,
    fellBackToSystemPath: !markerInjected,
    resolutionSource: markerInjected ? 'bundled-desktop' : 'system',
    missingInjectedPaths: toolchainEntries.missingInjectedPaths,
    activationPolicy,
    npmGlobalPaths: options.npmGlobalPaths ?? null,
  };
}

export function injectManagedCliPathEnv(
  baseEnv: NodeJS.ProcessEnv,
  options: {
    platform?: NodeJS.Platform;
    activationPolicy?: BundledNodeRuntimePolicyDecision;
    npmGlobalPaths?: NodeMajorNpmGlobalPaths | null;
  } = {},
): ManagedCliPathEnvResult {
  const platform = options.platform ?? process.platform;
  const activeNpmGlobalPaths = options.activationPolicy?.enabled === false
    ? null
    : (options.npmGlobalPaths ?? null);
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
  };

  for (const key of SERVER_NODE_ENV_KEYS) {
    delete env[key];
  }

  const managedCliPath = resolveManagedCliCommandDirectory(activeNpmGlobalPaths, platform);
  const managedNpmGlobalPath = resolveManagedNpmGlobalPath(activeNpmGlobalPaths);
  const resolvedPathEntries = buildResolvedPathEntries(
    baseEnv,
    managedCliPath ? [managedCliPath] : [],
    platform,
  );
  applyResolvedPathEntries(env, resolvedPathEntries, platform);
  if (managedCliPath) {
    env.HAGICODE_AGENT_CLI_PATH = managedCliPath;
  } else {
    delete env.HAGICODE_AGENT_CLI_PATH;
  }
  if (managedNpmGlobalPath) {
    env.HAGICODE_NPM_GLOBAL_PATH = managedNpmGlobalPath;
  } else {
    delete env.HAGICODE_NPM_GLOBAL_PATH;
  }

  return {
    env,
    pathKey: resolvedPathEntries.pathKey,
    pathEntries: resolvedPathEntries.pathEntries,
    managedCliPath,
    managedNpmGlobalPath,
    inheritedPathValue: resolvedPathEntries.inheritedPathValue,
    npmGlobalPaths: activeNpmGlobalPaths,
  };
}

export function injectCodeServerRuntimeEnv(
  baseEnv: NodeJS.ProcessEnv,
  pathAccessor: PortableToolchainPathAccessor & { getCodeServerRuntimeRoot(): string },
  options: InjectPortableToolchainEnvOptions = {},
): CodeServerRuntimeEnvResult {
  const portableEnv = injectPortableToolchainEnv(baseEnv, pathAccessor, options);
  const env: NodeJS.ProcessEnv = {
    ...portableEnv.env,
    HAGICODE_CODE_SERVER_RUNTIME_ROOT: pathAccessor.getCodeServerRuntimeRoot(),
  };

  return {
    ...portableEnv,
    env,
    runtimeRoot: pathAccessor.getCodeServerRuntimeRoot(),
  };
}

function resolveManagedNpmGlobalPath(
  npmGlobalPaths: NodeMajorNpmGlobalPaths | null | undefined,
): string | null {
  if (!npmGlobalPaths) {
    return null;
  }

  const trimmedPrefix = npmGlobalPaths.npmGlobalPrefix.trim();
  return trimmedPrefix.length > 0 ? trimmedPrefix : null;
}

export function resolveManagedCliCommandDirectory(
  npmGlobalPaths: NodeMajorNpmGlobalPaths | null | undefined,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (!npmGlobalPaths) {
    return null;
  }

  const commandDirectory = platform === 'win32'
    ? npmGlobalPaths.npmGlobalPrefix
    : npmGlobalPaths.npmGlobalBinRoot;

  const trimmedCommandDirectory = commandDirectory.trim();
  return trimmedCommandDirectory.length > 0 ? trimmedCommandDirectory : null;
}
