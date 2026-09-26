import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export const PM2_TOOLCHAIN_PREFIX_RELATIVE_PATH = 'npm-pm2';
export const PM2_TOOLCHAIN_MARKER_FILE = '.hagicode-pm2-toolchain.json';

export function resolvePm2ToolchainPaths(runtimeRoot, platform = process.platform) {
  const root = path.resolve(runtimeRoot);
  const nodeRelativePath = platform === 'win32'
    ? 'components/node/runtime/node.exe'
    : 'components/node/runtime/bin/node';
  const nodePath = path.join(root, ...nodeRelativePath.split('/'));
  const npmPrefix = path.join(root, ...PM2_TOOLCHAIN_PREFIX_RELATIVE_PATH.split('/'));
  const pm2EntryRelativePath = platform === 'win32'
    ? 'npm-pm2/node_modules/pm2/bin/pm2'
    : 'npm-pm2/lib/node_modules/pm2/bin/pm2';
  const pm2Entrypoint = path.join(root, ...pm2EntryRelativePath.split('/'));

  return {
    root,
    nodeRelativePath,
    pm2EntryRelativePath,
    nodePath,
    nodeRuntimeDirectory: path.join(root, 'components', 'node', 'runtime'),
    npmPrefix,
    pm2Entrypoint,
    markerPath: path.join(npmPrefix, PM2_TOOLCHAIN_MARKER_FILE),
  };
}

export async function validatePm2Toolchain(runtimeRoot, platform = process.platform) {
  const paths = resolvePm2ToolchainPaths(runtimeRoot, platform);
  await requireFile(paths.nodePath, `Bundled PM2 Node executable is missing: ${paths.nodePath}`);
  if (platform !== 'win32') {
    await fs.access(paths.nodePath, constants.X_OK).catch((error) => {
      throw new Error(`Bundled PM2 Node executable is not executable: ${paths.nodePath}`, { cause: error });
    });
  }
  await requireFile(paths.pm2Entrypoint, `Managed PM2 entrypoint is missing: ${paths.pm2Entrypoint}`);
  await validatePm2OnlyNodeLayout(paths.nodeRuntimeDirectory, paths.npmPrefix);

  const pm2PackageRoot = path.join(
    paths.npmPrefix,
    platform === 'win32' ? 'node_modules' : path.join('lib', 'node_modules'),
    'pm2',
  );
  const pending = [await readPackageManifest(pm2PackageRoot, 'pm2')];
  const visited = new Set();
  const requiredFiles = new Set([
    paths.nodeRelativePath,
    paths.pm2EntryRelativePath,
  ]);

  while (pending.length > 0) {
    const manifestPath = pending.pop();
    const resolvedManifestPath = path.resolve(manifestPath);
    if (visited.has(resolvedManifestPath)) {
      continue;
    }
    visited.add(resolvedManifestPath);

    const packageManifest = JSON.parse(await fs.readFile(resolvedManifestPath, 'utf8'));
    const packageRoot = path.dirname(resolvedManifestPath);
    await collectPackageFiles(packageRoot, paths.root, requiredFiles);
    const dependencySearchRoot = platform === 'win32'
      ? paths.npmPrefix
      : path.join(paths.npmPrefix, 'lib');
    for (const dependencyName of Object.keys(packageManifest.dependencies ?? {})) {
      const dependencyManifestPath = await findDependencyManifestPath(
        packageRoot,
        dependencySearchRoot,
        dependencyName,
      );
      if (!dependencyManifestPath) {
        throw new Error(
          `Managed PM2 dependency "${dependencyName}" required by "${packageManifest.name}" is missing from ${paths.npmPrefix}.`,
        );
      }
      pending.push(dependencyManifestPath);
    }

    const relativePackageRoot = path.relative(paths.npmPrefix, packageRoot);
    if (
      !packageManifest.name
      || relativePackageRoot === '..'
      || relativePackageRoot.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativePackageRoot)
    ) {
      throw new Error(`Managed PM2 package is outside the configured npm prefix: ${resolvedManifestPath}`);
    }
  }

  return {
    ...paths,
    requiredFiles: [...requiredFiles].sort(),
    pm2Version: JSON.parse(await fs.readFile(path.join(pm2PackageRoot, 'package.json'), 'utf8')).version,
  };
}

