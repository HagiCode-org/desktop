import { electron } from '../electron-api.js';
import { existsSync } from 'node:fs';
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import path from 'node:path';
import { isWindowsStoreRuntime } from './windows-store-runtime.js';

const { app } = electron;

export const DESKTOP_MANAGED_SERVER_LAUNCHER_ARG = '--hagicode-managed-server-launcher';
const PSF_LAUNCHER_EXECUTABLE_NAME = 'PsfLauncher64.exe';

export interface ManagedServerLauncherResolutionOptions {
  argv?: readonly string[];
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  platform?: NodeJS.Platform;
  processWindowsStore?: boolean;
  processDefaultApp?: boolean;
  isPackaged?: boolean;
  pathExists?: (targetPath: string) => boolean;
}

export interface ManagedServerLauncherRunOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  spawnChild?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;
}

export function isManagedServerLauncherInvocation(
  argv: readonly string[] = process.argv,
): boolean {
  return argv.includes(DESKTOP_MANAGED_SERVER_LAUNCHER_ARG);
}

export function resolveManagedServerLauncherPath(
  options: ManagedServerLauncherResolutionOptions = {},
): string | null {
  const env = options.env ?? process.env;
  const execPath = options.execPath ?? process.execPath;
  const platform = options.platform ?? process.platform;
  const pathExists = options.pathExists ?? existsSync;

  if (
    !isWindowsStoreRuntime({
      platform,
      inheritedFlag: env.HAGICODE_DESKTOP_WINDOWS_STORE,
      processWindowsStore:
        options.processWindowsStore
        ?? Boolean((process as NodeJS.Process & { windowsStore?: boolean }).windowsStore),
      execPath,
      isPackaged: options.isPackaged ?? app.isPackaged,
      defaultApp:
        options.processDefaultApp
        ?? (process as NodeJS.Process & { defaultApp?: boolean }).defaultApp,
    })
  ) {
    return null;
  }

  const siblingPsfLauncherPath = path.join(path.dirname(execPath), PSF_LAUNCHER_EXECUTABLE_NAME);
  if (pathExists(siblingPsfLauncherPath)) {
    return siblingPsfLauncherPath;
  }

  return execPath;
}

export function buildManagedServerLauncherArgs(): string[] {
  return [DESKTOP_MANAGED_SERVER_LAUNCHER_ARG];
}

export async function runManagedServerLauncher(
  options: ManagedServerLauncherRunOptions = {},
): Promise<number> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const spawnChild = options.spawnChild ?? spawn;
  const serviceDllPath = requireNonEmptyEnv(
    env.HAGISCRIPT_RUNTIME_RELEASED_SERVICE_DLL_ABSOLUTE_PATH,
    'HAGISCRIPT_RUNTIME_RELEASED_SERVICE_DLL_ABSOLUTE_PATH',
  );
  const serviceWorkingDirectory = requireNonEmptyEnv(
    env.HAGISCRIPT_RUNTIME_RELEASED_SERVICE_WORKING_DIRECTORY_ABSOLUTE_PATH,
    'HAGISCRIPT_RUNTIME_RELEASED_SERVICE_WORKING_DIRECTORY_ABSOLUTE_PATH',
  );
  const dotnetPath = resolveManagedServerDotnetPath(env, platform);

  const child = spawnChild(dotnetPath, [serviceDllPath], {
    cwd: serviceWorkingDirectory,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });

  forwardTerminationSignals(child, platform);

  return await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }

      resolve(code ?? 0);
    });
  });
}

function resolveManagedServerDotnetPath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string {
  const explicitDotnetPath = normalizeNonEmptyString(env.HAGICODE_DOTNET_EXE);
  if (explicitDotnetPath) {
    return explicitDotnetPath;
  }

  const dotnetRuntimeRoot = requireNonEmptyEnv(
    env.HAGISCRIPT_RUNTIME_DOTNET_RUNTIME_DIR,
    'HAGISCRIPT_RUNTIME_DOTNET_RUNTIME_DIR',
  );
  return path.join(
    dotnetRuntimeRoot,
    'current',
    platform === 'win32' ? 'dotnet.exe' : 'dotnet',
  );
}

function forwardTerminationSignals(
  child: ChildProcess,
  platform: NodeJS.Platform,
): void {
  if (platform === 'win32') {
    return;
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      if (!child.killed) {
        child.kill(signal);
      }
    });
  }
}

function requireNonEmptyEnv(value: string | undefined, variableName: string): string {
  const normalized = normalizeNonEmptyString(value);
  if (!normalized) {
    throw new Error(`${variableName} is required for managed server launcher mode.`);
  }

  return normalized;
}

function normalizeNonEmptyString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
