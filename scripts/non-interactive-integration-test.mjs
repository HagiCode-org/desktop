#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import AdmZip from 'adm-zip';

const projectRoot = process.cwd();
const pkgRoot = path.join(projectRoot, 'pkg');
const runtimeVerifyArgs = ['runtime', 'verify'];
const dependencyInstallArgs = ['deps', 'install', '--claude-code', '--codex'];
const runtimeLifecycleArgs = ['runtime', 'lifecycle'];
const defaultCommandTimeoutMs = 240_000;
export const expectedInstalledPackageIds = ['pm2', 'claude-code', 'codex'];
const interestingDiagnosticBasenames = new Set([
  'non-interactive-startup.log',
  'launch-contract.json',
  'state.json',
  '.env',
  'ecosystem.config.js',
  'ecosystem.config.cjs',
]);

function log(message) {
  console.log(`[non-interactive-integration] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function readDiagnosticFile(diagnosticLogPath) {
  if (!diagnosticLogPath || !pathExists(diagnosticLogPath)) {
    return null;
  }

  try {
    return fs.readFileSync(diagnosticLogPath, 'utf8');
  } catch (error) {
    return `Failed to read diagnostic log ${diagnosticLogPath}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function shouldKeepTempRoot() {
  const value = process.env.HAGICODE_NON_INTERACTIVE_INTEGRATION_KEEP_TEMP?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableCleanupError(error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return code === 'ENOTEMPTY' || code === 'EBUSY' || code === 'EPERM';
}

async function removePathWithRetries(targetPath, {
  maxAttempts = 6,
  retryDelayMs = 500,
} = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fsp.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableCleanupError(error) || attempt === maxAttempts) {
        throw error;
      }
      await delay(retryDelayMs * attempt);
    }
  }

  if (lastError) {
    throw lastError;
  }
}

