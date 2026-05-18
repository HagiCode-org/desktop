import fs from 'fs';
import path from 'path';
import { findHagiCodeMonoRoot } from './code-server-runtime-contract.js';
import { ensureRuntimeManifestPath, readRuntimeManifestSection } from './runtime-manifest-store.js';

const LEGACY_METADATA_FILE = 'metadata.json';
const HAGISCRIPT_COMPONENT_MARKER_FILE = '.hagicode-runtime.json';

function getOmniRouteRuntimeConfigPath() {
  return ensureRuntimeManifestPath();
}

export function readOmniRouteRuntimeConfig() {
  return readRuntimeManifestSection('omniRouteRuntime');
}

export function detectOmniRouteRuntimePlatform(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') {
    return 'win-x64';
  }
  if (platform === 'linux') {
    return 'linux-x64';
  }
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'osx-arm64' : 'osx-x64';
  }
  throw new Error(`Unsupported vendored OmniRoute platform: ${platform}/${arch}`);
}

export function resolveOmniRouteRuntimeTarget(platformKey = detectOmniRouteRuntimePlatform(), config = readOmniRouteRuntimeConfig()) {
  const target = config.platforms[platformKey];
  if (!target) {
    throw new Error(`Vendored OmniRoute runtime is not configured for ${platformKey}`);
  }
  return target;
}

export function resolveRequestedOmniRouteRuntimeVersion(
  platformKey = detectOmniRouteRuntimePlatform(),
  config = readOmniRouteRuntimeConfig(),
) {
  const override = process.env.HAGICODE_OMNIROUTE_RUNTIME_VERSION?.trim();
  if (override) {
    return override;
  }

  const perPlatform = config.releaseVersionByPlatform?.[platformKey];
  if (typeof perPlatform === 'string' && perPlatform.trim().length > 0) {
    return perPlatform.trim();
  }

  const globalVersion = config.releaseVersion;
  if (typeof globalVersion === 'string' && globalVersion.trim().length > 0) {
    return globalVersion.trim();
  }

  return null;
}

export function resolveConfiguredOmniRouteReleaseUrls(
  platformKey = detectOmniRouteRuntimePlatform(),
  config = readOmniRouteRuntimeConfig(),
) {
  const envReleaseUrl = process.env.HAGICODE_OMNIROUTE_RUNTIME_RELEASE_URL?.trim();
  if (envReleaseUrl) {
    return [envReleaseUrl];
  }

  const perPlatform = Array.isArray(config.source?.releaseUrlsByPlatform?.[platformKey])
    ? config.source.releaseUrlsByPlatform[platformKey]
    : [];
  if (perPlatform.length > 0) {
    return perPlatform.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean);
  }

  return Array.isArray(config.source?.releaseUrls)
    ? config.source.releaseUrls.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)
    : [];
}

export function resolveOmniRouteArtifactsDir(config = readOmniRouteRuntimeConfig()) {
  const override = process.env.HAGICODE_OMNIROUTE_RUNTIME_ARTIFACTS_DIR?.trim();
  if (override) {
    return path.resolve(process.cwd(), override);
  }

  if (!config.source?.localArtifactDir) {
    const generatedRoot = resolveOmniRouteGeneratedRoot(config);
    return generatedRoot ? path.join(generatedRoot, 'artifacts') : null;
  }

  return path.resolve(path.dirname(getOmniRouteRuntimeConfigPath()), config.source.localArtifactDir);
}

export function resolveOmniRouteGeneratedRoot(config = readOmniRouteRuntimeConfig()) {
  const configuredSubdir = config.source?.generatedRootSubdir;
  if (typeof configuredSubdir === 'string' && configuredSubdir.trim().length === 0) {
    return null;
  }

  const generatedSubdir = config.source?.generatedRootSubdir?.trim() || 'omniroute-runtime';
  const monoRoot = findHagiCodeMonoRoot(process.cwd());
  const baseRoot = monoRoot ?? process.cwd();
  return path.join(baseRoot, '.generated', generatedSubdir);
}

export function readOmniRouteRuntimeMetadata(runtimeRoot) {
  return readOmniRouteRuntimeMetadataRecord(runtimeRoot).metadata;
}

