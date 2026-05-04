import path from 'node:path';

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
  const override = options.overrideRoot?.trim();
  if (override) {
    return path.resolve(override);
  }

  if (!options.isPackaged) {
    return path.resolve(options.cwd, 'resources', 'toolchain');
  }

  return path.join(options.resourcesPath, 'extra', 'toolchain');
}

export function buildPortableToolchainPaths(options: PortableToolchainPathOptions): PortableToolchainPaths {
  const platform = options.platform ?? process.platform;
  const toolchainRoot = resolvePortableToolchainRoot(options);
  const nodeRoot = path.join(toolchainRoot, 'node');
  const toolchainBinRoot = path.join(toolchainRoot, 'bin');
  const nodeBinRoot = platform === 'win32' ? nodeRoot : path.join(nodeRoot, 'bin');
  const nodeExecutableName = platform === 'win32' ? 'node.exe' : 'node';
  const npmExecutableName = platform === 'win32' ? 'npm.cmd' : 'npm';

  return {
    toolchainRoot,
    nodeRoot,
    toolchainBinRoot,
    nodeBinRoot,
    toolchainManifestPath: path.join(toolchainRoot, 'toolchain-manifest.json'),
    nodeExecutablePath: path.join(nodeBinRoot, nodeExecutableName),
    npmExecutablePath: path.join(nodeBinRoot, npmExecutableName),
  };
}

function getPathModuleForPlatform(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix;
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
  const npmGlobalPrefix = pathModule.join(options.userDataPath, `node${nodeMajorVersion}`, 'npmGlobal');

  return {
    nodeVersion: options.nodeVersion?.trim() || null,
    nodeMajorVersion,
    npmGlobalPrefix,
    npmGlobalBinRoot: platform === 'win32' ? npmGlobalPrefix : pathModule.join(npmGlobalPrefix, 'bin'),
    npmGlobalModulesRoot: platform === 'win32'
      ? pathModule.join(npmGlobalPrefix, 'node_modules')
      : pathModule.join(npmGlobalPrefix, 'lib', 'node_modules'),
    npmCacheRoot: pathModule.join(options.userDataPath, `node${nodeMajorVersion}`, 'npmCache'),
  };
}

export function buildPm2MajorHomePaths(options: Pm2MajorHomePathOptions): Pm2MajorHomePaths {
  const platform = options.platform ?? process.platform;
  const pathModule = getPathModuleForPlatform(platform);
  const pm2MajorVersion = extractPm2MajorVersion(options.pm2MajorVersion ?? options.pm2Version);

  return {
    pm2Version: options.pm2Version?.trim() || null,
    pm2MajorVersion,
    pm2Home: pathModule.join(options.userDataPath, 'pm2', pm2MajorVersion),
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
