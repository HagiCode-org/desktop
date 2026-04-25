import fs from 'node:fs';
import path from 'node:path';

export const TOOLCHAIN_MANIFEST_FILE = 'toolchain-manifest.json';

const CONFIG_PATH = path.resolve(process.cwd(), 'resources', 'embedded-node-runtime', 'runtime-manifest.json');

export type EmbeddedNodeRuntimeConsumer = 'desktop' | 'steam-packer' | string;

export type EmbeddedNodeRuntimeConsumerDefaultMatrix = Record<EmbeddedNodeRuntimeConsumer, boolean>;

export interface EmbeddedNodeRuntimePackageConfig {
  packageName: string;
  version: string;
  binName: string;
  aliases?: string[];
  integrity?: string;
  installMode?: 'manual' | 'auto';
  installState?: 'pending' | 'installed';
  installSpec?: string;
  manualActionId?: string;
}

export interface EmbeddedNodeRuntimePlatformTarget {
  rid: string;
  archiveType: string;
  archiveName: string;
  downloadUrl: string;
  extractRoot: string;
  checksumSha256: string;
}

export interface EmbeddedNodeRuntimeConfig {
  schemaVersion: number;
  runtime: 'node';
  channelVersion: string;
  releaseVersion: string;
  releaseDate: string;
  layoutVersion: number;
  defaultEnabledByConsumer?: EmbeddedNodeRuntimeConsumerDefaultMatrix;
  source: {
    provider: string;
    releaseMetadataUrl: string;
    allowedDownloadHosts: string[];
  };
  corePackages: Record<string, EmbeddedNodeRuntimePackageConfig>;
  platforms: Record<string, EmbeddedNodeRuntimePlatformTarget>;
}

export function readPinnedNodeRuntimeConfig(configPath: string = CONFIG_PATH): EmbeddedNodeRuntimeConfig {
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as EmbeddedNodeRuntimeConfig;
}

export function detectNodeRuntimePlatform(
  runtimePlatform: NodeJS.Platform = process.platform,
  runtimeArch: string = process.arch,
): string {
  if (runtimePlatform === 'win32') return 'win-x64';
  if (runtimePlatform === 'linux') return runtimeArch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  if (runtimePlatform === 'darwin') return runtimeArch === 'arm64' ? 'osx-arm64' : 'osx-x64';
  throw new Error(`Unsupported Node runtime platform: ${runtimePlatform}/${runtimeArch}`);
}

export function resolvePinnedNodeRuntimeTarget(
  platform: string = detectNodeRuntimePlatform(),
  config: EmbeddedNodeRuntimeConfig = readPinnedNodeRuntimeConfig(),
): EmbeddedNodeRuntimePlatformTarget {
  const target = config.platforms[platform];
  if (!target) {
    const supported = Object.keys(config.platforms || {}).sort().join(', ') || 'none';
    throw new Error(`Pinned embedded Node runtime is not configured for ${platform}. Supported targets: ${supported}`);
  }

  ensureOfficialNodeDownloadUrl(target.downloadUrl, config.source.allowedDownloadHosts || []);
  return target;
}

export function ensureOfficialNodeDownloadUrl(downloadUrl: string, allowedHosts: string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(downloadUrl);
  } catch {
    throw new Error(`Pinned Node runtime download URL is invalid: ${downloadUrl}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Pinned Node runtime download URL must use https: ${downloadUrl}`);
  }

  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(`Pinned Node runtime download URL must use an allowed host (${allowedHosts.join(', ')}): ${downloadUrl}`);
  }

  return parsed;
}

export function getCommandExecutableName(platform: NodeJS.Platform | string, commandName: string): string {
  return String(platform).startsWith('win') ? `${commandName}.cmd` : commandName;
}

export function getNodeExecutableName(platform: NodeJS.Platform | string): string {
  return String(platform).startsWith('win') ? 'node.exe' : 'node';
}

export function getNpmExecutableName(platform: NodeJS.Platform | string): string {
  return String(platform).startsWith('win') ? 'npm.cmd' : 'npm';
}

export function getNodeBinRelativePath(platform: NodeJS.Platform | string): string {
  return String(platform).startsWith('win') ? 'node' : path.join('node', 'bin');
}

export function getNodeExecutableRelativePath(platform: NodeJS.Platform | string): string {
  return path.join(getNodeBinRelativePath(platform), getNodeExecutableName(platform));
}

export function getNpmExecutableRelativePath(platform: NodeJS.Platform | string): string {
  return path.join(getNodeBinRelativePath(platform), getNpmExecutableName(platform));
}

export function getNpmExecutableRelativePathCandidates(platform: NodeJS.Platform | string): string[] {
  const platformValue = String(platform);
  const compatibilityPath = getNpmExecutableRelativePath(platformValue);
  if (platformValue.startsWith('win')) {
    return [
      compatibilityPath,
      path.join(getNodeBinRelativePath(platformValue), 'npm'),
    ];
  }

  return [
    compatibilityPath,
    path.join('node', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join('node', 'lib', 'node_modules', 'npm', 'bin', 'npm'),
  ];
}

export function getNpmGlobalBinRelativePath(platform: NodeJS.Platform | string): string {
  return String(platform).startsWith('win')
    ? 'npm-global'
    : path.join('npm-global', 'bin');
}

export function getNpmGlobalModulesRelativePath(platform: NodeJS.Platform | string): string {
  return String(platform).startsWith('win')
    ? path.join('npm-global', 'node_modules')
    : path.join('npm-global', 'lib', 'node_modules');
}

export function getPinnedNodeRuntimeConfigPath(): string {
  return CONFIG_PATH;
}
