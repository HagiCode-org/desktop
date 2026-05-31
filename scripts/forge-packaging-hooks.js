import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const runtimeSourceRoot = path.join(projectRoot, 'resources');
const signingStashRoot = path.join(projectRoot, 'build', '.forge-signing-stash');

function resolveResourcesPath(buildPath, platform) {
  return platform === 'darwin'
    ? path.join(buildPath, 'Contents', 'Resources')
    : path.join(buildPath, 'resources');
}

function resolveRuntimeRoot(buildPath, platform) {
  return path.join(resolveResourcesPath(buildPath, platform), 'extra', 'runtime');
}

function resolvePortableFixedRoot(buildPath, platform) {
  return path.join(resolveResourcesPath(buildPath, platform), 'extra', 'portable-fixed', 'current');
}

function resolveSigningPaths(buildPath, platform, arch) {
  const runtimeRoot = resolveRuntimeRoot(buildPath, platform);
  const stashPath = path.join(signingStashRoot, `${platform}-${arch}`, path.basename(buildPath), 'runtime');
  return {
    runtimeRoot,
    stashPath,
    stashRoot: path.dirname(stashPath),
  };
}

async function copyDirectoryIfExists(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
  await fsp.rm(destinationPath, { recursive: true, force: true });
  await fsp.cp(sourcePath, destinationPath, { recursive: true });
}

async function copyFileIfExists(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
  await fsp.copyFile(sourcePath, destinationPath);
}

async function makeExecutableIfPresent(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  await fsp.chmod(targetPath, 0o755);
}

export async function stageForgePackagingResources(buildPath, _electronVersion, platform, arch) {
  const runtimeRoot = resolveRuntimeRoot(buildPath, platform);

  await copyDirectoryIfExists(path.join(runtimeSourceRoot, 'bin'), path.join(runtimeRoot, 'bin'));
  await copyDirectoryIfExists(path.join(runtimeSourceRoot, 'components'), path.join(runtimeRoot, 'components'));
  await copyDirectoryIfExists(
    path.join(runtimeSourceRoot, 'portable-fixed', 'current'),
    resolvePortableFixedRoot(buildPath, platform),
  );

  if (platform === 'linux') {
    const wrapperPath = path.join(buildPath, 'hagicode-steam-wrapper.sh');
    const sandboxPath = path.join(buildPath, 'hagicode-steam-sandbox.sh');

    await copyFileIfExists(path.join(runtimeSourceRoot, 'linux', 'hagicode-steam-wrapper.sh'), wrapperPath);
    await copyFileIfExists(path.join(runtimeSourceRoot, 'linux', 'hagicode-steam-sandbox.sh'), sandboxPath);
    await makeExecutableIfPresent(wrapperPath);
    await makeExecutableIfPresent(sandboxPath);
  }

  if (platform !== 'darwin' || !fs.existsSync(runtimeRoot)) {
    return;
  }

  const signingPaths = resolveSigningPaths(buildPath, platform, arch);
  await fsp.rm(signingPaths.stashPath, { recursive: true, force: true });
  await fsp.mkdir(signingPaths.stashRoot, { recursive: true });
  await fsp.rename(signingPaths.runtimeRoot, signingPaths.stashPath);
  console.log(`[forge-packaging-hooks] Stashed packaged runtime before macOS signing: ${signingPaths.stashPath}`);
}

export async function restoreForgePackagingResources(finalPath, _electronVersion, platform, arch) {
  if (platform !== 'darwin') {
    return;
  }

  const signingPaths = resolveSigningPaths(finalPath, platform, arch);
  if (!fs.existsSync(signingPaths.stashPath)) {
    return;
  }

  await fsp.rm(signingPaths.runtimeRoot, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(signingPaths.runtimeRoot), { recursive: true });
  await fsp.rename(signingPaths.stashPath, signingPaths.runtimeRoot);
  await fsp.rm(signingStashRoot, { recursive: true, force: true });
  console.log(`[forge-packaging-hooks] Restored packaged runtime after macOS signing: ${signingPaths.runtimeRoot}`);
}
