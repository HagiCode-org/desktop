import fs from 'node:fs';
import path from 'node:path';
import {
  TOOLCHAIN_MANIFEST_FILE,
  detectNodeRuntimePlatform,
  getNodeExecutableRelativePath,
  resolveExistingNpmExecutableRelativePath,
  readPinnedNodeRuntimeConfig,
  resolvePinnedNodeRuntimeTarget,
} from './embedded-node-runtime-config.js';

function pathExists(targetPath) {
  return fs.existsSync(targetPath);
}

export function isExecutable(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function readToolchainManifest(toolchainRoot) {
  const manifestPath = path.join(toolchainRoot, TOOLCHAIN_MANIFEST_FILE);
  if (pathExists(manifestPath)) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  const platform = process.env.HAGICODE_EMBEDDED_NODE_PLATFORM || detectNodeRuntimePlatform();
  const nodeExecutableRelativePath = getNodeExecutableRelativePath(platform);
  if (!pathExists(path.join(toolchainRoot, nodeExecutableRelativePath))) {
    return null;
  }

  const runtimeConfig = readPinnedNodeRuntimeConfig();
  let runtimeTarget = null;
  try {
    runtimeTarget = resolvePinnedNodeRuntimeTarget(platform, runtimeConfig);
  } catch {
    runtimeTarget = null;
  }

  const npmExecutableRelativePath = resolveExistingNpmExecutableRelativePath(toolchainRoot, platform);
  return {
    schemaVersion: runtimeConfig.schemaVersion,
    layoutVersion: runtimeConfig.layoutVersion,
    owner: 'hagicode-desktop',
    source: 'bundled-desktop',
    platform,
    defaultEnabledByConsumer: { ...(runtimeConfig.defaultEnabledByConsumer || {}) },
    stagedAt: new Date(0).toISOString(),
    portableFixedRoot: path.resolve(toolchainRoot, '..', '..', '..'),
    toolchainRoot,
    node: {
      version: runtimeConfig.releaseVersion,
      channelVersion: runtimeConfig.channelVersion,
      releaseDate: runtimeConfig.releaseDate,
      provider: runtimeConfig.source.provider,
      releaseMetadataUrl: runtimeConfig.source.releaseMetadataUrl,
      allowedDownloadHosts: runtimeConfig.source.allowedDownloadHosts,
      downloadUrl: runtimeTarget?.downloadUrl || '',
      sourceHost: runtimeTarget ? new URL(runtimeTarget.downloadUrl).hostname : '',
      archiveName: runtimeTarget?.archiveName || '',
      archiveType: runtimeTarget?.archiveType || '',
      archivePath: '',
      checksumSha256: runtimeTarget?.checksumSha256 || '',
      extractRoot: runtimeTarget?.extractRoot || '',
      executableRelativePath: nodeExecutableRelativePath,
      npmExecutableRelativePath,
    },
    packages: Object.fromEntries(
      Object.entries(runtimeConfig.corePackages || {}).map(([packageId, packageConfig]) => [
        packageId,
        {
          packageName: packageConfig.packageName,
          version: packageConfig.version,
          integrity: packageConfig.integrity,
          binName: packageConfig.binName,
          aliases: packageConfig.aliases,
          installMode: packageConfig.installMode || 'manual',
          installState: packageConfig.installState || 'pending',
          installSpec: packageConfig.installSpec || `${packageConfig.packageName}@${packageConfig.version}`,
          manualActionId: packageConfig.manualActionId || 'install-bundled-node-cli',
        },
      ]),
    ),
    commands: {
      node: nodeExecutableRelativePath,
      npm: npmExecutableRelativePath,
    },
  };
}

export function resolveToolchainPlatform(toolchainRoot, fallbackPlatform = process.env.HAGICODE_EMBEDDED_NODE_PLATFORM || detectNodeRuntimePlatform()) {
  return readToolchainManifest(toolchainRoot)?.platform || fallbackPlatform;
}

export function validateToolchainPayload(toolchainRoot, options = {}) {
  const platform = options.platform || resolveToolchainPlatform(toolchainRoot);
  const requireExecutableCommands = options.requireExecutableCommands ?? !options.extractedFromZip;
  const manifest = readToolchainManifest(toolchainRoot);
  const missing = [];
  const requiredCommands = [
    manifest?.commands?.node || getNodeExecutableRelativePath(platform),
    manifest?.commands?.npm || resolveExistingNpmExecutableRelativePath(toolchainRoot, platform),
  ];

  for (const relativePath of requiredCommands) {
    const absolutePath = path.join(toolchainRoot, relativePath);
    if (!pathExists(absolutePath)) {
      missing.push(relativePath);
      continue;
    }

    const shouldCheckExecutability = relativePath === (manifest?.commands?.node || getNodeExecutableRelativePath(platform))
      && platform.startsWith('win-') === false
      && requireExecutableCommands
      && relativePath.endsWith('/node');
    if (shouldCheckExecutability && !isExecutable(absolutePath)) {
      missing.push(`${relativePath} (not executable)`);
    }
  }

  return missing;
}

export function validateToolchainManifest(toolchainRoot, options = {}) {
  const platform = options.platform || resolveToolchainPlatform(toolchainRoot);
  const runtimeConfig = readPinnedNodeRuntimeConfig();
  const manifest = readToolchainManifest(toolchainRoot);
  if (!manifest) {
    return ['bundled Node runtime metadata is missing'];
  }

  const errors = [];
  if (manifest.owner !== 'hagicode-desktop') {
    errors.push(`owner expected hagicode-desktop but found ${manifest.owner || 'missing'}`);
  }
  if (manifest.source !== 'bundled-desktop') {
    errors.push(`source expected bundled-desktop but found ${manifest.source || 'missing'}`);
  }
  if (manifest.platform !== platform) {
    errors.push(`platform expected ${platform} but found ${manifest.platform || 'missing'}`);
  }
  if (manifest.node?.version !== runtimeConfig.releaseVersion) {
    errors.push(`Node version expected ${runtimeConfig.releaseVersion} but found ${manifest.node?.version || 'missing'}`);
  }
  if (manifest.defaultEnabledByConsumer?.desktop !== runtimeConfig.defaultEnabledByConsumer?.desktop) {
    errors.push(
      `defaultEnabledByConsumer.desktop expected ${String(runtimeConfig.defaultEnabledByConsumer?.desktop)} but found ${String(manifest.defaultEnabledByConsumer?.desktop)}`,
    );
  }
  if (manifest.defaultEnabledByConsumer?.['steam-packer'] !== runtimeConfig.defaultEnabledByConsumer?.['steam-packer']) {
    errors.push(
      `defaultEnabledByConsumer.steam-packer expected ${String(runtimeConfig.defaultEnabledByConsumer?.['steam-packer'])} but found ${String(manifest.defaultEnabledByConsumer?.['steam-packer'])}`,
    );
  }

  for (const commandName of ['node', 'npm']) {
    const relativePath = manifest.commands?.[commandName];
    if (!relativePath || !pathExists(path.join(toolchainRoot, relativePath))) {
      errors.push(`manifest command ${commandName} is missing or points to a missing entry`);
    }
  }

  for (const managedCommandName of ['openspec', 'skills']) {
    if (manifest.commands?.[managedCommandName]) {
      errors.push(`manifest command ${managedCommandName} must not be declared before manual installation`);
    }
  }

  if (manifest.node?.npmExecutableRelativePath !== manifest.commands?.npm) {
    errors.push('manifest node.npmExecutableRelativePath must match commands.npm');
  }

  for (const [name, packageConfig] of Object.entries(runtimeConfig.corePackages || {})) {
    const packageRecord = manifest.packages?.[name];
    if (packageRecord?.version !== packageConfig.version) {
      errors.push(`${name} package version expected ${packageConfig.version} but found ${manifest.packages?.[name]?.version || 'missing'}`);
    }
    if (packageRecord?.installMode !== (packageConfig.installMode || 'manual')) {
      errors.push(`${name} package installMode expected ${packageConfig.installMode || 'manual'}`);
    }
    if (packageRecord?.installState !== (packageConfig.installState || 'pending')) {
      errors.push(`${name} package installState expected ${packageConfig.installState || 'pending'}`);
    }
    if (packageRecord?.installSpec !== (packageConfig.installSpec || `${packageConfig.packageName}@${packageConfig.version}`)) {
      errors.push(`${name} package installSpec expected ${packageConfig.installSpec || `${packageConfig.packageName}@${packageConfig.version}`}`);
    }
  }

  return errors;
}
