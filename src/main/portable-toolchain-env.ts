import fsSync from 'node:fs';
import path from 'node:path';

export interface PortableToolchainPathAccessor {
  getPortableToolchainRoot(): string;
  getPortableToolchainBinRoot(): string;
  getPortableNodeBinRoot(): string;
  getPortableNpmGlobalBinRoot(): string;
}

export interface InjectPortableToolchainEnvOptions {
  platform?: NodeJS.Platform;
  existsSync?: (path: string) => boolean;
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
}

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
    pathAccessor.getPortableNpmGlobalBinRoot(),
  ];

  return {
    toolchainRoot: pathAccessor.getPortableToolchainRoot(),
    injectedPaths: dedupePathEntries(candidates.filter(candidate => existsSync(candidate)), platform),
    missingInjectedPaths: candidates.filter(candidate => !existsSync(candidate)),
  };
}

export function injectPortableToolchainEnv(
  baseEnv: NodeJS.ProcessEnv,
  pathAccessor: PortableToolchainPathAccessor,
  options: InjectPortableToolchainEnvOptions = {},
): PortableToolchainEnvResult {
  const platform = options.platform ?? process.platform;
  const pathKey = resolvePathEnvKey(baseEnv, platform);
  const inheritedPathValue = baseEnv[pathKey] ?? baseEnv.PATH ?? baseEnv.Path;
  const inheritedEntries = splitPathEntries(inheritedPathValue, platform);
  const toolchainEntries = collectPortableToolchainPathEntries(pathAccessor, options);
  const nextEntries = dedupePathEntries([...toolchainEntries.injectedPaths, ...inheritedEntries], platform);
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
  };

  if (nextEntries.length > 0 || inheritedPathValue !== undefined) {
    env[pathKey] = nextEntries.join(getPathDelimiter(platform));
  }

  const markerInjected = toolchainEntries.injectedPaths.length > 0;
  if (markerInjected) {
    env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT = toolchainEntries.toolchainRoot;
  } else {
    delete env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT;
  }

  return {
    env,
    pathKey,
    injectedPaths: toolchainEntries.injectedPaths,
    toolchainRoot: toolchainEntries.toolchainRoot,
    markerInjected,
    usedBundledToolchain: markerInjected,
    fellBackToSystemPath: !markerInjected,
    resolutionSource: markerInjected ? 'bundled-desktop' : 'system',
    missingInjectedPaths: toolchainEntries.missingInjectedPaths,
  };
}
