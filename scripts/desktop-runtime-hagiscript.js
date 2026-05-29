import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ensureRuntimeManifestPath,
  resolveRuntimeManifestDataScopePath,
  resolveScriptUserDataPath,
} from './runtime-manifest-store.js';
import { resolveStagedDesktopRuntimeProgramHome } from './desktop-runtime-layout.js';
import { detectRuntimePlatform } from './embedded-runtime-config.js';
import {
  assertGlobalHagiscriptAvailable,
  buildResolvedHagiscriptEnvironment,
  resolveGlobalHagiscriptPackageRoot,
} from './global-hagiscript.js';

const MINIMUM_HAGISCRIPT_VERSION = '0.2.9';
const NODE_COMPONENT_NAME = 'node';

export function isManagedDesktopRuntimeComponentExecution(componentIds = null) {
  const componentName = process.env.HAGISCRIPT_RUNTIME_COMPONENT_NAME?.trim();
  if (!componentName) {
    return false;
  }

  if (!Array.isArray(componentIds) || componentIds.length === 0) {
    return true;
  }

  return componentIds
    .map((componentId) => resolveManagedDesktopRuntimeComponentName(componentId))
    .includes(componentName);
}

export function resolveManagedDesktopRuntimeComponentRoot() {
  return process.env.HAGISCRIPT_RUNTIME_COMPONENT_ROOT?.trim() || null;
}

export function resolveManagedDesktopRuntimeComponentName(componentId) {
  switch (componentId) {
    case 'dotnet':
      return `dotnet/runtime/${process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform()}`;
    case 'node':
      return NODE_COMPONENT_NAME;
    case 'code-server':
      return 'code-server';
    default:
      throw new Error(`Unsupported Desktop runtime component: ${componentId}`);
  }
}

export async function installDesktopRuntimeComponents(componentIds, options = {}) {
  return runDesktopRuntimeLifecycle('install', componentIds, options);
}

export async function updateDesktopRuntimeComponents(componentIds, options = {}) {
  return runDesktopRuntimeLifecycle('update', componentIds, options);
}

async function runDesktopRuntimeLifecycle(phase, componentIds, options = {}) {
  const hagiscriptVersion = assertGlobalHagiscriptAvailable(MINIMUM_HAGISCRIPT_VERSION);
  const hagiscriptPackageRoot = resolveGlobalHagiscriptPackageRoot(MINIMUM_HAGISCRIPT_VERSION);
  const hagiscriptCliPath = path.join(hagiscriptPackageRoot, 'dist', 'cli.js');
  const hagiscriptEnv = buildResolvedHagiscriptEnvironment(MINIMUM_HAGISCRIPT_VERSION);
  const manifestPath = ensureRuntimeManifestPath(undefined, process.cwd(), process.env);
  const runtimeRoot = resolveStagedDesktopRuntimeProgramHome(process.cwd());
  const componentNames = componentIds.map((componentId) => resolveManagedDesktopRuntimeComponentName(componentId));
  const args = [
    hagiscriptCliPath,
    'runtime',
    phase,
    '--from-manifest',
    manifestPath,
    '--runtime-root',
    runtimeRoot,
    '--components',
    componentNames.join(','),
  ];

  if (options.force) {
    args.push('--force');
  }
  if (process.env.HAGICODE_RUNTIME_VERBOSE === '1' || process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    args.push('--verbose');
  }

  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...hagiscriptEnv,
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    const failureParts = [
      `hagiscript runtime ${phase} failed for ${componentIds.join(', ')}`,
      `exit code: ${result.status ?? 'unknown'}`,
      `hagiscript version: ${hagiscriptVersion}`,
    ];
    if (result.signal) {
      failureParts.push(`signal: ${result.signal}`);
    }

    const outputSections = [];
    if (result.stderr?.trim()) {
      outputSections.push(`stderr:\n${result.stderr.trim()}`);
    }
    if (result.stdout?.trim()) {
      outputSections.push(`stdout:\n${result.stdout.trim()}`);
    }

    const latestLog = readLatestRuntimeInstallLog(runtimeRoot);
    if (latestLog) {
      outputSections.push(`runtime log (${latestLog.path}):\n${latestLog.content}`);
    }

    throw new Error(`${failureParts.join('\n')}${outputSections.length > 0 ? `\n${outputSections.join('\n\n')}` : ''}`);
  }
}

function readLatestRuntimeInstallLog(_runtimeRoot) {
  const logsDirectory = path.join(
    resolveRuntimeManifestDataScopePath(resolveScriptUserDataPath(), process.env),
    'runtimeData',
    'logs',
  );
  if (!fs.existsSync(logsDirectory)) {
    return null;
  }

  const candidates = fs.readdirSync(logsDirectory)
    .filter((entry) => entry.endsWith('.log'))
    .map((entry) => {
      const targetPath = path.join(logsDirectory, entry);
      return {
        path: targetPath,
        mtimeMs: fs.statSync(targetPath).mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  const latest = candidates[0];
  if (!latest) {
    return null;
  }

  const content = fs.readFileSync(latest.path, 'utf8').trim();
  return {
    path: latest.path,
    content: content.length > 8000 ? `${content.slice(-8000)}` : content,
  };
}
