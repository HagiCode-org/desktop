import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'resources', 'code-server-runtime', 'runtime-manifest.json');

export function readCodeServerRuntimeConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

export function getCodeServerRuntimeConfigPath() {
  return configPath;
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

export function readCodeServerRuntimeMetadata(runtimeRoot) {
  const metadataPath = path.join(runtimeRoot, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
}

export function resolveCodeServerWrapperPath(runtimeRoot, config = readCodeServerRuntimeConfig()) {
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
  const metadata = readCodeServerRuntimeMetadata(runtimeRoot);

  if (!fs.existsSync(runtimeRoot)) {
    missingEntries.push('runtime-root');
  }

  for (const relativePattern of config.expectedLayout.requiredEntries) {
    if (!resolveRequiredEntry(relativePattern, runtimeRoot)) {
      missingEntries.push(relativePattern);
    }
  }

  if (!metadata) {
    diagnostics.push('Vendored runtime metadata is missing at metadata.json');
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

  const wrapperPath = resolveCodeServerWrapperPath(runtimeRoot, config);
  if (!wrapperPath) {
    diagnostics.push('No runnable code-server wrapper was found');
  }

  const entryScriptPath = path.join(runtimeRoot, config.expectedLayout.entryScript);
  if (!fs.existsSync(entryScriptPath)) {
    diagnostics.push(`Entry script is missing: ${config.expectedLayout.entryScript}`);
  }

  return {
    metadata,
    diagnostics,
    missingEntries,
    wrapperPath,
    entryScriptPath: fs.existsSync(entryScriptPath) ? entryScriptPath : null,
  };
}