async function loadDesktopManagedPathHelpers() {
  const desktopRuntimePathsModulePath = path.join(projectRoot, 'dist', 'main', 'desktop-runtime-paths.js');
  const portableToolchainPathsModulePath = path.join(projectRoot, 'dist', 'main', 'portable-toolchain-paths.js');
  if (!pathExists(desktopRuntimePathsModulePath) || !pathExists(portableToolchainPathsModulePath)) {
    fail('Compiled Desktop path helpers are missing under dist/main. Run npm run build:tsc before the packaged integration harness.');
  }

  const desktopRuntimePathsModule = await import(pathToFileURL(desktopRuntimePathsModulePath).href);
  const portableToolchainPathsModule = await import(pathToFileURL(portableToolchainPathsModulePath).href);
  return {
    resolveDesktopRuntimeDataHome: desktopRuntimePathsModule.resolveDesktopRuntimeDataHome,
    buildNodeMajorNpmGlobalPaths: portableToolchainPathsModule.buildNodeMajorNpmGlobalPaths,
  };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function pathExists(targetPath) {
  return fs.existsSync(targetPath);
}

function isExecutableFile(targetPath) {
  try {
    const stat = fs.statSync(targetPath);
    return stat.isFile() && (process.platform === 'win32' || (stat.mode & 0o111) !== 0);
  } catch {
    return false;
  }
}

function walkFiles(root) {
  const files = [];
  if (!pathExists(root)) {
    return files;
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function findFilesWithExtension(root, extension) {
  return walkFiles(root)
    .filter((targetPath) => targetPath.toLowerCase().endsWith(extension))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function findUnpackedArtifactRoot() {
  const platformRoots = process.platform === 'win32'
    ? ['win-unpacked']
    : process.platform === 'darwin'
      ? ['mac', 'mac-arm64', 'mac-universal']
      : ['linux-unpacked'];

  for (const rootName of platformRoots) {
    const candidate = path.join(pkgRoot, rootName);
    if (pathExists(candidate) && isRunnableArtifactRoot(candidate)) {
      return candidate;
    }

    if (pathExists(candidate)) {
      log(`skipping unpacked artifact candidate without runnable Desktop resources: ${candidate}`);
    }
  }

  return null;
}

export function findZipArtifact() {
  if (!pathExists(pkgRoot)) {
    return null;
  }

  const scoreZipArtifact = (zipPath) => {
    const name = path.basename(zipPath).toLowerCase();
    if (process.platform === 'win32') {
      if (name.includes('unpacked')) return 200;
      return 0;
    }

    if (process.platform === 'darwin') {
      if (process.arch === 'arm64') {
        if (name.includes('universal')) return 300;
        if (name.includes('arm64')) return 200;
        if (name.includes('-mac.zip') || name.endsWith('mac.zip')) return 100;
        if (name.includes('x64')) return 0;
      } else {
        if (name.includes('universal')) return 300;
        if (name.includes('x64')) return 200;
        if (name.includes('-mac.zip') || name.endsWith('mac.zip')) return 100;
        if (name.includes('arm64')) return 0;
      }
    }

    return 0;
  };

  const zips = findFilesWithExtension(pkgRoot, '.zip')
    .sort((a, b) => {
      const scoreDelta = scoreZipArtifact(b) - scoreZipArtifact(a);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    });

  return zips[0] ?? null;
}

export function findTarGzArtifact() {
  if (!pathExists(pkgRoot)) {
    return null;
  }

  const tarballs = findFilesWithExtension(pkgRoot, '.tar.gz');

  return tarballs[0] ?? null;
}

function shouldRestoreExecutableBit(filePath) {
  if (process.platform === 'win32') {
    return false;
  }

  const normalized = filePath.replace(/\\/g, '/');
  const baseName = path.basename(normalized).toLowerCase();
  if (baseName.endsWith('.sh')) {
    return true;
  }

  if (normalized.includes('/Contents/MacOS/')) {
    return true;
  }

  if (normalized.includes('/resources/extra/') && (normalized.includes('/bin/') || path.extname(baseName) === '')) {
    return true;
  }

  return path.extname(baseName) === '';
}

async function restoreExecutablePermissions(root) {
  if (process.platform === 'win32') {
    return;
  }

  const files = walkFiles(root);
  await Promise.all(files.map(async (filePath) => {
    if (!shouldRestoreExecutableBit(filePath)) {
      return;
    }

    const stat = await fsp.stat(filePath);
    if ((stat.mode & 0o111) !== 0) {
      return;
    }

    await fsp.chmod(filePath, stat.mode | 0o755);
  }));
}

async function extractZipArtifact(zipArtifact, stagedRoot) {
  if (process.platform === 'darwin') {
    const result = await runCommand('ditto', ['-x', '-k', zipArtifact, stagedRoot]);
    if (result.code !== 0) {
      fail(`Failed to extract macOS ZIP artifact with ditto.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    }
    return;
  }

  new AdmZip(zipArtifact).extractAllTo(stagedRoot, true);
  await restoreExecutablePermissions(stagedRoot);
}

async function extractTarGzArtifact(tarGzArtifact, stagedRoot) {
  const result = await runCommand('tar', ['-xzf', tarGzArtifact, '-C', stagedRoot]);
  if (result.code !== 0) {
    fail(`Failed to extract tar.gz artifact.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

async function copyArtifactToPathWithSpaces() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'hagicode cli integration '));
  const stagedRoot = path.join(tempRoot, 'Desktop artifact with spaces');
  await fsp.mkdir(stagedRoot, { recursive: true });

  const unpackedRoot = findUnpackedArtifactRoot();
  if (unpackedRoot) {
    const targetRoot = path.join(stagedRoot, path.basename(unpackedRoot));
    await fsp.cp(unpackedRoot, targetRoot, { recursive: true });
    return { tempRoot, artifactRoot: targetRoot, source: unpackedRoot };
  }

  if (process.platform === 'linux') {
    const tarGzArtifact = findTarGzArtifact();
    if (tarGzArtifact) {
      await extractTarGzArtifact(tarGzArtifact, stagedRoot);
      return { tempRoot, artifactRoot: stagedRoot, source: tarGzArtifact };
    }
  }

  const zipArtifact = findZipArtifact();
  if (zipArtifact) {
    await extractZipArtifact(zipArtifact, stagedRoot);
    return { tempRoot, artifactRoot: stagedRoot, source: zipArtifact };
  }

  fail(`No unpacked artifact root or packaged archive (.tar.gz/.zip) found under ${pkgRoot}. Build a runnable Desktop artifact first.`);
}

function findMacExecutable(root) {
  const appBundle = walkFiles(root)
    .filter((file) => file.endsWith('.app/Contents/Info.plist'))
    .map((file) => file.slice(0, -'/Contents/Info.plist'.length))
    .sort((a, b) => a.length - b.length)[0];

  if (!appBundle) {
    return null;
  }

  const macosDir = path.join(appBundle, 'Contents', 'MacOS');
  const entries = fs.readdirSync(macosDir)
    .map((entry) => path.join(macosDir, entry))
    .filter((entry) => isExecutableFile(entry));

  return entries[0] ?? null;
}

function findWindowsExecutable(root) {
  const candidates = walkFiles(root)
    .filter((file) => file.toLowerCase().endsWith('.exe'))
    .filter((file) => !path.basename(file).toLowerCase().includes('setup'))
    .filter((file) => !file.toLowerCase().includes(`${path.sep}resources${path.sep}`))
    .sort((a, b) => a.length - b.length);

  return candidates[0] ?? null;
}

function findLinuxExecutable(root) {
  const preferredNames = new Set(['hagicode-desktop', 'hagicode desktop', 'hagicode']);
  const candidates = walkFiles(root)
    .filter((file) => isExecutableFile(file))
    .filter((file) => !file.includes(`${path.sep}resources${path.sep}`))
    .sort((a, b) => {
      const aPreferred = preferredNames.has(path.basename(a).toLowerCase()) ? 0 : 1;
      const bPreferred = preferredNames.has(path.basename(b).toLowerCase()) ? 0 : 1;
      return aPreferred - bPreferred || a.length - b.length;
    });

  return candidates[0] ?? null;
}

function findDesktopExecutable(root) {
  if (process.platform === 'darwin') {
    return findMacExecutable(root);
  }
  if (process.platform === 'win32') {
    return findWindowsExecutable(root);
  }
  return findLinuxExecutable(root);
}

function listRunnableResourceCandidates(root) {
  if (process.platform === 'darwin') {
    return walkFiles(root).filter((file) => (
      file.endsWith(`${path.sep}Contents${path.sep}Resources${path.sep}app.asar`)
      || file.endsWith(`${path.sep}Contents${path.sep}Resources${path.sep}app-update.yml`)
    ));
  }

  return walkFiles(root).filter((file) => (
    file.endsWith(`${path.sep}resources${path.sep}app.asar`)
    || file.endsWith(`${path.sep}resources${path.sep}app-update.yml`)
  ));
}

function isRunnableArtifactRoot(root) {
  const executablePath = findDesktopExecutable(root);
  const resourceCandidates = listRunnableResourceCandidates(root);
  return Boolean(executablePath) && resourceCandidates.length > 0;
}

function runExecutable(executablePath, userDataDir, commandArgs) {
  const requiresLinuxHeadlessSwitches = process.platform === 'linux'
    && !process.env.DISPLAY
    && !process.env.WAYLAND_DISPLAY;
  const requiresLinuxSandboxOverride = process.platform === 'linux';
  const diagnosticLogPath = path.join(userDataDir, 'non-interactive-startup.log');
  const configuredTimeoutMs = Number.parseInt(
    process.env.HAGICODE_NON_INTERACTIVE_INTEGRATION_TIMEOUT_MS ?? '',
    10,
  );
  const commandTimeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
    ? configuredTimeoutMs
    : defaultCommandTimeoutMs;
  const linuxRuntimeArgs = requiresLinuxSandboxOverride
    ? ['--no-sandbox', '--disable-setuid-sandbox']
    : [];
  const headlessRuntimeArgs = requiresLinuxHeadlessSwitches
    ? ['--headless', '--disable-gpu', '--ozone-platform=headless']
    : [];
  const harnessRuntimeArgs = [
    '--hagicode-non-interactive-integration',
    `--hagicode-user-data-dir=${userDataDir}`,
    `--hagicode-non-interactive-log-path=${diagnosticLogPath}`,
  ];
  const launchArgs = [...linuxRuntimeArgs, ...headlessRuntimeArgs, ...harnessRuntimeArgs, ...commandArgs];
  const launchEnv = {
    ...process.env,
    HAGICODE_DESKTOP_USER_DATA_DIR: userDataDir,
    HAGICODE_NON_INTERACTIVE_INTEGRATION: '1',
    HAGICODE_NON_INTERACTIVE_LOG_PATH: diagnosticLogPath,
  };

  if (requiresLinuxSandboxOverride) {
    // The staged integration artifact runs from a user-owned temp directory, so
    // chrome-sandbox cannot keep the root-owned 4755 contract required by the
    // Linux setuid sandbox helper. Reuse the existing Desktop startup override
    // so CI validates non-interactive dependency installation instead of the
    // kernel sandbox packaging path.
    launchEnv.HAGICODE_DISABLE_ELECTRON_SANDBOX = '1';
  }

  return new Promise((resolve) => {
    const child = spawn(executablePath, launchArgs, {
      cwd: path.dirname(executablePath),
      env: launchEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let forceKillTimer = null;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      log(`command timeout exceeded after ${commandTimeoutMs}ms, sending SIGTERM`);
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        log('process still running 10s after SIGTERM, sending SIGKILL');
        child.kill('SIGKILL');
      }, 10_000);
      forceKillTimer.unref?.();
    }, commandTimeoutMs);
    timeoutTimer.unref?.();

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeoutTimer);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      resolve({
        code,
        signal,
        stdout,
        stderr,
        timedOut,
        timeoutMs: commandTimeoutMs,
      });
    });
  });
}

