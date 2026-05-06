#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import AdmZip from 'adm-zip';

const projectRoot = process.cwd();
const pkgRoot = path.join(projectRoot, 'pkg');
const runtimeVerifyArgs = ['runtime', 'verify'];
const dependencyInstallArgs = ['deps', 'install', '--claude-code', '--codex'];
const defaultCommandTimeoutMs = 240_000;

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

function findZipArtifact() {
  if (!pathExists(pkgRoot)) {
    return null;
  }

  const zips = fs.readdirSync(pkgRoot)
    .filter((entry) => entry.toLowerCase().endsWith('.zip'))
    .map((entry) => path.join(pkgRoot, entry))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  return zips[0] ?? null;
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

  const zipArtifact = findZipArtifact();
  if (zipArtifact) {
    await extractZipArtifact(zipArtifact, stagedRoot);
    return { tempRoot, artifactRoot: stagedRoot, source: zipArtifact };
  }

  fail(`No unpacked artifact root or ZIP artifact found under ${pkgRoot}. Build a runnable Desktop artifact first.`);
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
  if (!candidatePath || !candidatePath.startsWith(rootPath)) {
    fail(`Expected ${label} to stay under ${rootPath}.\nPath: ${candidatePath ?? '<missing>'}`);
  }
}

function assertRuntimeVerificationOutput(output, { artifactRoot, userDataDir }) {
  const programHome = parseOutputValue(output, 'runtime program home');
  const dataHome = parseOutputValue(output, 'runtime data home');
  const dotnetRoot = parseOutputValue(output, 'runtime component dotnet root');
  const nodeRoot = parseOutputValue(output, 'runtime component node root');
  const codeServerRoot = parseOutputValue(output, 'runtime component code-server root');
  const omniRouteRoot = parseOutputValue(output, 'runtime component omniroute root');
  const codeServerDataHome = parseOutputValue(output, 'runtime service code-server data');
  const omniRouteDataHome = parseOutputValue(output, 'runtime service omniroute data');

  if (!programHome || !dataHome || !dotnetRoot || !nodeRoot || !codeServerRoot || !omniRouteRoot || !codeServerDataHome || !omniRouteDataHome) {
    fail('Runtime verification output did not include all required runtime structure diagnostics.');
  }

  assertOutputValue(output, 'runtime component dotnet status', 'ok');
  assertOutputValue(output, 'runtime component node status', 'ok');
  assertOutputValue(output, 'runtime component code-server status', 'ok');
  assertOutputValue(output, 'runtime component omniroute status', 'ok');
  assertOutputValue(output, 'result', 'success');

  assertPathWithinRoot(programHome, artifactRoot, 'runtime program home');
  assertPathWithinRoot(dotnetRoot, programHome, 'dotnet runtime root');
  assertPathWithinRoot(nodeRoot, programHome, 'node runtime root');
  assertPathWithinRoot(codeServerRoot, programHome, 'code-server runtime root');
  assertPathWithinRoot(omniRouteRoot, programHome, 'omniroute runtime root');

  const expectedDataHome = path.join(userDataDir, 'runtimeData');
  if (dataHome !== expectedDataHome) {
    fail(`Expected runtime data home to use the migrated userData/runtimeData contract.\nExpected: ${expectedDataHome}\nActual: ${dataHome}`);
  }
  assertPathWithinRoot(codeServerDataHome, expectedDataHome, 'code-server runtime data home');
  assertPathWithinRoot(omniRouteDataHome, expectedDataHome, 'omniroute runtime data home');
}

async function runScenario({
  name,
  executablePath,
  userDataDir,
  commandArgs,
  onSuccess,
}) {
  const diagnosticLogPath = path.join(userDataDir, 'non-interactive-startup.log');
  log(`running ${name}: ${commandArgs.join(' ')}`);
  const result = await runExecutable(executablePath, userDataDir, commandArgs);
  log(`${name} exit code: ${result.code}`);
  if (result.signal) {
    log(`${name} signal: ${result.signal}`);
  }
  if (result.timedOut) {
    fail(
      `${name} timed out after ${result.timeoutMs}ms.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\n` +
      `diagnostic:\n${readDiagnosticFile(diagnosticLogPath) ?? '<missing>'}`,
    );
  }
  if (result.code !== 0) {
    fail(
      `${name} failed with exit code ${result.code}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\n` +
      `diagnostic:\n${readDiagnosticFile(diagnosticLogPath) ?? '<missing>'}`,
    );
  }

  await onSuccess(result);
}

async function main() {
  const { tempRoot, artifactRoot, source } = await copyArtifactToPathWithSpaces();
  const executablePath = findDesktopExecutable(artifactRoot);
  if (!executablePath) {
    fail(`Unable to locate Desktop executable under staged artifact root: ${artifactRoot}`);
  }

  const userDataDir = path.join(tempRoot, 'Managed npm user data with spaces');
  await fsp.mkdir(userDataDir, { recursive: true });
  const diagnosticLogPath = path.join(userDataDir, 'non-interactive-startup.log');

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

  await runScenario({
    name: 'runtime verification',
    executablePath,
    userDataDir,
    commandArgs: runtimeVerifyArgs,
    onSuccess: async (result) => {
      assertRuntimeVerificationOutput(result.stdout, { artifactRoot, userDataDir });
    },
  });

  await runScenario({
    name: 'dependency install',
    executablePath,
    userDataDir,
    commandArgs: dependencyInstallArgs,
    onSuccess: async (result) => {
      const stdout = result.stdout;
      const installRoot = parseOutputValue(stdout, 'install root');
      const managedModules = parseOutputValue(stdout, 'managed modules');
      const managedBin = parseOutputValue(stdout, 'managed bin');

      if (!installRoot || !managedModules || !managedBin) {
        fail('CLI output did not include install root, managed modules, and managed bin diagnostics.');
      }

      for (const expectedPath of [installRoot, managedModules, managedBin]) {
        if (!expectedPath.startsWith(userDataDir)) {
          fail(`Expected managed path to be under clean integration userData root.\nPath: ${expectedPath}\nUserData: ${userDataDir}`);
        }
      }

      for (const packageId of ['hagiscript', 'claude-code', 'codex']) {
        assertOutputContainsPackage(stdout, packageId);
      }

      for (const expectedPath of [installRoot, managedModules, managedBin]) {
        if (!pathExists(expectedPath)) {
          fail(`Expected managed path to exist after install: ${expectedPath}`);
        }
      }
    },
  });

  log('non-interactive integration test passed');
}

main().catch((error) => {
  console.error('[non-interactive-integration] failed');
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
