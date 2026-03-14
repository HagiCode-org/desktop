import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EMBEDDED_RUNTIME_METADATA_FILE = '.hagicode-runtime.json';

export interface PinnedEmbeddedRuntimeSource {
  provider: string;
  releaseMetadataUrl: string;
  allowedDownloadHosts: string[];
}

export interface PinnedEmbeddedRuntimeTarget {
  rid: string;
  archiveType: 'zip' | 'tar.gz';
  downloadUrl: string;
  aspNetCoreVersion: string;
  netCoreVersion: string;
  hostFxrVersion: string;
}

export interface PinnedEmbeddedRuntimeManifest {
  schemaVersion: number;
  channelVersion: string;
  releaseVersion: string;
  releaseDate: string;
  source: PinnedEmbeddedRuntimeSource;
  platforms: Record<string, PinnedEmbeddedRuntimeTarget>;
  expectedLayout: {
    runtimeRootPattern: string;
    requiredEntries: string[];
  };
}

export interface EmbeddedRuntimeStageMetadata {
  schemaVersion: number;
  platform: string;
  provider: string;
  releaseMetadataUrl: string;
  allowedDownloadHosts: string[];
  releaseVersion: string;
  releaseDate: string;
  downloadUrl: string;
  sourceHost: string;
  archiveType: 'zip' | 'tar.gz';
  archivePath?: string;
  dotnetPath: string;
  runtimeRoot: string;
  aspNetCoreVersion: string;
  netCoreVersion: string;
  hostFxrVersion: string;
  stagedAt: string;
}

let cachedManifest: PinnedEmbeddedRuntimeManifest | null = null;

export function getPinnedRuntimeManifestPath(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'resources', 'embedded-runtime', 'runtime-manifest.json'),
    path.resolve(moduleDirectory, '../../resources/embedded-runtime/runtime-manifest.json'),
  ];

  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(`Pinned embedded runtime manifest was not found. Checked: ${candidates.join(', ')}`);
  }

  return match;
}

export function readPinnedRuntimeManifest(): PinnedEmbeddedRuntimeManifest {
  if (cachedManifest) {
    return cachedManifest;
  }

  const manifestPath = getPinnedRuntimeManifestPath();
  const content = fs.readFileSync(manifestPath, 'utf8');
  cachedManifest = JSON.parse(content) as PinnedEmbeddedRuntimeManifest;
  return cachedManifest;
}

export function resolvePinnedRuntimeTarget(platform: string): PinnedEmbeddedRuntimeTarget {
  const manifest = readPinnedRuntimeManifest();
  const target = manifest.platforms[platform];
  if (!target) {
    const supported = Object.keys(manifest.platforms).sort().join(', ');
    throw new Error(`Pinned embedded runtime is not configured for ${platform}. Supported targets: ${supported}`);
  }

  assertOfficialMicrosoftDownloadUrl(target.downloadUrl, manifest.source.allowedDownloadHosts);
  return target;
}

export function assertOfficialMicrosoftDownloadUrl(downloadUrl: string, allowedHosts: readonly string[]): URL {
  let parsed: URL;
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

export async function readEmbeddedRuntimeStageMetadata(runtimeRoot: string): Promise<EmbeddedRuntimeStageMetadata | null> {
  const metadataPath = path.join(runtimeRoot, EMBEDDED_RUNTIME_METADATA_FILE);
  try {
    const content = await fs.promises.readFile(metadataPath, 'utf8');
    return JSON.parse(content) as EmbeddedRuntimeStageMetadata;
  } catch {
    return null;
  }
}
