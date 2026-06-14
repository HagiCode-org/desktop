#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getMsixPaths } from './msix-config.js';
import { loadStorePackageConfig } from './store-package-config.js';
import { buildStorePurchaseAddon } from './build-store-purchase-addon.js';
import { materializeForgePackagingResources } from './forge-packaging-hooks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'out');
const configuredPackageOutputDir = String(process.env.HAGICODE_PACKAGE_OUTPUT_DIR || '').trim();
const packageDir = configuredPackageOutputDir
  ? (path.isAbsolute(configuredPackageOutputDir)
    ? configuredPackageOutputDir
    : path.resolve(projectRoot, configuredPackageOutputDir))
  : path.join(projectRoot, 'pkg');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

function resolveForgeCliScriptPath() {
  return path.join(projectRoot, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 0) !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 1}`);
  }
}

function ensureDarwinFileLimit() {
  if (process.platform !== 'darwin' || process.env.HAGICODE_ELECTRON_FORGE_NOFILE_PREPARED === '1') {
    return;
  }

  const desiredLimit = process.env.HAGICODE_MACOS_NOFILE_LIMIT || '65536';
  const reentryScriptPath = process.argv[1] ? path.resolve(process.argv[1]) : __filename;
  const result = spawnSync(
    '/bin/bash',
    [
      '-lc',
      'ulimit -n "$HAGICODE_MACOS_NOFILE_LIMIT" 2>/dev/null || ulimit -n 16384 2>/dev/null || true; effective_limit=$(ulimit -n); echo "[electron-forge] effective macOS open file limit: $effective_limit"; if [ "$effective_limit" -lt 16384 ]; then echo "[electron-forge] macOS open file limit is too low for packaging" >&2; exit 1; fi; exec env HAGICODE_ELECTRON_FORGE_NOFILE_PREPARED=1 "$@"',
      'electron-forge-runner',
      process.execPath,
      reentryScriptPath,
      ...process.argv.slice(2),
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        HAGICODE_MACOS_NOFILE_LIMIT: desiredLimit,
      },
      stdio: 'inherit',
      shell: false,
    },
  );

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 0);
}

function parseArgs(argv) {
  const options = {
    platform: '',
    arch: process.arch,
    targets: [],
    packageOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--platform':
        options.platform = String(argv[++index] || '').trim();
        break;
      case '--arch':
        options.arch = String(argv[++index] || '').trim();
        break;
      case '--targets':
        options.targets = String(argv[++index] || '')
          .split(',')
          .map(value => value.trim().toLowerCase())
          .filter(Boolean);
        break;
      case '--package-only':
        options.packageOnly = true;
        break;
      case '--help':
      case '-h':
        console.log(`Usage: node scripts/run-electron-forge.js --platform <platform> --arch <arch> [options]

Options:
  --platform <name>   Target platform: linux | win32 | darwin
  --arch <name>       Target architecture: x64 | arm64
  --targets <list>    Comma-separated make targets
  --package-only      Only create the unpacked application directory