function parseOutputValue(output, label) {
  const match = output.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() ?? null;
}

function assertOutputValue(output, label, expected) {
  const value = parseOutputValue(output, label);
  if (value !== expected) {
    fail(`Expected "${label}" to equal "${expected}" but found "${value ?? '<missing>'}".`);
  }
}

function assertOutputContainsPackage(output, packageId) {
  const line = output.split(/\r?\n/).find((entry) => entry.startsWith(`[${packageId}] status=installed `));
  if (!line) {
    fail(`Missing installed status output for ${packageId}.`);
  }
  if (!line.includes('packageRoot=') || !line.includes('executable=') || !line.includes('resolved=')) {
    fail(`Package output for ${packageId} does not include packageRoot, executable, and resolved path diagnostics.`);
  }
  if (line.includes('<missing>')) {
    fail(`Package output for ${packageId} contains a missing path: ${line}`);
  }
}

function assertPathWithinRoot(candidatePath, rootPath, label) {
  const resolveComparablePath = (targetPath) => {
    if (!targetPath) {
      return null;
    }

    try {
      return fs.realpathSync.native?.(targetPath) ?? fs.realpathSync(targetPath);
    } catch {
      return path.resolve(targetPath);
    }
  };

  const comparableCandidatePath = resolveComparablePath(candidatePath);
  const comparableRootPath = resolveComparablePath(rootPath);
  if (!comparableCandidatePath || !comparableRootPath || !comparableCandidatePath.startsWith(comparableRootPath)) {
    fail(`Expected ${label} to stay under ${rootPath}.\nPath: ${candidatePath ?? '<missing>'}`);
  }
}

