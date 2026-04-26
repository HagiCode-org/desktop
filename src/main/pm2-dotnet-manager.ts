import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import log from 'electron-log';
import { shouldUseShellForCommand } from './toolchain-launch.js';

export const PM2_DOTNET_PROCESS_NAME = 'hagicode-dotnet-service';
export const PM2_RUNTIME_DIR_NAME = 'pm2-dotnet-service';
export const PM2_ENV_FILE_NAME = '.env';
export const PM2_ECOSYSTEM_FILE_NAME = 'ecosystem.config.js';

export type Pm2DotnetOperation = 'startOrReload' | 'restart' | 'stop' | 'status';

export interface Pm2DotnetRuntimeConfig {
  processName?: string;
  dotnetPath: string;
  serviceDllPath: string;
  serviceWorkingDirectory: string;
  runtimeFilesDirectory: string;
  args?: string[];
  env: NodeJS.ProcessEnv;
}

export interface Pm2DotnetRuntimeFiles {
  runtimeDirectory: string;
  envPath: string;
  ecosystemPath: string;
}

export interface Pm2CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface Pm2CommandExecutor {
  run(command: string, args: string[], options: SpawnOptionsWithoutStdio): Promise<Pm2CommandResult>;
}

export interface Pm2DotnetManagerOptions {
  pm2Command?: string;
  processName?: string;
  commandExecutor?: Pm2CommandExecutor;
}

export interface Pm2ProcessStatus {
  exists: boolean;
  online: boolean;
  pid: number | null;
  status: string | null;
  restartCount: number;
  uptime: number;
}

export type Pm2LifecycleResult =
  | {
      success: true;
      operation: Pm2DotnetOperation;
      status?: Pm2ProcessStatus;
      stdout: string;
      stderr: string;
    }
  | {
      success: false;
      operation: Pm2DotnetOperation;
      errorCode: 'pm2-unavailable' | 'pm2-command-failed' | 'pm2-malformed-output';
      message: string;
      stdout: string;
      stderr: string;
    };

class DefaultPm2CommandExecutor implements Pm2CommandExecutor {
  run(command: string, args: string[], options: SpawnOptionsWithoutStdio): Promise<Pm2CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, options);
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', chunk => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', chunk => {
        stderr += chunk.toString();
      });

      child.on('error', reject);
      child.on('close', code => {
        resolve({ code, stdout, stderr });
      });
    });
  }
}

function quoteJs(value: string): string {
  return JSON.stringify(value);
}

function normalizeEnvValue(value: string | undefined): string {
  return value ?? '';
}

