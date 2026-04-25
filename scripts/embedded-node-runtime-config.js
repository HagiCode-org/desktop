import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'resources', 'embedded-node-runtime', 'runtime-manifest.json');

export const TOOLCHAIN_MANIFEST_FILE = 'toolchain-manifest.json';

export function readPinnedNodeRuntimeConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

export function detectNodeRuntimePlatform(runtimePlatform = process.platform, runtimeArch = process.arch) {
  if (runtimePlatform === 'win32') return 'win-x64';
  if (runtimePlatform === 'linux') return runtimeArch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  if (runtimePlatform === 'darwin') return runtimeArch === 'arm64' ? 'osx-arm64' : 'osx-x64';
  throw new Error(`Unsupported Node runtime platform: ${runtimePlatform}/${runtimeArch}`);
}

export function resolvePinnedNodeRuntimeTarget(platform = detectNodeRuntimePlatform(), config = readPinnedNodeRuntimeConfig()) {
  const target = config?.platforms?.[platform];
  if (!target) {
    const supported = Object.keys(config?.platforms || {}).sort().join(', ') || 'none';
    throw new Error(`Pinned embedded Node runtime is not configured for ${platform}. Supported targets: ${supported}`);
  }

  ensureOfficialNodeDownloadUrl(target.downloadUrl, config.source?.allowedDownloadHosts || []);
  return target;
}

export function getGovernedNodeRuntimeMajor(config = readPinnedNodeRuntimeConfig()) {
  return String(config.channelVersion || config.releaseVersion || '').split('.')[0];
}

export function nodeVersionMatchesGovernedMajor(version, config = readPinnedNodeRuntimeConfig()) {
  const governedMajor = getGovernedNodeRuntimeMajor(config);
  const candidateMajor = String(version || '').replace(/^v/, '').split('.')[0];
  return governedMajor.length > 0 && candidateMajor === governedMajor;
}

export function ensureOfficialNodeDownloadUrl(downloadUrl, allowedHosts) {
  let parsed;
  try {
    parsed = new URL(downloadUrl);
  } catch {
    throw new Error(`Pinned Node runtime download URL is invalid: ${downloadUrl}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Pinned Node runtime download URL must use https: ${downloadUrl}`);
  }

  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(
      `Pinned Node runtime download URL must use an allowed host (${allowedHosts.join(', ')}): ${downloadUrl}`,
    );
  }

  return parsed;
}

export function getNodeExecutableName(platform) {
  return platform.startsWith('win-') ? 'node.exe' : 'node';
}

export function getNpmExecutableName(platform) {
  return platform.startsWith('win-') ? 'npm.cmd' : 'npm';
}

export function getCommandExecutableName(platform, commandName) {
  return platform.startsWith('win-') ? `${commandName}.cmd` : commandName;
}

export function getNodeBinRelativePath(platform) {
  return platform.startsWith('win-') ? 'node' : path.join('node', 'bin');
}

export function getNodeExecutableRelativePath(platform) {
  return path.join(getNodeBinRelativePath(platform), getNodeExecutableName(platform));
}

export function getNpmExecutableRelativePath(platform) {
  return path.join(getNodeBinRelativePath(platform), getNpmExecutableName(platform));
}

export function getNpmExecutableRelativePathCandidates(platform) {
  const compatibilityPath = getNpmExecutableRelativePath(platform);
  if (platform.startsWith('win-')) {
    return [
      compatibilityPath,
      path.join(getNodeBinRelativePath(platform), 'npm'),
    ];
  }

  return [
    compatibilityPath,
    path.join('node', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join('node', 'lib', 'node_modules', 'npm', 'bin', 'npm'),
  ];
}

export function getNpmGlobalBinRelativePath(platform) {
  return platform.startsWith('win-') ? 'npm-global' : path.join('npm-global', 'bin');
}

export function getNpmGlobalModulesRelativePath(platform) {
  return platform.startsWith('win-') ? path.join('npm-global', 'node_modules') : path.join('npm-global', 'lib', 'node_modules');
}

export function getPinnedNodeRuntimeConfigPath() {
  return CONFIG_PATH;
}