function assertPathContainsSpaces(candidatePath, label) {
  if (!candidatePath?.includes(' ')) {
    fail(`Expected ${label} to preserve staged paths with spaces.\nPath: ${candidatePath ?? '<missing>'}`);
  }
}

function assertPathOmitsSpaces(candidatePath, label) {
  if (candidatePath?.includes(' ')) {
    fail(`Expected ${label} to avoid spaces after aliasing.\nPath: ${candidatePath ?? '<missing>'}`);
  }
}

function assertLaunchAliasPath(candidatePath, label, runtimeContext) {
  if (!candidatePath) {
    fail(`Expected ${label} to be present.`);
  }
  if (!pathExists(candidatePath)) {
    fail(`Expected ${label} to exist.\nPath: ${candidatePath}`);
  }

  const resolvedPath = fs.realpathSync(candidatePath);
  assertPathWithinRoot(resolvedPath, runtimeContext.dataHome, `${label} realpath`);

  if (process.platform !== 'win32') {
    assertPathOmitsSpaces(candidatePath, label);
    const aliasRoot = path.join('/tmp', 'hagicode-desktop-path-alias');
    assertPathWithinRoot(candidatePath, aliasRoot, `${label} alias path`);
  }
}

async function readIntegrationDiagnostics(userDataDir) {
  const diagnostics = [];
  const runtimeDataRoot = path.join(userDataDir, 'runtimeData');
  const candidateFiles = walkFiles(userDataDir)
    .filter((targetPath) => {
      const baseName = path.basename(targetPath);
      return baseName.endsWith('.log')
        || interestingDiagnosticBasenames.has(baseName)
        || targetPath.includes(`${path.sep}.pm2${path.sep}`);
    })
    .sort();

  for (const targetPath of candidateFiles) {
    const content = readDiagnosticFile(targetPath);
    if (!content) {
      continue;
    }
    diagnostics.push(`== ${path.relative(userDataDir, targetPath) || path.basename(targetPath)} ==\n${content.trim()}`);
  }

  if (diagnostics.length === 0 && pathExists(runtimeDataRoot)) {
    diagnostics.push(`runtimeData root exists but no matching diagnostic files were found under ${runtimeDataRoot}`);
  }

  return diagnostics.join('\n\n');
}