export function buildPm2EnvFile(env: NodeJS.ProcessEnv): string {
  return Object.entries(env)
    .filter(([key, value]) => key.trim().length > 0 && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${normalizeEnvValue(value).replace(/\r?\n/g, '\\n')}`)
    .join('\n') + '\n';
}

export function buildPm2EcosystemConfig(config: Pm2DotnetRuntimeConfig): string {
  const processName = config.processName ?? PM2_DOTNET_PROCESS_NAME;
  const args = [config.serviceDllPath, ...(config.args ?? [])];
  const envPath = path.join(config.runtimeFilesDirectory, PM2_ENV_FILE_NAME);

  return [
    'module.exports = {',
    '  apps: [',
    '    {',
    `      name: ${quoteJs(processName)},`,
    `      script: ${quoteJs(config.dotnetPath)},`,
    `      args: ${quoteJs(args.join(' '))},`,
    `      cwd: ${quoteJs(config.serviceWorkingDirectory)},`,
    '      interpreter: "none",',
    '      exec_mode: "fork",',
    '      autorestart: true,',
    '      watch: false,',
    `      env_file: ${quoteJs(envPath)},`,
    '      env: {',
    `        HAGICODE_PM2_ENV_FILE: ${quoteJs(envPath)}`,
    '      }',
    '    }',
    '  ]',
    '};',
    '',
  ].join('\n');
}

function buildSpawnOptions(cwd: string, env: NodeJS.ProcessEnv, command: string): SpawnOptionsWithoutStdio {
  return {
    cwd,
    env,
    shell: shouldUseShellForCommand(command),
    windowsHide: true,
  };
}

function summarizeFailure(operation: Pm2DotnetOperation, result: Pm2CommandResult): string {
  const detail = (result.stderr || result.stdout || '').trim().split(/\r?\n/).find(Boolean) ?? 'PM2 command failed without output.';
  return `PM2 ${operation} failed: ${detail}`;
}

function normalizeMissingExecutable(operation: Pm2DotnetOperation, error: unknown): Pm2LifecycleResult {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const message = code === 'ENOENT'
    ? 'PM2 is unavailable. Install PM2 or ensure the bundled desktop toolchain exposes the pm2 executable.'
    : `PM2 ${operation} could not be executed: ${error instanceof Error ? error.message : String(error)}`;

  return {
    success: false,
    operation,
    errorCode: 'pm2-unavailable',
    message,
    stdout: '',
    stderr: error instanceof Error ? error.message : String(error),
  };
}

function parsePm2Jlist(stdout: string, processName: string): Pm2ProcessStatus | Pm2LifecycleResult {
  try {
    const parsed = JSON.parse(stdout || '[]');
    if (!Array.isArray(parsed)) {
      return {
        success: false,
        operation: 'status',
        errorCode: 'pm2-malformed-output',
        message: 'PM2 status output was not a JSON array.',
        stdout,
        stderr: '',
      };
    }

    const entry = parsed.find(item => item?.name === processName);
    if (!entry) {
      return {
        exists: false,
        online: false,
        pid: null,
        status: null,
        restartCount: 0,
        uptime: 0,
      };
    }

    const pm2Env = entry.pm2_env ?? {};
    const status = typeof pm2Env.status === 'string' ? pm2Env.status : null;
    const pid = Number.isInteger(entry.pid) && entry.pid > 0 ? entry.pid : null;
    const restartCount = Number.isInteger(pm2Env.restart_time) ? pm2Env.restart_time : 0;
    const createdAt = typeof pm2Env.pm_uptime === 'number' ? pm2Env.pm_uptime : 0;
    const uptime = createdAt > 0 ? Math.max(0, Date.now() - createdAt) : 0;

    return {
      exists: true,
      online: status === 'online',
      pid,
      status,
      restartCount,
      uptime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'status',
      errorCode: 'pm2-malformed-output',
      message: `PM2 status output could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      stdout,
      stderr: '',
    };
  }
}

export function buildPm2CommandArgs(operation: Pm2DotnetOperation, input: { ecosystemPath?: string; processName: string }): string[] {
  if (operation === 'startOrReload') {
    if (!input.ecosystemPath) {
      throw new Error('ecosystemPath is required for startOrReload');
    }
    return ['startOrReload', input.ecosystemPath, '--update-env'];
  }
  if (operation === 'restart') {
    if (!input.ecosystemPath) {
      throw new Error('ecosystemPath is required for restart');
    }
    return ['reload', input.ecosystemPath, '--update-env'];
  }
  if (operation === 'stop') {
    return ['stop', input.processName];
  }
  return ['jlist'];
}

export function resolveDefaultPm2Command(options: { cwd?: string; platform?: NodeJS.Platform; existsSync?: (targetPath: string) => boolean } = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const exists = options.existsSync ?? fsSync.existsSync;
  const executableName = platform === 'win32' ? 'pm2.cmd' : 'pm2';
  const localBin = path.join(cwd, 'node_modules', '.bin', executableName);

  return exists(localBin) ? localBin : executableName;
}

export class Pm2DotnetManager {
  private readonly pm2Command: string;
  private readonly processName: string;
  private readonly commandExecutor: Pm2CommandExecutor;

