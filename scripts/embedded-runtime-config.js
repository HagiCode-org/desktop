import fs from 'fs';
import path from 'path';

export const EMBEDDED_RUNTIME_METADATA_FILE = '.hagicode-runtime.json';
const CONFIG_PATH = path.join(process.cwd(), 'resources', 'embedded-runtime', 'runtime-manifest.json');

export function readPinnedRuntimeConfig() {
  const content = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(content);
}

export function detectRuntimePlatform() {
  if (process.platform === 'win32') return 'win-x64';
  if (process.platform === 'linux') return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'osx-arm64' : 'osx-x64';
  throw new Error(`Unsupported runtime platform: ${process.platform}/${process.arch}`);
}

export function resolvePinnedRuntimeTarget(platform = detectRuntimePlatform(), config = readPinnedRuntimeConfig()) {
  const target = config?.platforms?.[platform];
  if (!target) {
    const supported = Object.keys(config?.platforms || {}).sort().join(', ') || 'none';
    throw new Error(`Pinned embedded runtime is not configured for ${platform}. Supported targets: ${supported}`);
  }

  ensureOfficialMicrosoftDownloadUrl(target.downloadUrl, config.source?.allowedDownloadHosts || []);
  return target;
}

export function getDotnetExecutableName(platform) {
  return platform.startsWith('win-') ? 'dotnet.exe' : 'dotnet';
}

export function ensureOfficialMicrosoftDownloadUrl(downloadUrl, allowedHosts) {
  let parsed;
  try {
    parsed = new URL(downloadUrl);
  } catch {
    throw new Error(`Pinned runtime download URL is invalid: ${downloadUrl}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Pinned runtime download URL must use https: ${downloadUrl}`);
  }

  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(
      `Pinned runtime download URL must use an official Microsoft host (${allowedHosts.join(', ')}): ${downloadUrl}`,
    );
  }

  return parsed;
}

export function getPinnedRuntimeConfigPath() {
  return CONFIG_PATH;
}
