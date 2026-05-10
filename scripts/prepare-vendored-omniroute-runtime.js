#!/usr/bin/env node

import crypto from 'crypto';
import fs from 'fs';
import { chmod, copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';
import { execa } from 'execa';
import {
  isManagedDesktopRuntimeComponentExecution,
  resolveManagedDesktopRuntimeComponentRoot,
} from './desktop-runtime-hagiscript.js';
import {
  getNodeExecutableRelativePath,
  getNpmExecutableRelativePathCandidates,
  getNpmExecutableRelativePath,
} from './embedded-node-runtime-config.js';
import {
  detectOmniRouteRuntimePlatform,
  readOmniRouteRuntimeConfig,
  resolveConfiguredOmniRouteReleaseUrls,
  resolveOmniRouteArtifactsDir,
  resolveOmniRouteGeneratedRoot,
  resolveRequestedOmniRouteRuntimeVersion,
  resolveOmniRouteRuntimeTarget,
  validateOmniRouteRuntimePayload,
} from './omniroute-runtime-contract.js';
import { resolveStagedDesktopRuntimeComponentRoot } from './desktop-runtime-layout.js';
import { assertGlobalHagiscriptAvailable } from './global-hagiscript.js';

const config = readOmniRouteRuntimeConfig();
const platformKey = process.env.HAGICODE_OMNIROUTE_PLATFORM || detectOmniRouteRuntimePlatform();
const target = resolveOmniRouteRuntimeTarget(platformKey, config);
const runtimeVersionOverride = resolveRequestedOmniRouteRuntimeVersion(platformKey, config);
const runtimeRoot = resolveManagedDesktopRuntimeComponentRoot()
  || resolveStagedDesktopRuntimeComponentRoot('omniroute', { cwd: process.cwd() });
const buildRoot = resolveOmniRouteGeneratedRoot(config) ?? path.join(process.cwd(), 'build', 'omniroute-runtime');
const downloadsRoot = path.join(buildRoot, 'downloads');
const extractRoot = path.join(buildRoot, 'extract');

main().catch((error) => {
  console.error('[omniroute-runtime] Failed to prepare vendored runtime:', error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const hagiscriptVersion = assertGlobalHagiscriptAvailable('0.1.10');
  const selectedArtifact = await resolveArtifact();
  await mkdir(downloadsRoot, { recursive: true });
  await mkdir(extractRoot, { recursive: true });

  const archivePath = await materializeArchive(selectedArtifact);
  await rm(extractRoot, { recursive: true, force: true });
  await mkdir(extractRoot, { recursive: true });
  await extractArchive(archivePath, target.archiveExtension, extractRoot);

  const extractedRoot = await resolveExtractedRoot(extractRoot);
  await rm(runtimeRoot, { recursive: true, force: true });
  await mkdir(path.dirname(runtimeRoot), { recursive: true });
  await cp(extractedRoot, runtimeRoot, { recursive: true });
  await ensureRootNodeModulesPayload(runtimeRoot);
  await rebuildBetterSqlite3ForDesktopNode(runtimeRoot);
  await ensureRuntimeWrapper(runtimeRoot);
  await writeRuntimeMetadata(runtimeRoot, selectedArtifact.metadata);

  const validation = validateOmniRouteRuntimePayload(runtimeRoot, { platformKey, config });
  const validationErrors = [...validation.missingEntries, ...validation.diagnostics];
  if (validationErrors.length > 0) {
    throw new Error(`Prepared vendored OmniRoute runtime is invalid:\n- ${validationErrors.join('\n- ')}`);
  }

  await writeFile(
    path.join(buildRoot, 'prepared-runtime.json'),
    JSON.stringify(
      {
        preparedAt: new Date().toISOString(),
        version: validation.metadata?.version ?? selectedArtifact.metadata.version,
        platform: platformKey,
        runtimeRoot,
        archivePath,
      },
      null,
      2,
    ),
  );

  console.log(`[omniroute-runtime] Prepared ${validation.metadata?.packageId || 'omniroute'} ${validation.metadata?.version || selectedArtifact.metadata.version} for ${platformKey}`);
  console.log(`[omniroute-runtime] Staged runtime root: ${runtimeRoot}`);
  console.log(`[omniroute-runtime] Completed hagiscript-managed install with hagiscript ${hagiscriptVersion}`);
}

async function resolveArtifact() {
  const archiveUrl = process.env.HAGICODE_OMNIROUTE_ARCHIVE_URL?.trim();
  if (archiveUrl) {
    return resolveRemoteArtifactFromArchiveUrl(archiveUrl);
  }

  const artifactsDir = resolveOmniRouteArtifactsDir(config);
  if (artifactsDir && fs.existsSync(artifactsDir)) {
    const localArtifact = await resolveLocalArtifact(artifactsDir);
    if (localArtifact) {
      return localArtifact;
    }
  }

  const indexUrl = process.env.HAGICODE_OMNIROUTE_RUNTIME_INDEX_URL?.trim() || config.source?.indexUrl?.trim();
  if (indexUrl) {
    return resolveRemoteArtifactFromIndex(indexUrl);
  }

  const releaseUrls = resolveConfiguredOmniRouteReleaseUrls(platformKey, config);
  const releaseErrors = [];
  for (const releaseUrl of releaseUrls) {
    try {
      return await resolveRemoteArtifactFromReleasePage(releaseUrl);
    } catch (error) {
      releaseErrors.push(`${releaseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    `No vendored OmniRoute artifact source is available. Checked local cache, direct archive overrides, index URLs, and release pages. ${
      releaseErrors.length > 0 ? `Release lookup errors: ${releaseErrors.join(' | ')}` : ''
    }`.trim(),
  );
}

async function resolveLocalArtifact(artifactsDir) {
  const metadataPaths = await collectMetadataFiles(artifactsDir);
  const candidates = [];
  for (const metadataPath of metadataPaths) {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    if (metadata.packageId !== 'omniroute') {
      continue;
    }
    if (metadata.platform !== target.platform || metadata.arch !== target.arch) {
      continue;
    }
    if (runtimeVersionOverride && metadata.version !== runtimeVersionOverride) {
      continue;
    }
    const archive = Array.isArray(metadata.artifacts)
      ? metadata.artifacts.find((artifact) => artifact.kind === 'archive')
      : null;
    if (!archive) {
      continue;
    }
    candidates.push({
      metadata: normalizeResolvedRuntimeMetadata(metadata),
      archivePath: path.join(path.dirname(metadataPath), archive.fileName),
      sha256: archive.sha256 ?? null,
      origin: 'local',
    });
  }

  candidates.sort((left, right) => compareVersions(right.metadata.version, left.metadata.version));
  return candidates[0] ?? null;
}

async function resolveRemoteArtifactFromArchiveUrl(archiveUrl) {
  const version = runtimeVersionOverride || 'unknown';
  return {
    metadata: createRuntimeMetadata({ version }),
    archiveUrl,
    sha256: process.env.HAGICODE_OMNIROUTE_ARCHIVE_SHA256?.trim() || null,
    origin: 'remote-archive',
  };
}

async function resolveRemoteArtifactFromIndex(indexUrl) {
  const response = await fetch(indexUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch vendored OmniRoute index (${response.status} ${response.statusText}): ${indexUrl}`);
  }

  const indexPayload = await response.json();
  const packageVersions = indexPayload?.packages?.omniroute?.versions;
  if (!packageVersions || typeof packageVersions !== 'object') {
    throw new Error(`Vendored OmniRoute index is missing packages.omniroute.versions: ${indexUrl}`);
  }

  const versionEntries = Object.entries(packageVersions)
    .map(([version, entry]) => ({ version, entry }))
    .filter(({ version }) => !runtimeVersionOverride || version === runtimeVersionOverride)
    .sort((left, right) => compareVersions(right.version, left.version));
  const selectedVersion = versionEntries[0];
  if (!selectedVersion) {
    throw new Error(`Vendored OmniRoute index does not contain a matching version for ${runtimeVersionOverride || 'current target'}`);
  }

  const archive = Array.isArray(selectedVersion.entry?.artifacts)
    ? selectedVersion.entry.artifacts.find((artifact) => artifact.kind === 'archive' && artifact.platform === target.platform && artifact.arch === target.arch)
    : null;
  if (!archive?.blobKey) {
    throw new Error(`Vendored OmniRoute index has no archive for ${target.platform}/${target.arch} in ${selectedVersion.version}`);
  }

  const archiveUrl = new URL(archive.blobKey, indexUrl).toString();
  return {
    metadata: createRuntimeMetadata({
      version: selectedVersion.version,
      sourceRevision: selectedVersion.entry?.sourceRevision ?? null,
      extra: selectedVersion.entry?.extra ?? {},
      artifacts: selectedVersion.entry?.artifacts ?? [],
    }),
    archiveUrl,
    sha256: archive.sha256 ?? null,
    origin: 'remote-index',
  };
}

async function resolveRemoteArtifactFromReleasePage(releaseUrl) {
  const latestReleaseResponse = await fetch(releaseUrl, {
    redirect: 'follow',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!latestReleaseResponse.ok) {
    throw new Error(`Failed to fetch release page (${latestReleaseResponse.status} ${latestReleaseResponse.statusText})`);
  }

  const tagUrl = latestReleaseResponse.url;
  const tagMatch = /\/releases\/tag\/([^/?#]+)/.exec(tagUrl);
  if (!tagMatch) {
    throw new Error(`Could not resolve release tag from ${tagUrl}`);
  }
  const releaseTag = decodeURIComponent(tagMatch[1]);
  const expandedAssetsUrl = tagUrl.replace('/releases/tag/', '/releases/expanded_assets/');
  const expandedAssetsResponse = await fetch(expandedAssetsUrl, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!expandedAssetsResponse.ok) {
    throw new Error(`Failed to fetch expanded assets page (${expandedAssetsResponse.status} ${expandedAssetsResponse.statusText})`);
  }

  const expandedAssetsHtml = await expandedAssetsResponse.text();
  const matchingAsset = findReleaseAssetMatch(expandedAssetsHtml, releaseTag);
  if (!matchingAsset) {
    throw new Error(`Release ${releaseTag} does not contain a ${target.platform}/${target.arch} OmniRoute archive`);
  }

  ensureAllowedDownloadUrl(matchingAsset.archiveUrl);
  return {
    metadata: createRuntimeMetadata({
      version: matchingAsset.version,
      sourceRevision: releaseTag,
    }),
    archiveUrl: matchingAsset.archiveUrl,
    sha256: null,
    origin: 'remote-release-page',
  };
}

async function materializeArchive(selectedArtifact) {
  if (selectedArtifact.archivePath) {
    if (selectedArtifact.sha256) {
      validateArchiveChecksum(selectedArtifact.archivePath, selectedArtifact.sha256);
    }
    return selectedArtifact.archivePath;
  }

  const archiveName = `omniroute-${selectedArtifact.metadata.version}-${target.platform}-${target.arch}${target.archiveExtension}`;
  const destinationPath = path.join(downloadsRoot, archiveName);
  await downloadArchive(selectedArtifact.archiveUrl, destinationPath);
  if (selectedArtifact.sha256) {
    validateArchiveChecksum(destinationPath, selectedArtifact.sha256);
  }
  return cacheResolvedArtifact(selectedArtifact, destinationPath);
}

async function downloadArchive(downloadUrl, destinationPath) {
  ensureAllowedDownloadUrl(downloadUrl);
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download vendored OmniRoute archive (${response.status} ${response.statusText}): ${downloadUrl}`);
  }
  await writeFile(destinationPath, Buffer.from(await response.arrayBuffer()));
}

function validateArchiveChecksum(archivePath, expectedChecksum) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
  if (actual !== expectedChecksum.toLowerCase()) {
    throw new Error(`Vendored OmniRoute checksum mismatch for ${archivePath}. Expected ${expectedChecksum}, got ${actual}.`);
  }
}

async function extractArchive(archivePath, archiveExtension, destinationPath) {
  if (archiveExtension === '.zip') {
    const archive = new AdmZip(archivePath);
    archive.extractAllTo(destinationPath, true);
    return;
  }

  await execa('tar', ['-xzf', archivePath, '-C', destinationPath], {
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
  });
}

async function resolveExtractedRoot(rootPath) {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length === 1) {
    return path.join(rootPath, directories[0].name);
  }
  throw new Error(`Expected one extracted OmniRoute directory under ${rootPath}, found ${directories.length}`);
}

async function collectMetadataFiles(rootPath) {
  const results = [];
  await walk(rootPath, async (entryPath, dirent) => {
    if (dirent.isFile() && dirent.name === 'metadata.json') {
      results.push(entryPath);
    }
  });
  return results.sort((left, right) => left.localeCompare(right));
}

async function walk(currentPath, visitor) {
  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);
    await visitor(entryPath, entry);
    if (entry.isDirectory()) {
      await walk(entryPath, visitor);
    }
  }
}

function compareVersions(left, right) {
  const leftParts = String(left).split('.').map((segment) => Number.parseInt(segment, 10) || 0);
  const rightParts = String(right).split('.').map((segment) => Number.parseInt(segment, 10) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    if ((leftParts[index] || 0) > (rightParts[index] || 0)) {
      return 1;
    }
    if ((leftParts[index] || 0) < (rightParts[index] || 0)) {
      return -1;
    }
  }
  return 0;
}

function createRuntimeMetadata({
  version,
  sourceRevision = null,
  extra = {},
  artifacts = [],
} = {}) {
  return {
    schemaVersion: config.schemaVersion,
    packageId: config.packageId,
    version,
    platform: target.platform,
    arch: target.arch,
    sourceRevision,
    extra: {
      ...extra,
      bundledNodeRuntime: true,
    },
    artifacts,
  };
}

function normalizeResolvedRuntimeMetadata(metadata) {
  return createRuntimeMetadata({
    version: metadata.version,
    sourceRevision: typeof metadata.sourceRevision === 'string' ? metadata.sourceRevision : null,
    extra: metadata && typeof metadata.extra === 'object' && metadata.extra ? metadata.extra : {},
    artifacts: Array.isArray(metadata?.artifacts) ? metadata.artifacts : [],
  });
}

async function ensureRuntimeWrapper(targetRuntimeRoot) {
  const binRoot = path.join(targetRuntimeRoot, 'bin');
  await mkdir(binRoot, { recursive: true });
  const entryScriptPath = path.join(binRoot, 'omniroute.mjs');
  if (!fs.existsSync(entryScriptPath)) {
    return;
  }

  const relativeNodeExecutablePath = toPortablePath(getNodeExecutableRelativePath(platformKey));
  const portableNodeExecutablePath = `../../../node/runtime/${relativeNodeExecutablePath}`;

  if (platformKey.startsWith('win-')) {
    const cmdWrapperPath = path.join(binRoot, 'omniroute.cmd');
    const ps1WrapperPath = path.join(binRoot, 'omniroute.ps1');
    await writeFile(cmdWrapperPath, [
      '@echo off',
      'setlocal',
      'set "SCRIPT_DIR=%~dp0"',
      `set "NODE_EXE=%SCRIPT_DIR%${toWindowsPath(portableNodeExecutablePath)}"`,
      'set "ENTRY_SCRIPT=%SCRIPT_DIR%omniroute.mjs"',
      '"%NODE_EXE%" "%ENTRY_SCRIPT%" %*',
      '',
    ].join('\r\n'), 'utf8');
    await writeFile(ps1WrapperPath, [
      '$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path',
      `$nodeExe = Join-Path $scriptDir '${toWindowsPath(portableNodeExecutablePath)}'`,
      "$entryScript = Join-Path $scriptDir 'omniroute.mjs'",
      '& $nodeExe $entryScript @args',
      '',
    ].join('\r\n'), 'utf8');
    return;
  }

  const wrapperPath = path.join(binRoot, 'omniroute');
  await writeFile(wrapperPath, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'SCRIPT_DIR="$(CDPATH=\'\' cd -- "$(dirname -- "$0")" && pwd)"',
    `NODE_EXE="$SCRIPT_DIR/${portableNodeExecutablePath}"`,
    'ENTRY_SCRIPT="$SCRIPT_DIR/omniroute.mjs"',
    'exec "$NODE_EXE" "$ENTRY_SCRIPT" "$@"',
    '',
  ].join('\n'), 'utf8');
  await chmod(wrapperPath, 0o755);
}

async function rebuildBetterSqlite3ForDesktopNode(targetRuntimeRoot) {
  const applicationRoot = path.join(targetRuntimeRoot, 'app');
  const betterSqlite3Root = path.join(applicationRoot, 'node_modules', 'better-sqlite3');
  if (!fs.existsSync(betterSqlite3Root)) {
    return;
  }
  const betterSqlite3PackagePath = path.join(betterSqlite3Root, 'package.json');
  const betterSqlite3Version = JSON.parse(await readFile(betterSqlite3PackagePath, 'utf8')).version;

  const toolchainRoot = resolveDesktopBundledNodeRuntimeRoot();
  const nodeExecutablePath = path.join(toolchainRoot, getNodeExecutableRelativePath(platformKey));
  if (!fs.existsSync(nodeExecutablePath)) {
    throw new Error(`Desktop bundled Node executable is missing for OmniRoute rebuild: ${nodeExecutablePath}`);
  }
  const npmCommand = resolveDesktopBundledNpmCommand(toolchainRoot, nodeExecutablePath);

  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  const inheritedPath = process.env[pathKey] ?? process.env.PATH ?? '';
  const nodeBinRoot = path.dirname(nodeExecutablePath);
  const targetArch = target.arch === 'amd64' ? 'x64' : target.arch;

  const rebuildEnvironment = {
    ...process.env,
    [pathKey]: inheritedPath ? `${nodeBinRoot}${path.delimiter}${inheritedPath}` : nodeBinRoot,
    npm_config_arch: targetArch,
    npm_config_target_arch: targetArch,
    npm_config_build_from_source: 'true',
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
    npm_config_package_lock: 'false',
    npm_config_cache: path.join(buildRoot, 'npm-cache'),
  };

  try {
    if (!fs.existsSync(path.join(betterSqlite3Root, 'binding.gyp'))) {
      await restoreBetterSqlite3Package(npmCommand, betterSqlite3Root, betterSqlite3Version, rebuildEnvironment);
    }

    await execa(npmCommand.command, [...npmCommand.args, 'rebuild', 'better-sqlite3'], {
      cwd: applicationRoot,
      stdio: 'inherit',
      env: rebuildEnvironment,
    });
  } catch (error) {
    const detailParts = [
      `Failed to rebuild better-sqlite3 for OmniRoute with Desktop bundled Node.`,
      `command: ${npmCommand.command} ${[
        ...npmCommand.args,
        'rebuild',
        'better-sqlite3',
      ].map((part) => JSON.stringify(part)).join(' ')}`,
    ];
    if (error.shortMessage) {
      detailParts.push(`shortMessage: ${error.shortMessage}`);
    }
    if (error.stderr?.trim()) {
      detailParts.push(`stderr:\n${error.stderr.trim()}`);
    }
    if (error.stdout?.trim()) {
      detailParts.push(`stdout:\n${error.stdout.trim()}`);
    }
    throw new Error(detailParts.join('\n\n'));
  }
}

function resolveDesktopBundledNodeRuntimeRoot() {
  const managedComponentRoot = resolveManagedDesktopRuntimeComponentRoot();
  if (managedComponentRoot) {
    return path.join(path.dirname(managedComponentRoot), 'node', 'runtime');
  }
  return resolveStagedDesktopRuntimeComponentRoot('node', { cwd: process.cwd() });
}

function resolveDesktopBundledNpmCommand(toolchainRoot, nodeExecutablePath) {
  const npmRelativePath = getNpmExecutableRelativePathCandidates(platformKey)
    .find((candidate) => fs.existsSync(path.join(toolchainRoot, candidate)));
  if (!npmRelativePath) {
    throw new Error(
      `Desktop bundled npm executable is missing for OmniRoute rebuild: ${path.join(toolchainRoot, getNpmExecutableRelativePath(platformKey))}`,
    );
  }

  const npmEntrypointPath = path.join(toolchainRoot, npmRelativePath);
  if (npmRelativePath.endsWith('.js')) {
    return {
      command: nodeExecutablePath,
      args: [npmEntrypointPath],
    };
  }

  return {
    command: npmEntrypointPath,
    args: [],
  };
}

async function restoreBetterSqlite3Package(npmCommand, betterSqlite3Root, betterSqlite3Version, rebuildEnvironment) {
  const restoreRoot = path.join(buildRoot, 'better-sqlite3-restore');
  const unpackRoot = path.join(restoreRoot, 'unpacked');
  await rm(restoreRoot, { recursive: true, force: true });
  await mkdir(restoreRoot, { recursive: true });

  const packResult = await execa(
    npmCommand.command,
    [...npmCommand.args, 'pack', `better-sqlite3@${betterSqlite3Version}`],
    {
      cwd: restoreRoot,
      env: rebuildEnvironment,
    },
  );
  const archiveName = packResult.stdout.trim().split(/\r?\n/).at(-1)?.trim();
  if (!archiveName) {
    throw new Error(`Unable to determine packed better-sqlite3 archive name for version ${betterSqlite3Version}.`);
  }

  await rm(unpackRoot, { recursive: true, force: true });
  await mkdir(unpackRoot, { recursive: true });
  await execa('tar', ['-xzf', archiveName, '-C', 'unpacked'], {
    cwd: restoreRoot,
    env: rebuildEnvironment,
  });

  await rm(betterSqlite3Root, { recursive: true, force: true });
  await cp(path.join(unpackRoot, 'package'), betterSqlite3Root, { recursive: true });
}

async function ensureRootNodeModulesPayload(targetRuntimeRoot) {
  const rootNodeModulesPath = path.join(targetRuntimeRoot, 'node_modules');
  const appNodeModulesPath = path.join(targetRuntimeRoot, 'app', 'node_modules');
  const runtimePackageNames = ['wreq-js'];
  if (!fs.existsSync(appNodeModulesPath)) {
    return;
  }

  await mkdir(rootNodeModulesPath, { recursive: true });
  for (const packageName of runtimePackageNames) {
    const sourcePath = path.join(appNodeModulesPath, packageName);
    const targetPath = path.join(rootNodeModulesPath, packageName);
    if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) {
      continue;
    }
    await cp(sourcePath, targetPath, { recursive: true });
  }
}

function toPortablePath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function toWindowsPath(relativePath) {
  return relativePath.split('/').join('\\');
}

async function writeRuntimeMetadata(targetRuntimeRoot, metadata) {
  await writeFile(path.join(targetRuntimeRoot, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
}

async function cacheResolvedArtifact(selectedArtifact, downloadedArchivePath) {
  const artifactsDir = resolveOmniRouteArtifactsDir(config);
  if (!artifactsDir) {
    return downloadedArchivePath;
  }

  const targetDir = path.join(artifactsDir, selectedArtifact.metadata.version, `${target.platform}-${target.arch}`);
  const archiveFileName = path.basename(downloadedArchivePath);
  const cachedArchivePath = path.join(targetDir, archiveFileName);
  const sha256 = selectedArtifact.sha256 ?? computeArchiveChecksum(downloadedArchivePath);
  const cachedMetadata = {
    ...selectedArtifact.metadata,
    artifacts: [
      {
        kind: 'archive',
        fileName: archiveFileName,
        platform: target.platform,
        arch: target.arch,
        sha256,
      },
    ],
  };

  await mkdir(targetDir, { recursive: true });
  await copyFile(downloadedArchivePath, cachedArchivePath);
  await writeFile(path.join(targetDir, 'metadata.json'), `${JSON.stringify(cachedMetadata, null, 2)}\n`);
  selectedArtifact.metadata = cachedMetadata;
  selectedArtifact.sha256 = sha256;
  return cachedArchivePath;
}

function computeArchiveChecksum(archivePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
}

function ensureAllowedDownloadUrl(downloadUrl) {
  const configuredHosts = Array.isArray(config.source?.allowedDownloadHosts)
    ? config.source.allowedDownloadHosts.map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')).filter(Boolean)
    : [];
  if (configuredHosts.length === 0) {
    return;
  }

  const hostName = new URL(downloadUrl).hostname.toLowerCase();
  const isAllowed = configuredHosts.some((allowedHost) => hostName === allowedHost || hostName.endsWith(`.${allowedHost}`));
  if (!isAllowed) {
    throw new Error(`Vendored OmniRoute download host is not allowed: ${hostName}`);
  }
}

function findReleaseAssetMatch(expandedAssetsHtml, releaseTag) {
  const assetMatches = expandedAssetsHtml.matchAll(/href="(?<href>\/[^"]*\/releases\/download\/[^"]*\/(?<name>omniroute-[^"]+?(?:\.tar\.gz|\.zip)))"/g);
  const suffix = `-${target.platform}-${target.arch}${target.archiveExtension}`;
  for (const match of assetMatches) {
    const assetName = match.groups?.name;
    const assetHref = match.groups?.href;
    if (!assetName || !assetHref || !assetName.endsWith(suffix)) {
      continue;
    }

    const versionMatch = new RegExp(`^omniroute-(.+)-${escapeRegExp(target.platform)}-${escapeRegExp(target.arch)}${escapeRegExp(target.archiveExtension)}$`).exec(assetName);
    if (!versionMatch) {
      continue;
    }
    const version = versionMatch[1];
    if (runtimeVersionOverride && version !== runtimeVersionOverride) {
      continue;
    }

    return {
      releaseTag,
      version,
      archiveUrl: new URL(assetHref, 'https://github.com').toString(),
    };
  }

  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