async function validatePm2OnlyNodeLayout(nodeRuntimeRoot, npmPrefix) {
  const nodeEntries = await fs.readdir(nodeRuntimeRoot);
  const includedNodeTools = nodeEntries.filter((entry) =>
    !['node.exe', 'bin', '.hagicode-runtime.json'].includes(entry.toLowerCase()));
  if (nodeEntries.includes('bin')) {
    const binEntries = await fs.readdir(path.join(nodeRuntimeRoot, 'bin'));
    includedNodeTools.push(...binEntries.filter((entry) => entry !== 'node'));
  }
  if (includedNodeTools.length > 0) {
    throw new Error(
      `PM2-only Node runtime unexpectedly includes npm/corepack tooling: ${includedNodeTools.join(', ')}.`,
    );
  }

  const forbiddenPaths = [
    path.join(npmPrefix, 'bin'),
    path.join(npmPrefix, 'node_modules', '.bin'),
    path.join(npmPrefix, 'lib', 'node_modules', '.bin'),
    path.join(npmPrefix, 'node_modules', '.package-lock.json'),
    path.join(npmPrefix, 'lib', 'node_modules', '.package-lock.json'),
    path.join(npmPrefix, 'package-lock.json'),
    path.join(npmPrefix, 'npm-cache'),
  ];
  for (const targetPath of forbiddenPaths) {
    try {
      await fs.access(targetPath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
    throw new Error(`PM2-only runtime package contains an unnecessary npm tool or cache: ${targetPath}`);
  }
}

async function collectPackageFiles(packageRoot, runtimeRoot, files) {
  const entries = await fs.readdir(packageRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.bin') {
      continue;
    }
    const targetPath = path.join(packageRoot, entry.name);
    if (entry.isDirectory()) {
      await collectPackageFiles(targetPath, runtimeRoot, files);
    } else if (entry.isFile()) {
      files.add(path.relative(runtimeRoot, targetPath).split(path.sep).join('/'));
    } else if (entry.isSymbolicLink()) {
      throw new Error(`Managed PM2 package contains an unresolved symbolic link: ${targetPath}`);
    }
  }
}

async function requireFile(targetPath, message) {
  try {
    const stats = await fs.stat(targetPath);
    if (!stats.isFile()) {
      throw new Error(message);
    }
  } catch (error) {
    if (error instanceof Error && error.message === message) {
      throw error;
    }
    throw new Error(message, { cause: error });
  }
}

async function readPackageManifest(packageRoot, packageName) {
  const manifestPath = path.join(packageRoot, 'package.json');
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    if (manifest.name !== packageName) {
      throw new Error(`Expected package ${packageName} at ${manifestPath}.`);
    }
  } catch (error) {
    throw new Error(`Managed PM2 package manifest is missing or invalid: ${manifestPath}`, { cause: error });
  }
  return manifestPath;
}

async function findDependencyManifestPath(packageRoot, searchRoot, packageName) {
  let currentDirectory = packageRoot;
  while (true) {
    const manifestPath = path.join(currentDirectory, 'node_modules', ...packageName.split('/'), 'package.json');
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      if (manifest.name === packageName) {
        return manifestPath;
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw new Error(`Unable to read PM2 dependency manifest ${manifestPath}.`, { cause: error });
      }
    }
    const parentDirectory = path.dirname(currentDirectory);
    if (currentDirectory === searchRoot || parentDirectory === currentDirectory) {
      return null;
    }
    currentDirectory = parentDirectory;
  }
}
