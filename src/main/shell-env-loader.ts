import { spawn } from 'node:child_process';
import path from 'node:path';
import log from 'electron-log';

const DISABLE_VALUES = new Set(['0', 'false', 'no', 'off']);
const ENABLE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FEATURE_FLAG = 'HAGICODE_WEB_SERVICE_LOAD_CONSOLE_ENV';

let cachedConsoleEnv: Promise<Record<string, string>> | null = null;

export function shouldLoadConsoleEnvironment(flagValue: string | undefined): boolean {
  if (!flagValue) {
    return true;
  }

  const normalized = flagValue.trim().toLowerCase();
  if (DISABLE_VALUES.has(normalized)) {
    return false;
  }

  if (ENABLE_VALUES.has(normalized)) {
    return true;
  }

  return true;
}

export async function loadConsoleEnvironment(forceRefresh = false): Promise<Record<string, string>> {
  if (!shouldLoadConsoleEnvironment(process.env[FEATURE_FLAG])) {
    return {};
  }

  if (!forceRefresh && cachedConsoleEnv) {
    return cachedConsoleEnv;
  }

  cachedConsoleEnv = loadConsoleEnvironmentInternal();
  return cachedConsoleEnv;
}

async function loadConsoleEnvironmentInternal(): Promise<Record<string, string>> {
  try {
    if (process.platform === 'win32') {
      return await loadWindowsConsoleEnvironment();
    }

    return await loadUnixConsoleEnvironment();
  } catch (error) {
    log.warn('[ShellEnvLoader] Failed to load console environment, fallback to process env only:', error);
    return {};
  }
}

async function loadUnixConsoleEnvironment(): Promise<Record<string, string>> {
  const shellPath = resolveUnixShellPath();
  const shellName = path.basename(shellPath).toLowerCase();
  const command = resolveUnixEnvCommand(shellName);

  const stdout = await executeCommand(shellPath, command);
  const envMap = parseNullDelimitedEnv(stdout);

  log.info('[ShellEnvLoader] Loaded console env from shell:', {
    shellPath,
    shellName,
    envCount: Object.keys(envMap).length,
  });

  return envMap;
}

async function loadWindowsConsoleEnvironment(): Promise<Record<string, string>> {
  const command =
    '$pairs = Get-ChildItem Env: | ForEach-Object { "{0}={1}" -f $_.Name, $_.Value };' +
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;' +
    '[Console]::Out.Write(($pairs -join [char]0))';

  const candidates = ['pwsh.exe', 'powershell.exe'];
  for (const executable of candidates) {
    try {
      const stdout = await executeCommand(executable, ['-ExecutionPolicy', 'Bypass', '-Command', command]);
      const envMap = parseNullDelimitedEnv(stdout);
      log.info('[ShellEnvLoader] Loaded console env from PowerShell:', {
        executable,
        envCount: Object.keys(envMap).length,
      });
      return envMap;
    } catch (error) {
      log.warn('[ShellEnvLoader] Failed to load env via PowerShell candidate:', { executable, error });
    }
  }

  return {};
}

function resolveUnixShellPath(): string {
  if (process.env.SHELL && process.env.SHELL.trim().length > 0) {
    return process.env.SHELL;
  }

  return process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
}

function resolveUnixEnvCommand(shellName: string): string[] {
  if (shellName.includes('bash')) {
    return ['-ic', 'source ~/.bashrc >/dev/null 2>&1 || true; env -0'];
  }

  if (shellName.includes('zsh')) {
    return ['-ic', 'source ~/.zshrc >/dev/null 2>&1 || true; env -0'];
  }

  if (shellName.includes('fish')) {
    return ['-ic', 'env -0'];
  }

  return ['-lc', 'env -0'];
}

async function executeCommand(command: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');

      if (code !== 0 && !stdout) {
        reject(new Error(`Command exited with code ${code}. stderr: ${stderr}`));
        return;
      }

      resolve(stdout);
    });
  });
}

export function parseNullDelimitedEnv(raw: string): Record<string, string> {
  const envMap: Record<string, string> = {};
  if (!raw) {
    return envMap;
  }

  const items = raw.split('\u0000');
  for (const item of items) {
    if (!item) continue;
    const index = item.indexOf('=');
    if (index <= 0) continue;

    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1);
    if (!key) continue;

    envMap[key] = value;
  }

  return envMap;
}