  constructor(options: Pm2DotnetManagerOptions = {}) {
    this.pm2Command = options.pm2Command ?? resolveDefaultPm2Command();
    this.processName = options.processName ?? PM2_DOTNET_PROCESS_NAME;
    this.commandExecutor = options.commandExecutor ?? new DefaultPm2CommandExecutor();
  }

  resolveRuntimeFiles(runtimeFilesDirectory: string): Pm2DotnetRuntimeFiles {
    return {
      runtimeDirectory: runtimeFilesDirectory,
      envPath: path.join(runtimeFilesDirectory, PM2_ENV_FILE_NAME),
      ecosystemPath: path.join(runtimeFilesDirectory, PM2_ECOSYSTEM_FILE_NAME),
    };
  }

  async writeRuntimeFiles(config: Pm2DotnetRuntimeConfig): Promise<Pm2DotnetRuntimeFiles> {
    const files = this.resolveRuntimeFiles(config.runtimeFilesDirectory);
    const runtimeConfig = { ...config, processName: config.processName ?? this.processName };

    await fs.mkdir(files.runtimeDirectory, { recursive: true });
    await fs.writeFile(files.envPath, buildPm2EnvFile(runtimeConfig.env), 'utf-8');
    await fs.writeFile(files.ecosystemPath, buildPm2EcosystemConfig(runtimeConfig), 'utf-8');

    log.info('[Pm2Dotnet] Runtime files generated:', {
      runtimeDirectory: files.runtimeDirectory,
      envPath: files.envPath,
      ecosystemPath: files.ecosystemPath,
      envKeyCount: Object.keys(runtimeConfig.env).length,
    });

    return files;
  }

  private async runPm2(operation: Pm2DotnetOperation, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<Pm2LifecycleResult> {
    try {
      const result = await this.commandExecutor.run(this.pm2Command, args, buildSpawnOptions(cwd, env, this.pm2Command));
      if (result.code !== 0) {
        return {
          success: false,
          operation,
          errorCode: 'pm2-command-failed',
          message: summarizeFailure(operation, result),
          stdout: result.stdout,
          stderr: result.stderr,
        };
      }

      return {
        success: true,
        operation,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      return normalizeMissingExecutable(operation, error);
    }
  }

  async startOrReload(config: Pm2DotnetRuntimeConfig): Promise<Pm2LifecycleResult> {
    const files = await this.writeRuntimeFiles(config);
    const result = await this.runPm2(
      'startOrReload',
      buildPm2CommandArgs('startOrReload', { ecosystemPath: files.ecosystemPath, processName: this.processName }),
      config.runtimeFilesDirectory,
      config.env,
    );
    if (!result.success) {
      return result;
    }
    return await this.status(config.runtimeFilesDirectory, config.env);
  }

  async restart(config: Pm2DotnetRuntimeConfig): Promise<Pm2LifecycleResult> {
    const files = await this.writeRuntimeFiles(config);
    const result = await this.runPm2(
      'restart',
      buildPm2CommandArgs('restart', { ecosystemPath: files.ecosystemPath, processName: this.processName }),
      config.runtimeFilesDirectory,
      config.env,
    );
    if (!result.success) {
      return result;
    }
    return await this.status(config.runtimeFilesDirectory, config.env);
  }

  async stop(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<Pm2LifecycleResult> {
    const result = await this.runPm2('stop', buildPm2CommandArgs('stop', { processName: this.processName }), cwd, env);
    if (!result.success && result.errorCode === 'pm2-command-failed' && /not found|doesn't exist|process or namespace/i.test(`${result.stderr}\n${result.stdout}`)) {
      return { success: true, operation: 'stop', stdout: result.stdout, stderr: result.stderr };
    }
    return result;
  }

  async status(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<Pm2LifecycleResult> {
    const result = await this.runPm2('status', buildPm2CommandArgs('status', { processName: this.processName }), cwd, env);
    if (!result.success) {
      return result;
    }

    const parsed = parsePm2Jlist(result.stdout, this.processName);
    if ('success' in parsed) {
      return parsed;
    }

    return {
      ...result,
      status: parsed,
    };
  }
}
