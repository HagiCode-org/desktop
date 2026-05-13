import fs from 'node:fs';
import path from 'node:path';
import {
  TOOLCHAIN_MANIFEST_FILE,
  detectNodeRuntimePlatform,
  getNodeExecutableRelativePath,
  getNpmExecutableRelativePath,
  getNpmExecutableRelativePathCandidates,
  readPinnedNodeRuntimeConfig,
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
  if (!pathExists(manifestPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
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
    manifest?.commands?.npm || getNpmExecutableRelativePath(platform),
    TOOLCHAIN_MANIFEST_FILE,
  ];

  for (const relativePath of requiredCommands) {
    const absolutePath = path.join(toolchainRoot, relativePath);
    if (!pathExists(absolutePath)) {
      missing.push(relativePath);
      continue;
    }

    const shouldCheckExecutability = platform.startsWith('win-') === false
      && requireExecutableCommands
      && (relativePath.endsWith('/node') || relativePath.endsWith('/npm'));
    if (shouldCheckExecutability && !isExecutable(absolutePath)) {
      missing.push(`${relativePath} (not executable)`);
    }
  }

  const candidateNpmPaths = getNpmExecutableRelativePathCandidates(platform)
    .map((relativePath) => path.join(toolchainRoot, relativePath));
  if (!candidateNpmPaths.some((candidatePath) => pathExists(candidatePath))) {
    missing.push(`${getNpmExecutableRelativePath(platform)} or equivalent npm entrypoint`);
  }

  const unusedNodeEntrypoints = platform.startsWith('win-')
    ? ['corepack.cmd', 'npx.cmd']
    : [path.join('bin', 'corepack'), path.join('bin', 'npx')];
  for (const relativePath of unusedNodeEntrypoints) {
    if (pathExists(path.join(toolchainRoot, relativePath))) {
      missing.push(`unused Node entrypoint must be pruned before packaging: ${relativePath}`);
    }
  }

  return missing;
}

export function validateToolchainManifest(toolchainRoot, options = {}) {
  const platform = options.platform || resolveToolchainPlatform(toolchainRoot);
  const runtimeConfig = readPinnedNodeRuntimeConfig();
  const manifest = readToolchainManifest(toolchainRoot);
  if (!manifest) {
    return [`${TOOLCHAIN_MANIFEST_FILE} is missing`];
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

  for (const managedCommandName of ['openspec', 'skills', 'omniroute']) {
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