function assertRuntimeVerificationOutput(output, { artifactRoot, userDataDir, helpers }) {
  const programHome = parseOutputValue(output, 'runtime program home');
  const dataHome = parseOutputValue(output, 'runtime data home');
  const dotnetRoot = parseOutputValue(output, 'runtime component dotnet root');
  const nodeRoot = parseOutputValue(output, 'runtime component node root');
  const governedNodeVersion = parseOutputValue(output, 'runtime component node version');

  if (!programHome || !dataHome || !dotnetRoot || !nodeRoot || !governedNodeVersion) {
    fail('Runtime verification output did not include all required runtime structure diagnostics.');
  }

  assertOutputValue(output, 'runtime component dotnet status', 'ok');
  assertOutputValue(output, 'runtime component node status', 'ok');
  assertOutputValue(output, 'result', 'success');

  assertPathWithinRoot(programHome, artifactRoot, 'runtime program home');
  assertPathWithinRoot(dotnetRoot, programHome, 'dotnet runtime root');
  assertPathWithinRoot(nodeRoot, programHome, 'node runtime root');

  const expectedDataHome = helpers.resolveDesktopRuntimeDataHome({ userDataPath: userDataDir });
  if (dataHome !== expectedDataHome) {
    fail(`Expected runtime data home to use the migrated ~/.hagicode/runtime-data contract.\nExpected: ${expectedDataHome}\nActual: ${dataHome}`);
  }
  assertPathContainsSpaces(programHome, 'runtime program home');

  return {
    dataHome,
    nodeVersion: governedNodeVersion,
    userDataDir,
  };
}

function assertDependencyInstallOutput(output, { userDataDir, runtimeContext, helpers }) {
  const installRoot = parseOutputValue(output, 'install root');
  const managedModules = parseOutputValue(output, 'managed modules');
  const managedBin = parseOutputValue(output, 'managed bin');

  if (!installRoot || !managedModules || !managedBin) {
    fail('CLI output did not include install root, managed modules, and managed bin diagnostics.');
  }

  const expectedPaths = helpers.buildNodeMajorNpmGlobalPaths({
    runtimeDataRoot: runtimeContext.dataHome,
    nodeVersion: runtimeContext.nodeVersion,
  });
  if (installRoot !== expectedPaths.npmGlobalPrefix) {
    fail(`Managed npm prefix does not match the Desktop-managed helper.\nExpected: ${expectedPaths.npmGlobalPrefix}\nActual: ${installRoot}`);
  }
  if (managedModules !== expectedPaths.npmGlobalModulesRoot) {
    fail(`Managed npm modules root does not match the Desktop-managed helper.\nExpected: ${expectedPaths.npmGlobalModulesRoot}\nActual: ${managedModules}`);
  }
  if (managedBin !== expectedPaths.npmGlobalBinRoot) {
    fail(`Managed npm bin root does not match the Desktop-managed helper.\nExpected: ${expectedPaths.npmGlobalBinRoot}\nActual: ${managedBin}`);
  }

  for (const expectedPath of [installRoot, managedModules, managedBin]) {
    assertPathWithinRoot(expectedPath, runtimeContext.dataHome, 'managed npm path');
    if (!pathExists(expectedPath)) {
      fail(`Expected managed path to exist after install: ${expectedPath}`);
    }
  }

  for (const packageId of expectedInstalledPackageIds) {
    assertOutputContainsPackage(output, packageId);
  }
}

