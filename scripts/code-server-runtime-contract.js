import fs from 'fs';
import path from 'path';
import { ensureRuntimeManifestPath, readRuntimeManifestSection } from './runtime-manifest-store.js';

const LEGACY_METADATA_FILE = 'metadata.json';
const HAGISCRIPT_COMPONENT_MARKER_FILE = '.hagicode-runtime.json';
const DEFAULT_ARCHIVE_RELATIVE_PATH = path.join('archives', 'code-server.7z');
const DEFAULT_INSTALL_MODE = 'archive-7z-only';

export function readCodeServerRuntimeConfig() {
  return readRuntimeManifestSection('codeServerRuntime');
}

export function getCodeServerRuntimeConfigPath() {
  return ensureRuntimeManifestPath();
}

export function detectCodeServerRuntimePlatform(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') {
    return 'win-x64';
  }
  if (platform === 'linux') {
    return 'linux-x64';
  }
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'osx-arm64' : 'osx-x64';
  }
  throw new Error(`Unsupported vendored code-server platform: ${platform}/${arch}`);
}

export function resolveCodeServerRuntimeTarget(platformKey = detectCodeServerRuntimePlatform(), config = readCodeServerRuntimeConfig()) {
  const target = config.platforms[platformKey];
  if (!target) {
    throw new Error(`Vendored code-server runtime is not configured for ${platformKey}`);
  }
  return target;
}

