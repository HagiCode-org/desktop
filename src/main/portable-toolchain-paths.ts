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
  npmGlobalBinRoot: string;
  nodeExecutablePath: string;
  npmExecutablePath: string;
  openspecExecutablePath: string;
}

export function resolvePortableToolchainRoot(options: PortableToolchainPathOptions): string {
  const override = options.overrideRoot?.trim();
  if (override) {
    return path.resolve(override);
  }

  if (!options.isPackaged) {
    return path.resolve(options.cwd, 'resources', 'portable-fixed', 'toolchain');
  }

  return path.join(options.resourcesPath, 'extra', 'portable-fixed', 'toolchain');
}

export function buildPortableToolchainPaths(options: PortableToolchainPathOptions): PortableToolchainPaths {
  const platform = options.platform ?? process.platform;
  const toolchainRoot = resolvePortableToolchainRoot(options);
  const nodeRoot = path.join(toolchainRoot, 'node');
  const toolchainBinRoot = path.join(toolchainRoot, 'bin');
  const nodeBinRoot = platform === 'win32' ? nodeRoot : path.join(nodeRoot, 'bin');
  const npmGlobalBinRoot = path.join(toolchainRoot, 'npm-global', 'bin');
  const nodeExecutableName = platform === 'win32' ? 'node.exe' : 'node';
  const npmExecutableName = platform === 'win32' ? 'npm.cmd' : 'npm';
  const openspecExecutableName = platform === 'win32' ? 'openspec.cmd' : 'openspec';

  return {
    toolchainRoot,
    nodeRoot,
    toolchainBinRoot,
    nodeBinRoot,
    npmGlobalBinRoot,
    nodeExecutablePath: path.join(nodeBinRoot, nodeExecutableName),
    npmExecutablePath: path.join(nodeBinRoot, npmExecutableName),
    openspecExecutablePath: path.join(toolchainBinRoot, openspecExecutableName),
  };
}