function readOmniRouteRuntimeMetadataRecord(
  runtimeRoot,
  {
    platformKey = detectOmniRouteRuntimePlatform(),
    config = readOmniRouteRuntimeConfig(),
  } = {},
) {
  const legacyMetadataPath = path.join(runtimeRoot, LEGACY_METADATA_FILE);
  if (fs.existsSync(legacyMetadataPath)) {
    return {
      metadata: JSON.parse(fs.readFileSync(legacyMetadataPath, 'utf8')),
      metadataPath: legacyMetadataPath,
    };
  }

  const markerPath = path.join(runtimeRoot, '..', HAGISCRIPT_COMPONENT_MARKER_FILE);
  if (!fs.existsSync(markerPath)) {
    return {
      metadata: null,
      metadataPath: null,
    };
  }

  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  const target = resolveOmniRouteRuntimeTarget(platformKey, config);
  return {
    metadata: {
      schemaVersion: config.schemaVersion,
      packageId: config.packageId,
      version: typeof marker.version === 'string' ? marker.version : '',
      platform: target.platform,
      arch: target.arch,
      sourceRevision: marker.vendoredReleaseTag || marker.vendoredReleaseName || marker.generatedAt || 'hagiscript-managed',
      extra: {
        bundledNodeRuntime: true,
      },
      artifacts: marker.vendoredAssetName
        ? [{
          kind: 'release-asset',
          fileName: marker.vendoredAssetName,
          blobKey: marker.vendoredAssetUrl || marker.vendoredAssetName,
          platform: target.platform,
          arch: target.arch,
        }]
        : undefined,
    },
    metadataPath: markerPath,
  };
}

export function resolveOmniRouteWrapperPath(runtimeRoot, config = readOmniRouteRuntimeConfig()) {
  for (const relativePath of config.expectedLayout.wrapperCandidates) {
    const candidate = path.join(runtimeRoot, relativePath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveRequiredEntry(relativePattern, runtimeRoot) {
  const candidates = relativePattern.split('|').map((entry) => entry.trim()).filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(path.join(runtimeRoot, candidate))) ?? null;
}

export function validateOmniRouteRuntimePayload(
  runtimeRoot,
  {
    platformKey = detectOmniRouteRuntimePlatform(),
    config = readOmniRouteRuntimeConfig(),
  } = {},
) {
  const diagnostics = [];
  const missingEntries = [];
  const target = resolveOmniRouteRuntimeTarget(platformKey, config);
  const { metadata, metadataPath } = readOmniRouteRuntimeMetadataRecord(runtimeRoot, { platformKey, config });

  if (!fs.existsSync(runtimeRoot)) {
    missingEntries.push('runtime-root');
  }

  for (const relativePattern of config.expectedLayout.requiredEntries) {
    if (!resolveRequiredEntry(relativePattern, runtimeRoot)) {
      missingEntries.push(relativePattern);
    }
  }

  if (!metadata) {
    diagnostics.push('Vendored OmniRoute metadata is missing (metadata.json or ../.hagicode-runtime.json)');
  } else {
    if (metadata.schemaVersion !== config.schemaVersion) {
      diagnostics.push(`metadata schemaVersion expected ${config.schemaVersion} but found ${metadata.schemaVersion ?? 'missing'}`);
    }
    if (metadata.packageId !== config.packageId) {
      diagnostics.push(`metadata packageId expected ${config.packageId} but found ${metadata.packageId ?? 'missing'}`);
    }
    if (!metadata.version || typeof metadata.version !== 'string') {
      diagnostics.push('metadata version is missing');
    }
    const requestedVersion = resolveRequestedOmniRouteRuntimeVersion(platformKey, config);
    if (requestedVersion && metadata.version !== requestedVersion) {
      diagnostics.push(`metadata version expected ${requestedVersion} but found ${metadata.version ?? 'missing'}`);
    }
    if (metadata.platform !== target.platform) {
      diagnostics.push(`metadata platform expected ${target.platform} but found ${metadata.platform ?? 'missing'}`);
    }
    if (metadata.arch !== target.arch) {
      diagnostics.push(`metadata arch expected ${target.arch} but found ${metadata.arch ?? 'missing'}`);
    }
    if (metadata.extra?.bundledNodeRuntime !== true) {
      diagnostics.push('metadata extra.bundledNodeRuntime must be true');
    }
  }

  const wrapperPath = resolveOmniRouteWrapperPath(runtimeRoot, config);
  if (!wrapperPath) {
    diagnostics.push('No runnable OmniRoute wrapper was found');
  }

  const entryScriptPath = path.join(runtimeRoot, config.expectedLayout.entryScript);
  if (!fs.existsSync(entryScriptPath)) {
    diagnostics.push(`Entry script is missing: ${config.expectedLayout.entryScript}`);
  }

  return {
    metadata,
    metadataPath,
    diagnostics,
    missingEntries,
    wrapperPath,
    entryScriptPath: fs.existsSync(entryScriptPath) ? entryScriptPath : null,
  };
}