export function resolveRequestedCodeServerRuntimeVersion(
  platformKey = detectCodeServerRuntimePlatform(),
  config = readCodeServerRuntimeConfig(),
) {
  const override = process.env.HAGICODE_CODE_SERVER_RUNTIME_VERSION?.trim();
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

export function resolveConfiguredCodeServerReleaseUrls(
  platformKey = detectCodeServerRuntimePlatform(),
  config = readCodeServerRuntimeConfig(),
) {
  const envReleaseUrl = process.env.HAGICODE_CODE_SERVER_RUNTIME_RELEASE_URL?.trim();
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

export function resolveCodeServerArtifactsDir(config = readCodeServerRuntimeConfig()) {
  const override = process.env.HAGICODE_CODE_SERVER_RUNTIME_ARTIFACTS_DIR?.trim();
  if (override) {
    return path.resolve(process.cwd(), override);
  }

  if (!config.source?.localArtifactDir) {
    const generatedRoot = resolveCodeServerGeneratedRoot(config);
    return generatedRoot ? path.join(generatedRoot, 'artifacts') : null;
  }

  return path.resolve(path.dirname(getCodeServerRuntimeConfigPath()), config.source.localArtifactDir);
}

export function findHagiCodeMonoRoot(startDir = process.cwd()) {
  let currentDir = path.resolve(startDir);
  while (true) {
    const agentsPath = path.join(currentDir, 'AGENTS.md');
    const desktopRepoPath = path.join(currentDir, 'repos', 'hagicode-desktop');
    if (fs.existsSync(agentsPath) && fs.existsSync(desktopRepoPath)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

export function resolveCodeServerGeneratedRoot(config = readCodeServerRuntimeConfig()) {
  const configuredSubdir = config.source?.generatedRootSubdir;
  if (typeof configuredSubdir === 'string' && configuredSubdir.trim().length === 0) {
    return null;
  }

  const generatedSubdir = config.source?.generatedRootSubdir?.trim() || 'code-server-runtime';
  const monoRoot = findHagiCodeMonoRoot(process.cwd());
  const baseRoot = monoRoot ?? process.cwd();
  return path.join(baseRoot, '.generated', generatedSubdir);
}

export function resolveCodeServerPackagedArchivePath(runtimeRoot, config = readCodeServerRuntimeConfig()) {
  return path.join(runtimeRoot, config.packagedLayout?.archiveRelativePath || DEFAULT_ARCHIVE_RELATIVE_PATH);
}

export function readCodeServerRuntimeMetadata(runtimeRoot) {
  return readCodeServerRuntimeMetadataRecord(runtimeRoot).metadata;
}

function readCodeServerRuntimeMetadataRecord(
  runtimeRoot,
  {
    platformKey = detectCodeServerRuntimePlatform(),
    config = readCodeServerRuntimeConfig(),
  } = {},
) {
  const markerPath = path.join(runtimeRoot, config.packagedLayout?.markerFile || HAGISCRIPT_COMPONENT_MARKER_FILE);
  if (fs.existsSync(markerPath)) {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    const target = resolveCodeServerRuntimeTarget(platformKey, config);
    return {
      metadata: {
        schemaVersion: config.schemaVersion,
        packageId: config.packageId,
        version: typeof marker.version === 'string' ? marker.version : '',
        platform: target.platform,
        arch: target.arch,
        sourceRevision: marker.vendoredReleaseTag || marker.vendoredReleaseName || marker.generatedAt || 'hagiscript-managed',
        extra: {
          bundledNodeRuntime: false,
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
      marker,
    };
  }

  const legacyMetadataPath = path.join(runtimeRoot, 'current', LEGACY_METADATA_FILE);
  if (fs.existsSync(legacyMetadataPath)) {
    return {
      metadata: JSON.parse(fs.readFileSync(legacyMetadataPath, 'utf8')),
      metadataPath: legacyMetadataPath,
      marker: null,
    };
  }

  return {
    metadata: null,
    metadataPath: null,
    marker: null,
  };
}

export function validateCodeServerRuntimePayload(
  runtimeRoot,
  {
    platformKey = detectCodeServerRuntimePlatform(),
    config = readCodeServerRuntimeConfig(),
  } = {},
) {
  const diagnostics = [];
  const missingEntries = [];
  const target = resolveCodeServerRuntimeTarget(platformKey, config);
  const { metadata, metadataPath, marker } = readCodeServerRuntimeMetadataRecord(runtimeRoot, { platformKey, config });
  const archivePath = resolveCodeServerPackagedArchivePath(runtimeRoot, config);
  const expectedInstallMode = config.packagedLayout?.installMode || DEFAULT_INSTALL_MODE;

  if (!fs.existsSync(runtimeRoot)) {
    missingEntries.push('runtime-root');
  }

  if (!fs.existsSync(archivePath)) {
    missingEntries.push(path.relative(runtimeRoot, archivePath).replaceAll('\\', '/'));
  }

  if (!metadataPath) {
    diagnostics.push('Vendored runtime metadata is missing (.hagicode-runtime.json)');
  }

  if (!metadata) {
    diagnostics.push('Vendored runtime metadata could not be resolved from the packaged marker');
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
    const requestedVersion = resolveRequestedCodeServerRuntimeVersion(platformKey, config);
    if (requestedVersion && metadata.version !== requestedVersion) {
      diagnostics.push(`metadata version expected ${requestedVersion} but found ${metadata.version ?? 'missing'}`);
    }
    if (metadata.platform !== target.platform) {
      diagnostics.push(`metadata platform expected ${target.platform} but found ${metadata.platform ?? 'missing'}`);
    }
    if (metadata.arch !== target.arch) {
      diagnostics.push(`metadata arch expected ${target.arch} but found ${metadata.arch ?? 'missing'}`);
    }
    if (metadata.extra?.bundledNodeRuntime !== false) {
      diagnostics.push('metadata extra.bundledNodeRuntime must be false');
    }
  }

  if (!marker || typeof marker !== 'object') {
    diagnostics.push('Packaged code-server marker payload is missing or invalid');
  } else {
    if (marker.bundledInstallMode !== expectedInstallMode) {
      diagnostics.push(`marker bundledInstallMode expected ${expectedInstallMode} but found ${marker.bundledInstallMode ?? 'missing'}`);
    }
    if (marker.wrapperPath !== null) {
      diagnostics.push('marker wrapperPath must be null for archive-only packaged code-server payloads');
    }
    if (marker.entrypointPath !== null) {
      diagnostics.push('marker entrypointPath must be null for archive-only packaged code-server payloads');
    }
    if (marker.archiveFormat !== '7z') {
      diagnostics.push(`marker archiveFormat expected 7z but found ${marker.archiveFormat ?? 'missing'}`);
    }
    if (typeof marker.vendoredAssetName !== 'string' || !marker.vendoredAssetName.endsWith('.7z')) {
      diagnostics.push('marker vendoredAssetName must reference a .7z payload');
    }
  }

  return {
    metadata,
    metadataPath,
    marker,
    archivePath,
    installMode: expectedInstallMode,
    diagnostics,
    missingEntries,
  };
}