function assertRuntimeLifecycleOutput(output, { artifactRoot, runtimeContext }) {
  const managedNpmPrefix = parseOutputValue(output, 'managed npm prefix');
  const managedNpmBin = parseOutputValue(output, 'managed npm bin');
  const managedNpmModules = parseOutputValue(output, 'managed npm modules');
  const pm2PackageRoot = parseOutputValue(output, 'standalone pm2 package root');
  const pm2Executable = parseOutputValue(output, 'bundled pm2 executable');
  const desktopLogsDirectory = parseOutputValue(output, 'desktop logs directory');
  const backendRuntimeRoot = parseOutputValue(output, 'backend active runtime root');
  const backendPayloadDll = parseOutputValue(output, 'backend payload dll');
  const backendPm2Home = parseOutputValue(output, 'backend pm2 home');
  const backendRuntimeData = parseOutputValue(output, 'backend runtime data');
  const backendLifecycleSkipped = parseOutputValue(output, 'backend lifecycle skipped') === 'true';
  const backendLifecycleSkipReason = parseOutputValue(output, 'backend lifecycle skip reason');

  for (const [label, value] of [
    ['managed npm prefix', managedNpmPrefix],
    ['managed npm bin', managedNpmBin],
    ['managed npm modules', managedNpmModules],
    ['bundled pm2 executable', pm2Executable],
    ['desktop logs directory', desktopLogsDirectory],
    ['backend active runtime root', backendRuntimeRoot],
    ['backend payload dll', backendPayloadDll],
  ]) {
    if (!value) {
      fail(`Runtime lifecycle output did not include ${label}.`);
    }
  }

  assertOutputValue(output, 'result', 'success');

  for (const managedPath of [
    managedNpmPrefix,
    managedNpmBin,
    managedNpmModules,
    pm2Executable,
  ]) {
    assertPathWithinRoot(managedPath, runtimeContext.dataHome, 'managed PM2 path');
  }
  assertPathWithinRoot(desktopLogsDirectory, runtimeContext.userDataDir, 'desktop logs directory');
  assertPathContainsSpaces(desktopLogsDirectory, 'desktop logs directory');

  if (pm2PackageRoot && pm2PackageRoot !== '<missing>') {
    assertPathWithinRoot(pm2PackageRoot, runtimeContext.dataHome, 'standalone pm2 package root');
  }

  assertPathWithinRoot(backendRuntimeRoot, artifactRoot, 'backend active runtime root');
  assertPathContainsSpaces(backendRuntimeRoot, 'backend active runtime root');

  if (backendLifecycleSkipped) {
    if (!backendLifecycleSkipReason || !backendLifecycleSkipReason.includes('Missing framework-dependent payload files')) {
      fail(`Expected backend lifecycle skip reason to explain the missing packaged payload.\nReason: ${backendLifecycleSkipReason ?? '<missing>'}`);
    }
    return;
  }

  assertOutputValue(output, 'backend start success', 'true');
  assertOutputValue(output, 'backend status after start', 'online');
  assertOutputValue(output, 'backend restart success', 'true');
  assertOutputValue(output, 'backend status after restart', 'online');
  assertOutputValue(output, 'backend stop success', 'true');
  assertOutputValue(output, 'backend status after stop', 'stopped');

  for (const managedPath of [backendPm2Home, backendRuntimeData]) {
    assertPathWithinRoot(managedPath, runtimeContext.dataHome, 'managed PM2 path');
  }

  assertPathWithinRoot(backendPayloadDll, backendRuntimeRoot, 'backend payload dll');
  assertPathContainsSpaces(backendPayloadDll, 'backend payload dll');
}

