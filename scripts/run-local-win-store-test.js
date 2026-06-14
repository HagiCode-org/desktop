#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const packageIdentityName = 'newbe36524.Hagicode';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const windowsCommandShell = process.env.ComSpec || 'cmd.exe';

function parseArgs(argv) {
  const options = {
    arch: process.arch,
    skipBuild: false,
    purchaseSmokeTest: false,
    forceRendererAccessibility: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--arch':
        options.arch = String(argv[++index] || '').trim() || process.arch;
        break;
      case '--skip-build':
        options.skipBuild = true;
        break;
      case '--purchase-smoke-test':
        options.purchaseSmokeTest = true;
        break;
      case '--force-renderer-accessibility':
        options.forceRendererAccessibility = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function buildLaunchArguments(options) {
  return [
    ...(options.purchaseSmokeTest ? ['--desktop-subscription-purchase-smoke-test=1'] : []),
    ...(options.forceRendererAccessibility ? ['--force-renderer-accessibility'] : []),
  ];
}

function resolveDevRegistrationPaths(projectDir = projectRoot) {
  const appDirectory = path.join(projectDir, 'build', 'msix-stage-dev-registration', 'app');
  return {
    appDirectory,
    manifestPath: path.join(appDirectory, 'AppxManifest.xml'),
    executablePath: path.join(appDirectory, 'Hagicode Desktop.exe'),
  };
}

function run(command, args, options = {}) {
  const invocation = resolveInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: options.cwd || projectRoot,
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 0) !== 0 && !options.allowNonZeroExit) {
    throw new Error(`${invocation.rendered} exited with status ${result.status ?? 1}`);
  }

  return result;
}

function resolveInvocation(command, args) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    const rendered = [command, ...args].map(quoteWindowsArgument).join(' ');
    return {
      command: windowsCommandShell,
      args: ['/d', '/s', '/c', rendered],
      rendered,
    };
  }

  return {
    command,
    args,
    rendered: [command, ...args].join(' '),
  };
}

function quoteWindowsArgument(value) {
  const normalized = String(value ?? '');
  if (normalized.length === 0) {
    return '""';
  }

  if (!/[\s"]/u.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

function runPowerShell(command, options = {}) {
  return run('powershell', ['-NoProfile', '-Command', command], options);
}

function ensureWindowsHost() {
  if (process.platform !== 'win32') {
    throw new Error('Local Win Store test launcher only supports Windows hosts.');
  }
}

function killExistingProcesses() {
  for (const imageName of ['Hagicode Desktop.exe']) {
    run('taskkill', ['/IM', imageName, '/F', '/T'], {
      allowNonZeroExit: true,
      stdio: 'ignore',
    });
  }
}

function rebuildLocalTestLayout(options) {
  run(npmCommand, ['run', 'generate:store-bindings']);
  run(npmCommand, ['run', 'build:all']);
  run('node', [
    'scripts/run-electron-forge.js',
    '--platform',
    'win32',
    '--arch',
    options.arch,
    '--targets',
    'msix',
    '--package-only',
  ]);
}

function reRegisterDevPackage(manifestPath) {
  const escapedManifestPath = manifestPath.replace(/'/g, "''");
  runPowerShell(`if (Get-AppxPackage ${packageIdentityName}) { Get-AppxPackage ${packageIdentityName} | Remove-AppxPackage }`);
  runPowerShell(`Add-AppxPackage -Register '${escapedManifestPath}'`);
}

function launchDevRegisteredApp(executablePath, launchArgs) {
  const child = spawn(executablePath, launchArgs, {
    cwd: path.dirname(executablePath),
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });

  child.unref();
}

function printUsage() {
  console.log(`Usage: node scripts/run-local-win-store-test.js [options]

Options:
  --arch <name>                    Target architecture for the local registration layout
  --skip-build                     Reuse the existing dev registration layout without rebuilding
  --purchase-smoke-test            Start the app with subscription purchase smoke test enabled
  --force-renderer-accessibility   Start the app with renderer accessibility forced on
`);
}

async function main() {
  ensureWindowsHost();
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  const paths = resolveDevRegistrationPaths();

  console.log('[local-win-store-test] Killing previous Hagicode processes...');
  killExistingProcesses();

  if (!options.skipBuild) {
    console.log('[local-win-store-test] Rebuilding local Win Store test layout...');
    rebuildLocalTestLayout(options);
  }

  if (!fs.existsSync(paths.manifestPath)) {
    throw new Error(`Missing dev registration manifest: ${path.relative(projectRoot, paths.manifestPath)}`);
  }

  if (!fs.existsSync(paths.executablePath)) {
    throw new Error(`Missing dev registration executable: ${path.relative(projectRoot, paths.executablePath)}`);
  }

  console.log('[local-win-store-test] Re-registering local dev package...');
  reRegisterDevPackage(paths.manifestPath);

  const launchArgs = buildLaunchArguments(options);
  console.log('[local-win-store-test] Launching app...', {
    executablePath: path.relative(projectRoot, paths.executablePath),
    launchArgs,
  });
  launchDevRegisteredApp(paths.executablePath, launchArgs);
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;

export {
  buildLaunchArguments,
  parseArgs,
  resolveInvocation,
  resolveDevRegistrationPaths,
};

if (isDirectExecution) {
  main().catch((error) => {
    console.error(`[local-win-store-test] ${error.message}`);
    process.exit(1);
  });
}
