import path from 'node:path';

export interface NodeMajorNpmGlobalPathOptions {
  runtimeDataRoot?: string;
  userDataPath?: string;
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
  runtimeDataRoot?: string;
  userDataPath?: string;
  pm2Version?: string | null;
  pm2MajorVersion?: string | number | null;
  platform?: NodeJS.Platform;
}

export interface Pm2MajorHomePaths {
  pm2Version: string | null;
  pm2MajorVersion: string;
  pm2Home: string;
}

function getPathModuleForPlatform(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix;
}

function getRuntimeDataRoot(
  options: { runtimeDataRoot?: string; userDataPath?: string },
  platform: NodeJS.Platform,
): string {
  const pathModule = getPathModuleForPlatform(platform);
  const configuredRoot = options.runtimeDataRoot?.trim() || options.userDataPath?.trim();
  if (!configuredRoot) {
    throw new Error('runtimeDataRoot is required to resolve managed npm and PM2 paths.');
  }
  return pathModule.normalize(configuredRoot);
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
  const runtimeDataRoot = getRuntimeDataRoot(options, platform);
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
  const runtimeDataRoot = getRuntimeDataRoot(options, platform);

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
