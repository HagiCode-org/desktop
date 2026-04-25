import path from 'path';
import {
  TOOLCHAIN_MANIFEST_FILE,
  getNodeExecutableRelativePath,
  getNpmExecutableRelativePath,
} from './embedded-node-runtime-config.js';

export const DEV_NODE_RUNTIME_ROOT = path.join('.runtime', 'node-dev');
export const DEV_NODE_RUNTIME_METADATA_FILE = 'runtime-metadata.json';

export function getDevNodeRuntimeRoot(projectRoot = process.cwd()) {
  return path.join(projectRoot, DEV_NODE_RUNTIME_ROOT);
}

export function getDevNodeRuntimeCacheRoot(projectRoot = process.cwd()) {
  return path.join(getDevNodeRuntimeRoot(projectRoot), 'cache');
}

export function getDevNodeRuntimeInstallRoot(platform, nodeVersion, projectRoot = process.cwd()) {
  return path.join(getDevNodeRuntimeRoot(projectRoot), 'node', nodeVersion, platform);
}

export function getDevNodeRuntimeMetadataPath(projectRoot = process.cwd()) {
  return path.join(getDevNodeRuntimeRoot(projectRoot), DEV_NODE_RUNTIME_METADATA_FILE);
}

export function buildDevNodeRuntimeMetadata({
  runtimeConfig,
  runtimeTarget,
  platform,
  arch = process.arch,
  installRoot,
  nodeExecutablePath,
  npmExecutablePath,
  corepackExecutablePath,
  archivePath,
  toolchain,
}) {
  return {
    schemaVersion: 1,
    owner: 'hagicode-desktop',
    source: 'bundled-dev',
    nodeVersion: runtimeConfig.releaseVersion,
    channelVersion: runtimeConfig.channelVersion,
    platform,
    arch,
    installRoot,
    nodeExecutablePath,
    npmExecutablePath,
    corepackExecutablePath,
    installedAt: new Date().toISOString(),
    runtimeManifest: {
      schemaVersion: runtimeConfig.schemaVersion,
      layoutVersion: runtimeConfig.layoutVersion,
      releaseDate: runtimeConfig.releaseDate,
      provider: runtimeConfig.source?.provider,
      releaseMetadataUrl: runtimeConfig.source?.releaseMetadataUrl,
      allowedDownloadHosts: runtimeConfig.source?.allowedDownloadHosts || [],
    },
    archive: {
      archiveName: runtimeTarget.archiveName,
      archiveType: runtimeTarget.archiveType,
      downloadUrl: runtimeTarget.downloadUrl,
      extractRoot: runtimeTarget.extractRoot,
      checksumSha256: runtimeTarget.checksumSha256,
      archivePath,
    },
    layout: {
      nodeExecutableRelativePath: getNodeExecutableRelativePath(platform),
      npmExecutableRelativePath: getNpmExecutableRelativePath(platform),
      packagedManifestFile: TOOLCHAIN_MANIFEST_FILE,
    },
    toolchain,
  };
}
