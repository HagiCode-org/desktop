import { execa } from 'execa';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { load } from 'js-yaml';
import {
  assertGlobalHagiscriptAvailable,
  resolveGlobalHagiscriptPackageRoot,
} from './global-hagiscript.js';
import {
  PM2_TOOLCHAIN_MARKER_FILE,
  resolvePm2ToolchainPaths,
  validatePm2Toolchain,
} from './pm2-toolchain.js';

const MINIMUM_HAGISCRIPT_VERSION = '0.3.10';

export async function prepareDesktopPm2Toolchain(options = {}) {
  const platform = options.platform ?? process.platform;
  if (!['win32', 'linux', 'darwin'].includes(platform)) {
    throw new Error(`The bundled PM2 toolchain does not support this platform: ${platform}.`);
  }
  if (platform !== process.platform) {
    throw new Error(`The bundled PM2 toolchain must be prepared on its target platform (${platform}).`);
  }

  assertGlobalHagiscriptAvailable(MINIMUM_HAGISCRIPT_VERSION);
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const resourceRoot = path.join(projectRoot, 'resources');
  const paths = resolvePm2ToolchainPaths(resourceRoot, platform);
  const pinnedRuntime = await readPinnedHagiscriptRuntime();
  const existing = await readExistingToolchainMarker(paths.markerPath);
  if (
    existing?.nodeVersion === pinnedRuntime.nodeVersion
    && existing?.pm2Version === pinnedRuntime.pm2Version
    && await fileExists(paths.nodePath)
    && await fileExists(paths.pm2Entrypoint)
  ) {
    await pruneNodeRuntime(paths.nodeRuntimeDirectory, paths.nodePath);
    const validation = await validatePm2Toolchain(resourceRoot, platform);
    return buildToolchainMetadata(validation, pinnedRuntime);
  }

  await fs.rm(paths.nodeRuntimeDirectory, { recursive: true, force: true });
  await fs.rm(paths.npmPrefix, { recursive: true, force: true });
  await fs.mkdir(path.dirname(paths.nodeRuntimeDirectory), { recursive: true });

  const { installNodeRuntime } = await import('@hagicode/hagiscript-sdk');
  await installNodeRuntime({
    targetDirectory: paths.nodeRuntimeDirectory,
    versionSelector: pinnedRuntime.nodeVersion,
    downloadCacheEnabled: false,
  });

  const npmCliPath = platform === 'win32'
    ? path.join(paths.nodeRuntimeDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : path.join(paths.nodeRuntimeDirectory, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!(await fileExists(npmCliPath))) {
    throw new Error(`Bundled Node staging did not provide its build-time npm CLI: ${npmCliPath}`);
  }

  const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-npm-cache-'));
  try {
    await execa(paths.nodePath, [
      npmCliPath,
      'install',
      '--prefix',
      paths.npmPrefix,
      '--global',
      '--no-save',
      '--package-lock=false',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--cache',
      cacheRoot,
      `pm2@${pinnedRuntime.pm2Version}`,
    ], {
      cwd: projectRoot,
      stdin: 'ignore',
      stdout: 'inherit',
      stderr: 'inherit',
    });
  } finally {
    await fs.rm(cacheRoot, { recursive: true, force: true });
  }

  await pruneNodeRuntime(paths.nodeRuntimeDirectory, paths.nodePath);
  await fs.rm(path.join(paths.npmPrefix, 'bin'), { recursive: true, force: true });
  await Promise.all([
    fs.rm(path.join(paths.npmPrefix, 'node_modules', '.package-lock.json'), { force: true }),
    fs.rm(path.join(paths.npmPrefix, 'lib', 'node_modules', '.package-lock.json'), { force: true }),
    fs.rm(path.join(paths.npmPrefix, 'package-lock.json'), { force: true }),
    fs.rm(path.join(paths.npmPrefix, 'package.json'), { force: true }),
  ]);
  const validation = await validatePm2Toolchain(resourceRoot, platform);
  if (validation.pm2Version !== pinnedRuntime.pm2Version) {
    throw new Error(
      `Bundled PM2 version mismatch: expected ${pinnedRuntime.pm2Version}, found ${validation.pm2Version ?? 'unknown'}.`,
    );
  }

  const metadata = buildToolchainMetadata(validation, pinnedRuntime);
  await fs.mkdir(paths.npmPrefix, { recursive: true });
  await fs.writeFile(paths.markerPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return metadata;
}

async function readPinnedHagiscriptRuntime() {
  const packageRoot = resolveGlobalHagiscriptPackageRoot(MINIMUM_HAGISCRIPT_VERSION);
  const manifestPath = path.join(packageRoot, 'runtime', 'manifest.yaml');
  const manifest = load(await fs.readFile(manifestPath, 'utf8'));
  const nodeVersion = manifest?.components?.find((component) => component.name === 'node')?.version;
  const pm2Version = manifest?.npmSync?.packages?.pm2?.version;
  if (typeof nodeVersion !== 'string' || !nodeVersion.trim()) {
    throw new Error(`HagiScript runtime manifest is missing its pinned Node version: ${manifestPath}`);
  }
  if (typeof pm2Version !== 'string' || !pm2Version.trim()) {
    throw new Error(`HagiScript runtime manifest is missing its pinned PM2 version: ${manifestPath}`);
  }
  return { nodeVersion: nodeVersion.trim(), pm2Version: pm2Version.trim() };
}

async function readExistingToolchainMarker(markerPath) {
  try {
    return JSON.parse(await fs.readFile(markerPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw new Error(`Unable to read bundled PM2 toolchain metadata at ${markerPath}.`, { cause: error });
  }
}

async function fileExists(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function pruneNodeRuntime(nodeRuntimeDirectory, nodePath) {
  async function prune(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entryPath === nodePath || entryPath === path.join(nodeRuntimeDirectory, '.hagicode-runtime.json')) {
        continue;
      }
      if (entry.isDirectory() && nodePath.startsWith(`${entryPath}${path.sep}`)) {
        await prune(entryPath);
      } else {
        await fs.rm(entryPath, { recursive: true, force: true });
      }
    }
  }
  await prune(nodeRuntimeDirectory);

  if (!(await fileExists(nodePath))) {
    throw new Error(`Bundled PM2 Node executable is missing after runtime pruning: ${nodePath}`);
  }
}

function buildToolchainMetadata(validation, pinnedRuntime) {
  return {
    validationPassed: true,
    nodeVersion: pinnedRuntime.nodeVersion,
    pm2Version: validation.pm2Version,
    nodeExecutable: path.relative(validation.root, validation.nodePath).split(path.sep).join('/'),
    pm2Entrypoint: path.relative(validation.root, validation.pm2Entrypoint).split(path.sep).join('/'),
    requiredFiles: validation.requiredFiles,
  };
}