`);
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.platform) {
    throw new Error('Missing required argument: --platform');
  }

  return options;
}

function sanitizeArtifactNameSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function unique(values) {
  return [...new Set(values)];
}

function inferPackagedRootFromAsar(asarPath, platform) {
  const asarDirectory = path.dirname(asarPath);

  if (platform === 'darwin') {
    const resourcesDirectory = path.basename(asarDirectory);
    const contentsDirectory = path.basename(path.dirname(asarDirectory));
    const bundlePath = path.dirname(path.dirname(asarDirectory));

    if (resourcesDirectory === 'Resources' && contentsDirectory === 'Contents' && bundlePath.endsWith('.app')) {
      return bundlePath;
    }

    return null;
  }

  if (path.basename(asarDirectory) !== 'resources') {
    return null;
  }

  return path.dirname(asarDirectory);
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findPaths(rootPath, predicate, maxDepth = 4, depth = 0) {
  const matches = [];
  let entries = [];

  try {
    entries = await fsp.readdir(rootPath, { withFileTypes: true });
  } catch {
    return matches;
  }

  for (const entry of entries) {
    const candidatePath = path.join(rootPath, entry.name);
    if (await predicate(candidatePath, entry, depth)) {
      matches.push(candidatePath);
    }

    if (entry.isDirectory() && depth < maxDepth) {
      matches.push(...await findPaths(candidatePath, predicate, maxDepth, depth + 1));
    }
  }

  return matches;
}

async function resetOutputDirectories() {
  await fsp.rm(outDir, { recursive: true, force: true });
  await fsp.rm(packageDir, { recursive: true, force: true });
  await fsp.mkdir(packageDir, { recursive: true });
}

function resolveUnpackedDestination(platform, arch) {
  if (platform === 'linux') {
    return path.join(packageDir, 'linux-unpacked');
  }

  if (platform === 'win32') {
    return path.join(packageDir, 'win-unpacked');
  }

  return path.join(packageDir, arch === 'arm64' ? 'mac-arm64' : 'mac');
}

async function findFallbackPackagedPath(platform, arch) {
  const executableName = platform === 'win32' ? `${packageJson.productName || packageJson.name}.exe` : null;
  const fallbackExecutableName = platform === 'linux' ? `${packageJson.productName || packageJson.name}` : null;
  const asarPaths = await findPaths(outDir, async (candidatePath, entry) => (
    entry.isFile() && entry.name === 'app.asar'
  ), 8);
  const candidateRoots = unique(
    asarPaths
      .map(asarPath => inferPackagedRootFromAsar(asarPath, platform))
      .filter(Boolean),
  ).sort((left, right) => left.localeCompare(right));

  for (const candidateRoot of candidateRoots) {
    if (platform === 'win32') {
      if (await pathExists(path.join(candidateRoot, executableName))) {
        return candidateRoot;
      }
      continue;
    }

    if (platform === 'linux' && fallbackExecutableName) {
      if (await pathExists(path.join(candidateRoot, fallbackExecutableName))) {
        return candidateRoot;
      }
    }

    return candidateRoot;
  }

  if (platform === 'darwin') {
    const bundles = await findPaths(outDir, async (candidatePath, entry) => entry.isDirectory() && entry.name.endsWith('.app'), 8);
    return bundles[0] || null;
  }

  return null;
}

async function resolvePackagedApplicationPath(platform, arch, packagedPath) {
  if (packagedPath && await pathExists(packagedPath)) {
    return packagedPath;
  }

  const fallbackPath = await findFallbackPackagedPath(platform, arch);
  if (fallbackPath) {
    console.warn(`[electron-forge] Using fallback packaged application path from ${path.relative(projectRoot, fallbackPath)}`);
  }

  return fallbackPath;
}

async function stagePackagedApplication(platform, arch, packagedPath) {
  const resolvedPackagedPath = await resolvePackagedApplicationPath(platform, arch, packagedPath);
  if (!resolvedPackagedPath) {
    throw new Error(`Unable to locate packaged application output for ${platform}/${arch} under ${outDir}`);
  }

  const destination = resolveUnpackedDestination(platform, arch);
  await fsp.rm(destination, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(destination), { recursive: true });

  await fsp.cp(resolvedPackagedPath, destination, { recursive: true });
  await materializeForgePackagingResources(destination, platform);
  console.log(`[electron-forge] staged unpacked application ${path.relative(projectRoot, destination)}`);
  return destination;
}

function createDevMsixDistributionMetadata() {
  return {
    schemaVersion: 1,
    mode: 'fusion',
    channel: 'win-store',
    extensions: {
      source: 'msix-dev-registration-layout',
    },
  };
}

function createDevRegisterManifest(manifestContent) {
  return String(manifestContent || '').replace(
    /\bExecutable=(['"])app[\\/]/g,
    'Executable=$1',
  );
}

function resolveDevMsixRegistrationStageDir(stageDir) {
  const resolvedStageDir = path.resolve(stageDir);
  return path.join(
    path.dirname(resolvedStageDir),
    `${path.basename(resolvedStageDir)}-dev-registration`,
  );
}

async function syncMsixDeveloperRegistrationLayout(unpackedDir, options = {}) {
  const {
    assetsPath,
    manifestPath,
    stageDir,
  } = options;
  const resolvedStageDir = stageDir ? path.resolve(stageDir) : null;
  const resolvedManifestPath = manifestPath ? path.resolve(manifestPath) : null;
  const resolvedAssetsPath = assetsPath ? path.resolve(assetsPath) : null;

  if (!resolvedStageDir || !resolvedManifestPath || !resolvedAssetsPath) {
    throw new Error('syncMsixDeveloperRegistrationLayout requires stageDir, manifestPath, and assetsPath.');
  }

  const stageAppDir = path.join(resolvedStageDir, 'app');
  const manifestContent = await fsp.readFile(resolvedManifestPath, 'utf8');
  await fsp.rm(resolvedStageDir, { recursive: true, force: true });
  await fsp.mkdir(resolvedStageDir, { recursive: true });
  await fsp.cp(unpackedDir, stageAppDir, { recursive: true });
  await fsp.writeFile(
    path.join(stageAppDir, 'AppxManifest.xml'),
    createDevRegisterManifest(manifestContent),
    'utf8',
  );
  await fsp.cp(resolvedAssetsPath, path.join(stageAppDir, 'Assets'), { recursive: true });
  await fsp.mkdir(path.join(stageAppDir, 'resources'), { recursive: true });
  await fsp.writeFile(
    path.join(stageAppDir, 'resources', 'distribution-metadata.json'),
    `${JSON.stringify(createDevMsixDistributionMetadata(), null, 2)}\n`,
    'utf8',
  );
  console.log(`[electron-forge] synchronized dev MSIX registration layout ${path.relative(projectRoot, stageAppDir)}`);
  return stageAppDir;
}

function mapForgeTargets(platform, targets) {
  const targetMap = {
    linux: {
      appimage: '@reforged/maker-appimage',
      zip: '@electron-forge/maker-zip',
    },
    win32: {
      portable: '@rabbitholesyndrome/electron-forge-maker-portable',
      nsis: '@electron-addons/electron-forge-maker-nsis',
      msix: '@electron-forge/maker-msix',
    },
    darwin: {
      dmg: '@electron-forge/maker-dmg',
      zip: '@electron-forge/maker-zip',
    },
  };

  return targets
    .filter(target => target !== 'tar.gz')
    .map(target => targetMap[platform]?.[target] || target);
}

function getExpectedForgeArtifactPaths(platform, arch, targets) {
  const normalizedTargets = unique(targets.map(target => String(target).trim().toLowerCase()).filter(Boolean));

  if (platform !== 'darwin') {
    return [];
  }

  const makeDir = path.join(outDir, 'make');
  const expected = [];

  if (normalizedTargets.includes('dmg')) {
    expected.push(path.join(makeDir, `${packageJson.productName || packageJson.name}-${packageJson.version}-${arch}.dmg`));
  }

  if (normalizedTargets.includes('zip')) {
    expected.push(path.join(makeDir, 'zip', 'darwin', arch, `${packageJson.productName || packageJson.name}-${platform}-${arch}-${packageJson.version}.zip`));
  }

  return expected;
}

function isMacDmgDetachRaceError(error, options) {
  if (options.platform !== 'darwin') {
    return false;
  }

  const normalizedTargets = unique(options.targets.map(target => String(target).trim().toLowerCase()).filter(Boolean));
  if (normalizedTargets.length !== 1 || normalizedTargets[0] !== 'dmg') {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('hdiutil detach') && message.includes('No such file or directory');
}

async function recoverMacDmgDetachRace(error, options) {
  if (!isMacDmgDetachRaceError(error, options)) {
    return null;
  }

  const expectedArtifacts = getExpectedForgeArtifactPaths(options.platform, options.arch, options.targets);
  const recoveredArtifacts = [];

  for (const artifactPath of expectedArtifacts) {
    try {
      const stats = await fsp.stat(artifactPath);
      if (stats.isFile()) {
        recoveredArtifacts.push(artifactPath);
      }
    } catch {
      return null;
    }
  }

  if (recoveredArtifacts.length === 0) {
    return null;
  }

  console.warn('[electron-forge] Ignoring macOS DMG detach race after artifact creation completed');
  return [{
    artifacts: recoveredArtifacts,
    packageJSON: packageJson,
    platform: options.platform,
    arch: options.arch,
  }];
}

async function collectArtifacts(makeResults) {
  let artifactPaths = unique(makeResults.flatMap(result => result.artifacts));
  if (artifactPaths.length === 0) {
    artifactPaths = await findFallbackMakeArtifacts();
    if (artifactPaths.length > 0) {
      console.warn(`[electron-forge] Recovered Forge artifacts from ${path.relative(projectRoot, path.join(outDir, 'make'))}`);
    }
  }

  for (const artifactPath of artifactPaths) {
    const stats = await fsp.stat(artifactPath);
    if (!stats.isFile()) {
      continue;
    }

    const destination = path.join(packageDir, path.basename(artifactPath));
    await fsp.rm(destination, { force: true });
    await fsp.copyFile(artifactPath, destination);
    console.log(`[electron-forge] collected ${path.relative(projectRoot, destination)}`);
  }
}

async function findFallbackMakeArtifacts() {
  const makeRoot = path.join(outDir, 'make');
  const supportedExtensions = new Set(['.appimage', '.dmg', '.exe', '.msix', '.zip']);
  const artifactPaths = await findPaths(makeRoot, async (candidatePath, entry) => {
    if (!entry.isFile()) {
      return false;
    }

    return supportedExtensions.has(path.extname(candidatePath).toLowerCase());
  }, 5);

  return artifactPaths.sort((left, right) => left.localeCompare(right));
}

async function createTarGzArtifact(unpackedDir, platform, arch) {
  const artifactName = `${sanitizeArtifactNameSegment(packageJson.productName || packageJson.name)}-${packageJson.version}-${platform}-${arch}.tar.gz`;
  const artifactPath = path.join(packageDir, artifactName);

  await fsp.rm(artifactPath, { force: true });
  run('tar', ['-C', path.dirname(unpackedDir), '-czf', artifactPath, path.basename(unpackedDir)]);
  console.log(`[electron-forge] collected ${path.relative(projectRoot, artifactPath)}`);
}

function runForgeCli(subcommand, args) {
  const forgeCliScriptPath = resolveForgeCliScriptPath();
  run(process.execPath, [forgeCliScriptPath, subcommand, ...args, projectRoot]);
}

async function main() {
  ensureDarwinFileLimit();

  const options = parseArgs(process.argv.slice(2));
  await resetOutputDirectories();

  if (options.platform === 'win32') {
    await buildStorePurchaseAddon({ arch: options.arch });
  }

  runForgeCli('package', [
    '--platform',
    options.platform,
    '--arch',
    options.arch,
  ]);

  const unpackedDir = await stagePackagedApplication(options.platform, options.arch, null);

  if (options.platform === 'win32' && options.targets.includes('msix')) {
    const { storeConfig } = await loadStorePackageConfig();
    const { generatedAssetsPath, manifestOutputPath } = getMsixPaths(projectRoot);
    await syncMsixDeveloperRegistrationLayout(unpackedDir, {
      stageDir: resolveDevMsixRegistrationStageDir(path.resolve(projectRoot, storeConfig.stageDirectory)),
      manifestPath: manifestOutputPath,
      assetsPath: generatedAssetsPath,
    });
  }

  if (options.packageOnly) {
    return;
  }

  const forgeTargets = mapForgeTargets(options.platform, options.targets);
  if (forgeTargets.length > 0) {
    try {
      runForgeCli('make', [
        '--platform',
        options.platform,
        '--arch',
        options.arch,
        '--skip-package',
        '--targets',
        forgeTargets.join(','),
      ]);
    } catch (error) {
      const recoveredArtifacts = await recoverMacDmgDetachRace(error, options);
      if (!recoveredArtifacts) {
        throw error;
      }
    }

    await collectArtifacts([]);
  }

  if (options.targets.includes('tar.gz')) {
    await createTarGzArtifact(unpackedDir, options.platform, options.arch);
  }
}

export {
  createDevRegisterManifest,
  getExpectedForgeArtifactPaths,
  isMacDmgDetachRaceError,
  main,
  recoverMacDmgDetachRace,
  resolveDevMsixRegistrationStageDir,
  syncMsixDeveloperRegistrationLayout,
};
