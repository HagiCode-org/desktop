import fsSync from 'node:fs';
import path from 'node:path';
import {
  getNodeExecutableRelativePath,
  resolveExistingNpmExecutableRelativePath,
} from './embedded-node-runtime-config.js';
import {
  resolveDesktopRuntimeComponentProgramRoot,
  resolveDesktopRuntimeProgramHome,
} from './desktop-runtime-paths.js';

export interface PortableToolchainPathOptions {
  cwd: string;
  resourcesPath: string;
  isPackaged: boolean;
  platform?: NodeJS.Platform;
  overrideRoot?: string | null;
}

export interface PortableToolchainPaths {
  toolchainRoot: string;
  nodeRoot: string;
  toolchainBinRoot: string;
  nodeBinRoot: string;
  toolchainManifestPath: string;
  nodeExecutablePath: string;
  npmExecutablePath: string;
}

export interface NodeMajorNpmGlobalPathOptions {
  userDataPath: string;
  nodeVersion?: string | null;
  nodeMajorVersion?: string | number | null;
  platform?: NodeJS.Platform;
}

export interface NodeMajorNpmGlobalPaths {
  nodeVersion: string | null;
  nodeMajorVersion: string;
  npmGlobalPrefix: string;
  npmGlobalBinRoot: string;
  npmGlobalModulesRoot: string;
  npmCacheRoot: string;
}

export interface Pm2MajorHomePathOptions {
  userDataPath: string;
  pm2Version?: string | null;
  pm2MajorVersion?: string | number | null;
  platform?: NodeJS.Platform;
}

export interface Pm2MajorHomePaths {
  pm2Version: string | null;
  pm2MajorVersion: string;
  pm2Home: string;
}

export function resolvePortableToolchainRoot(options: PortableToolchainPathOptions): string {
  const programHome = resolveDesktopRuntimeProgramHome({
    cwd: options.cwd,
    resourcesPath: options.resourcesPath,
    isPackaged: options.isPackaged,
    overrideRoot: options.overrideRoot,
  });
  return resolveDesktopRuntimeComponentProgramRoot('node', programHome, 'unused');
}

export function buildPortableToolchainPaths(options: PortableToolchainPathOptions): PortableToolchainPaths {
  const platform = options.platform ?? process.platform;
  const toolchainRoot = resolvePortableToolchainRoot(options);
  const nodeRoot = toolchainRoot;
  const toolchainBinRoot = platform === 'win32' ? toolchainRoot : path.join(toolchainRoot, 'bin');
  const nodeBinRoot = toolchainBinRoot;
  const nodeExecutablePath = path.join(toolchainRoot, getNodeExecutableRelativePath(platform));
  const npmExecutablePath = path.join(
    toolchainRoot,
    resolveExistingNpmExecutableRelativePath(toolchainRoot, platform, fsSync.existsSync),
  );

  return {
    toolchainRoot,
    nodeRoot,
    toolchainBinRoot,
    nodeBinRoot,
    toolchainManifestPath: path.join(toolchainRoot, 'toolchain-manifest.json'),
    nodeExecutablePath,
    npmExecutablePath,
  };
}

function getPathModuleForPlatform(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix;
}

function getRuntimeDataRoot(userDataPath: string, platform: NodeJS.Platform): string {
  const pathModule = getPathModuleForPlatform(platform);
  return pathModule.join(userDataPath, 'runtimeData');
}

export function extractNodeMajorVersion(
  nodeVersion?: string | number | null,
  fallbackMajor: string | number = process.versions.node,
): string {
  const candidate = String(nodeVersion ?? '').trim().replace(/^v/i, '');
  const candidateMajor = candidate.split('.')[0];
  if (/^\d+$/.test(candidateMajor)) {
    return candidateMajor;
  }

  const fallback = String(fallbackMajor).trim().replace(/^v/i, '');
  const fallbackMajorValue = fallback.split('.')[0];
  return /^\d+$/.test(fallbackMajorValue) ? fallbackMajorValue : '0';
}

export function extractPm2MajorVersion(
  pm2Version?: string | number | null,
  fallbackMajor: string | number = 7,
): string {
  const candidate = String(pm2Version ?? '').trim().replace(/^v/i, '');
  const candidateMajor = candidate.split('.')[0];
  if (/^\d+$/.test(candidateMajor)) {
    return candidateMajor;
  }

  const fallback = String(fallbackMajor).trim().replace(/^v/i, '');
  const fallbackMajorValue = fallback.split('.')[0];
  return /^\d+$/.test(fallbackMajorValue) ? fallbackMajorValue : '7';
}

export function buildNodeMajorNpmGlobalPaths(options: NodeMajorNpmGlobalPathOptions): NodeMajorNpmGlobalPaths {
  const platform = options.platform ?? process.platform;
  const pathModule = getPathModuleForPlatform(platform);
  const nodeMajorVersion = extractNodeMajorVersion(options.nodeMajorVersion ?? options.nodeVersion);
  const runtimeDataRoot = getRuntimeDataRoot(options.userDataPath, platform);
  const npmGlobalPrefix = pathModule.join(runtimeDataRoot, 'node', `node${nodeMajorVersion}`, 'npmGlobal');

  return {
    nodeVersion: options.nodeVersion?.trim() || null,
    nodeMajorVersion,
    npmGlobalPrefix,
    npmGlobalBinRoot: platform === 'win32' ? npmGlobalPrefix : pathModule.join(npmGlobalPrefix, 'bin'),
    npmGlobalModulesRoot: platform === 'win32'
      ? pathModule.join(npmGlobalPrefix, 'node_modules')
      : pathModule.join(npmGlobalPrefix, 'lib', 'node_modules'),
    npmCacheRoot: pathModule.join(runtimeDataRoot, 'node', `node${nodeMajorVersion}`, 'npmCache'),
  };
}

export function buildPm2MajorHomePaths(options: Pm2MajorHomePathOptions): Pm2MajorHomePaths {
  const platform = options.platform ?? process.platform;
  const pathModule = getPathModuleForPlatform(platform);
  const pm2MajorVersion = extractPm2MajorVersion(options.pm2MajorVersion ?? options.pm2Version);
  const runtimeDataRoot = getRuntimeDataRoot(options.userDataPath, platform);

  return {
    pm2Version: options.pm2Version?.trim() || null,
    pm2MajorVersion,
    pm2Home: pathModule.join(runtimeDataRoot, 'pm2', pm2MajorVersion),
  };
}

export function buildNpmGlobalCommandArtifactPaths(
  npmGlobalBinRoot: string,
  commandName: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const pathModule = getPathModuleForPlatform(platform);
  if (platform !== 'win32') {
    return [pathModule.join(npmGlobalBinRoot, commandName)];
  }

  return [
    pathModule.join(npmGlobalBinRoot, commandName),
    pathModule.join(npmGlobalBinRoot, `${commandName}.cmd`),
    pathModule.join(npmGlobalBinRoot, `${commandName}.ps1`),
  ];
}