async function runScenario({
  name,
  executablePath,
  userDataDir,
  commandArgs,
  onSuccess,
}) {
  log(`running ${name}: ${commandArgs.join(' ')}`);
  const result = await runExecutable(executablePath, userDataDir, commandArgs);
  log(`${name} exit code: ${result.code}`);
  if (result.signal) {
    log(`${name} signal: ${result.signal}`);
  }
  const diagnosticContent = await readIntegrationDiagnostics(userDataDir);
  if (result.timedOut) {
    fail(
      `${name} timed out after ${result.timeoutMs}ms.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\n` +
      `diagnostic:\n${diagnosticContent || '<missing>'}`,
    );
  }
  if (result.code !== 0) {
    fail(
      `${name} failed with exit code ${result.code}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\n` +
      `diagnostic:\n${diagnosticContent || '<missing>'}`,
    );
  }

  await onSuccess(result);
}

async function main() {
  const helpers = await loadDesktopManagedPathHelpers();
  const { tempRoot, artifactRoot, source } = await copyArtifactToPathWithSpaces();
  const executablePath = findDesktopExecutable(artifactRoot);
  if (!executablePath) {
    fail(`Unable to locate Desktop executable under staged artifact root: ${artifactRoot}`);
  }

  const userDataDir = path.join(tempRoot, 'Managed npm user data with spaces');
  await fsp.mkdir(userDataDir, { recursive: true });
  const diagnosticLogPath = path.join(userDataDir, 'non-interactive-startup.log');
  let runtimeContext = null;

  let caughtError = null;

  try {
    log(`source artifact: ${source}`);
    log(`staged artifact root: ${artifactRoot}`);
    log(`desktop executable: ${executablePath}`);
    log(`managed userData root: ${userDataDir}`);
    log(`startup diagnostic log: ${diagnosticLogPath}`);
    log(`command timeout: ${defaultCommandTimeoutMs}ms default`);
    if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      log('launch mode: headless Linux runtime switches enabled');
    }
    if (process.platform === 'linux') {
      log('launch mode: Linux sandbox override enabled for staged artifact execution');
    }

    if (!artifactRoot.includes(' ') || !executablePath.includes(' ') || !userDataDir.includes(' ')) {
      fail('Integration harness must run with artifact and managed paths containing spaces.');
    }

    log('stage 1/4: runtime verification');
    await runScenario({
      name: 'runtime verification',
      executablePath,
      userDataDir,
      commandArgs: runtimeVerifyArgs,
      onSuccess: async (result) => {
        runtimeContext = assertRuntimeVerificationOutput(result.stdout, {
          artifactRoot,
          userDataDir,
          helpers,
        });
      },
    });

    log('stage 2/4: managed PM2 bootstrap');
    await runScenario({
      name: 'dependency install',
      executablePath,
      userDataDir,
      commandArgs: dependencyInstallArgs,
      onSuccess: async (result) => {
        assertDependencyInstallOutput(result.stdout, {
          userDataDir,
          runtimeContext,
          helpers,
        });
      },
    });

    log('stage 3/4 and 4/4: PM2 environment and lifecycle verification');
    await runScenario({
      name: 'runtime lifecycle',
      executablePath,
      userDataDir,
      commandArgs: runtimeLifecycleArgs,
      onSuccess: async (result) => {
        assertRuntimeLifecycleOutput(result.stdout, {
          artifactRoot,
          runtimeContext,
        });
      },
    });

    log('non-interactive integration test passed');
  } catch (error) {
    caughtError = error;
    throw error;
  } finally {
    if (shouldKeepTempRoot()) {
      log(`retaining integration temp root for debugging: ${tempRoot}`);
    } else {
      try {
        await removePathWithRetries(tempRoot);
      } catch (cleanupError) {
        const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        if (caughtError) {
          log(`cleanup warning: ${message}`);
        } else {
          throw cleanupError;
        }
      }
    }
  }
}

if (
  process.env.HAGICODE_SKIP_NON_INTERACTIVE_MAIN !== '1'
  && process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error('[non-interactive-integration] failed');
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
