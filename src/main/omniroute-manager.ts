import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { app, shell } from 'electron';
import log from 'electron-log';
import { ConfigManager } from './config.js';
import type DependencyManagementService from './dependency-management-service.js';
import {
  OMNIROUTE_DEFAULT_PORT,
  OMNIROUTE_PROCESS_NAME,
  type OmniRouteConfigSnapshot,
  type OmniRouteConfigUpdatePayload,
  type OmniRouteConfigUpdateResult,
  type OmniRouteLifecycleAction,
  type OmniRouteLifecycleResult,
  type OmniRouteLogReadRequest,
  type OmniRouteLogReadResult,
  type OmniRouteLogTarget,
  type OmniRouteManagedPaths,
  type OmniRouteOverallStatus,
  type OmniRoutePathOpenResult,
  type OmniRoutePathTarget,
  type OmniRouteProcessSnapshot,
  type OmniRouteProcessStatus,
  type OmniRouteStatusSnapshot,
} from '../types/omniroute-management.js';

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface Pm2ListEntry {
  name?: string;
  pid?: number;
  pm2_env?: {
    status?: string;
    restart_time?: number;
    pm_uptime?: number;
  };
}

export interface OmniRouteManagerOptions {
  configManager: ConfigManager;
  dependencyManagementService: DependencyManagementService;
  userDataPath?: string;
  spawnProcess?: typeof spawn;
  openPath?: (targetPath: string) => Promise<string>;
}

const LOG_FILE_BY_TARGET: Record<OmniRouteLogTarget, string> = {
  'service-out': 'omniroute-out.log',
  'service-error': 'omniroute-error.log',
};

const PATH_TARGETS: readonly OmniRoutePathTarget[] = ['config', 'data', 'logs'];
const MIN_PORT = 1024;
const MAX_PORT = 65535;
const DEFAULT_LOG_LINES = 200;
const MAX_LOG_LINES = 1000;
const DEFAULT_PASSWORD_BYTES = 18;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 200;

function toStatus(value: string | undefined): OmniRouteProcessStatus {
  if (value === 'online') {
    return 'online';
  }
  if (value === 'stopped' || value === 'stopping' || value === 'launching') {
    return 'stopped';
  }
  if (value === 'errored') {
    return 'errored';
  }
  return 'unknown';
}

function buildBaseUrl(port: number): string {
  return `http://localhost:${port}`;
}

function generateDefaultPassword(): string {
  return randomBytes(DEFAULT_PASSWORD_BYTES).toString('base64url');
}

function normalizePassword(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const password = value.trim();
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH ? password : null;
}

function coerceLogLineLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LOG_LINES;
  }
  return Math.min(MAX_LOG_LINES, parsed);
}

function quoteEnv(value: string): string {
  return JSON.stringify(value);
}

export class OmniRouteManager {
  private readonly configManager: ConfigManager;
  private readonly dependencyManagementService: DependencyManagementService;
  private readonly userDataPath: string;
  private readonly spawnProcess: typeof spawn;
  private readonly openPathImpl: (targetPath: string) => Promise<string>;

  constructor(options: OmniRouteManagerOptions) {
    this.configManager = options.configManager;
    this.dependencyManagementService = options.dependencyManagementService;
    this.userDataPath = options.userDataPath ?? app.getPath('userData');
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.openPathImpl = options.openPath ?? ((targetPath) => shell.openPath(targetPath));
  }

  getPaths(): OmniRouteManagedPaths {
    const root = path.join(this.userDataPath, 'OmniRoute');
    const runtime = path.join(root, 'runtime');
    return {
      root,
      config: path.join(root, 'config'),
      data: path.join(root, 'data'),
      logs: path.join(root, 'logs'),
      runtime,
      envFile: path.join(runtime, 'omniroute.env'),
      ecosystemFile: path.join(runtime, 'ecosystem.config.cjs'),
    };
  }

  async ensureLayout(): Promise<OmniRouteManagedPaths> {
    const paths = this.getPaths();
    await Promise.all([
      fs.mkdir(paths.config, { recursive: true }),
      fs.mkdir(paths.data, { recursive: true }),
      fs.mkdir(paths.logs, { recursive: true }),
      fs.mkdir(paths.runtime, { recursive: true }),
    ]);
    return paths;
  }

  getConfig(): OmniRouteConfigSnapshot {
    const configured = this.configManager.getAll().omniroute;
    const port = this.normalizePort(configured?.port, OMNIROUTE_DEFAULT_PORT);
    const password = normalizePassword(configured?.password) ?? generateDefaultPassword();

    if (configured?.port !== port || configured?.password !== password) {
      this.configManager.set('omniroute', {
        ...(configured ?? {}),
        port,
        password,
      });
    }

    return {
      port,
      baseUrl: buildBaseUrl(port),
      password,
    };
  }

  async setConfig(payload: OmniRouteConfigUpdatePayload): Promise<OmniRouteConfigUpdateResult> {
    try {
      const port = this.validatePort(payload.port);
      const current = this.getConfig();
      const password = payload.password === undefined ? current.password : this.validatePassword(payload.password);
      this.configManager.set('omniroute', { port, password });
      const status = await this.getStatus();
      return {
        success: true,
        config: status.config,
        status,
      };
    } catch (error) {
      const status = await this.getStatus().catch(() => this.buildFallbackStatus(error));
      return {
        success: false,
        config: status.config,
        status,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async start(): Promise<OmniRouteLifecycleResult> {
    return this.runLifecycle('start');
  }

  async stop(): Promise<OmniRouteLifecycleResult> {
    return this.runLifecycle('stop');
  }

  async restart(): Promise<OmniRouteLifecycleResult> {
    return this.runLifecycle('restart');
  }

  async getStatus(): Promise<OmniRouteStatusSnapshot> {
    const paths = await this.ensureLayout();
    const pm2Context = await this.dependencyManagementService.getManagedCommandContext('pm2');
    const config = this.getConfig();
    const processSnapshot = await this.getPm2ProcessSnapshot(pm2Context.executablePath, pm2Context.commandEnv);
    const process = processSnapshot ?? this.emptyProcessSnapshot();

    return {
      status: this.resolveOverallStatus(process, pm2Context.executablePath !== null),
      config,
      paths,
      processes: [process],
      pm2Available: pm2Context.packageStatus?.status === 'installed' && pm2Context.executablePath !== null,
      pm2ExecutablePath: pm2Context.executablePath,
      generatedAt: new Date().toISOString(),
    };
  }

  async readLog(request: OmniRouteLogReadRequest): Promise<OmniRouteLogReadResult> {
    const paths = await this.ensureLayout();
    const fileName = LOG_FILE_BY_TARGET[request.target];
    if (!fileName) {
      throw new Error(`Unsupported OmniRoute log target: ${request.target}`);
    }

    const logPath = path.join(paths.logs, fileName);
    try {
      const raw = await fs.readFile(logPath, 'utf8');
      const maxLines = coerceLogLineLimit(request.maxLines);
      return {
        target: request.target,
        path: logPath,
        exists: true,
        lines: raw.split(/\r?\n/).slice(-maxLines),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          target: request.target,
          path: logPath,
          exists: false,
          lines: [],
        };
      }
      throw error;
    }
  }

  async openManagedPath(target: OmniRoutePathTarget): Promise<OmniRoutePathOpenResult> {
    if (!PATH_TARGETS.includes(target)) {
      throw new Error(`Unsupported OmniRoute path target: ${target}`);
    }

    const paths = await this.ensureLayout();
    const targetPath = paths[target];
    const result = await this.openPathImpl(targetPath);
    return {
      success: result.length === 0,
      target,
      path: targetPath,
      error: result.length > 0 ? result : undefined,
    };
  }

  private async runLifecycle(action: OmniRouteLifecycleAction): Promise<OmniRouteLifecycleResult> {
    try {
      const paths = await this.ensureLayout();
      this.validatePort(this.getConfig().port);
      const pm2Context = await this.dependencyManagementService.getManagedCommandContext('pm2');
      if (pm2Context.packageStatus?.status !== 'installed' || !pm2Context.executablePath) {
        throw new Error('PM2 is not installed in the Desktop-managed npm environment. Install PM2 from Dependency Management and retry.');
      }

      await this.renderEnvironment(paths);
      await this.renderEcosystemConfig(paths);

      if (action === 'start') {
        await this.runPm2(pm2Context.executablePath, ['start', paths.ecosystemFile, '--only', OMNIROUTE_PROCESS_NAME, '--update-env'], pm2Context.commandEnv);
      } else if (action === 'stop') {
        await this.runPm2(pm2Context.executablePath, ['stop', OMNIROUTE_PROCESS_NAME], pm2Context.commandEnv, true);
      } else {
        const status = await this.getPm2ProcessSnapshot(pm2Context.executablePath, pm2Context.commandEnv);
        if (status) {
          await this.runPm2(pm2Context.executablePath, ['restart', OMNIROUTE_PROCESS_NAME, '--update-env'], pm2Context.commandEnv, true);
        } else {
          await this.runPm2(pm2Context.executablePath, ['start', paths.ecosystemFile, '--only', OMNIROUTE_PROCESS_NAME, '--update-env'], pm2Context.commandEnv);
        }
      }

      return {
        success: true,
        action,
        status: await this.getStatus(),
      };
    } catch (error) {
      const status = await this.getStatus().catch(() => this.buildFallbackStatus(error));
      const message = error instanceof Error ? error.message : String(error);
      log.warn('[OmniRouteManager] lifecycle operation failed', { action, error: message });
      return {
        success: false,
        action,
        status: { ...status, status: 'error', error: message },
        error: message,
      };
    }
  }

  private async renderEnvironment(paths: OmniRouteManagedPaths): Promise<void> {
    const config = this.getConfig();
    const envPath = paths.envFile;
    const contents = [
      `PORT=${config.port}`,
      `OMNIROUTE_PORT=${config.port}`,
      `OMNIROUTE_BASE_URL=${quoteEnv(config.baseUrl)}`,
      `OMNIROUTE_CONFIG_DIR=${quoteEnv(paths.config)}`,
      `OMNIROUTE_DATA_DIR=${quoteEnv(paths.data)}`,
      `OMNIROUTE_LOG_DIR=${quoteEnv(paths.logs)}`,
      `OMNIROUTE_ENV_DIR=${quoteEnv(paths.config)}`,
      `OMNIROUTE_ENV_PATH=${quoteEnv(envPath)}`,
      `OMNIROUTE_RUNTIME_DIR=${quoteEnv(paths.runtime)}`,
      `DATA_DIR=${quoteEnv(paths.data)}`,
      `CLIPROXYAPI_CONFIG_DIR=${quoteEnv(paths.config)}`,
      `INITIAL_PASSWORD=${quoteEnv(config.password)}`,
      `OMNIROUTE_DESKTOP_MANAGED=true`,
      `OMNIROUTE_DESKTOP_PASSWORD=${quoteEnv(config.password)}`,
      `OMNIROUTE_DESKTOP_SECRET=${quoteEnv(config.password)}`,
      `OMNIROUTE_DESKTOP_UPDATED_AT=${quoteEnv(new Date().toISOString())}`,
      '',
    ].join('\n');
    await fs.writeFile(envPath, contents, 'utf8');
  }

  private async renderEcosystemConfig(paths: OmniRouteManagedPaths): Promise<void> {
    const config = this.getConfig();
    const outLog = path.join(paths.logs, LOG_FILE_BY_TARGET['service-out']);
    const errorLog = path.join(paths.logs, LOG_FILE_BY_TARGET['service-error']);
    const contents = `module.exports = {\n  apps: [\n    {\n      name: ${JSON.stringify(OMNIROUTE_PROCESS_NAME)},\n      script: 'omniroute',\n      args: ['serve'],\n      exec_mode: 'fork',\n      instances: 1,\n      autorestart: true,\n      restart_delay: 3000,\n      max_restarts: 10,\n      cwd: ${JSON.stringify(paths.root)},\n      out_file: ${JSON.stringify(outLog)},\n      error_file: ${JSON.stringify(errorLog)},\n      env: {\n        PORT: ${JSON.stringify(String(config.port))},\n        OMNIROUTE_PORT: ${JSON.stringify(String(config.port))},\n        OMNIROUTE_BASE_URL: ${JSON.stringify(config.baseUrl)},\n        OMNIROUTE_CONFIG_DIR: ${JSON.stringify(paths.config)},\n        OMNIROUTE_DATA_DIR: ${JSON.stringify(paths.data)},\n        OMNIROUTE_LOG_DIR: ${JSON.stringify(paths.logs)},\n        OMNIROUTE_ENV_DIR: ${JSON.stringify(paths.config)},\n        OMNIROUTE_ENV_PATH: ${JSON.stringify(paths.envFile)},\n        OMNIROUTE_RUNTIME_DIR: ${JSON.stringify(paths.runtime)},\n        DATA_DIR: ${JSON.stringify(paths.data)},\n        CLIPROXYAPI_CONFIG_DIR: ${JSON.stringify(paths.config)},\n        INITIAL_PASSWORD: ${JSON.stringify(config.password)},\n        OMNIROUTE_DESKTOP_PASSWORD: ${JSON.stringify(config.password)},\n        OMNIROUTE_DESKTOP_SECRET: ${JSON.stringify(config.password)},\n        OMNIROUTE_DESKTOP_MANAGED: 'true'\n      }\n    }\n  ]\n};\n`;
    await fs.writeFile(paths.ecosystemFile, contents, 'utf8');
  }

  private async getPm2ProcessSnapshot(pm2ExecutablePath: string | null, env: NodeJS.ProcessEnv): Promise<OmniRouteProcessSnapshot | null> {
    if (!pm2ExecutablePath) {
      return null;
    }

    try {
      const result = await this.runPm2(pm2ExecutablePath, ['jlist'], env, true);
      if (result.exitCode !== 0) {
        return null;
      }

      const entries = JSON.parse(result.stdout || '[]') as Pm2ListEntry[];
      const entry = entries.find((item) => item.name === OMNIROUTE_PROCESS_NAME);
      if (!entry) {
        return null;
      }

      return {
        name: OMNIROUTE_PROCESS_NAME,
        status: toStatus(entry.pm2_env?.status),
        pid: typeof entry.pid === 'number' && entry.pid > 0 ? entry.pid : null,
        restartCount: typeof entry.pm2_env?.restart_time === 'number' ? entry.pm2_env.restart_time : null,
        uptime: typeof entry.pm2_env?.pm_uptime === 'number' ? Math.max(0, Date.now() - entry.pm2_env.pm_uptime) : null,
      };
    } catch {
      return null;
    }
  }

  private runPm2(command: string, args: string[], env: NodeJS.ProcessEnv, allowFailure = false): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = this.spawnProcess(command, args, {
          env,
          windowsHide: true,
          shell: process.platform === 'win32',
        });
      } catch (error) {
        reject(error);
        return;
      }

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data: Buffer) => { stdout += data.toString('utf8'); });
      child.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf8'); });
      child.on('error', reject);
      child.on('close', (exitCode) => {
        const result = { exitCode, stdout, stderr };
        if (!allowFailure && exitCode !== 0) {
          reject(new Error(this.firstLine(stderr || stdout) ?? `pm2 exited with code ${exitCode}`));
          return;
        }
        resolve(result);
      });
    });
  }

  private normalizePort(value: unknown, fallback: number): number {
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(parsed) ? parsed : fallback;
  }

  private validatePort(value: unknown): number {
    const port = this.normalizePort(value, Number.NaN);
    if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
      throw new Error(`OmniRoute port must be an integer between ${MIN_PORT} and ${MAX_PORT}.`);
    }

    const webServicePort = this.configManager.getServerConfig().port;
    if (port === webServicePort) {
      throw new Error(`OmniRoute port ${port} conflicts with the configured HagiCode web service port.`);
    }

    return port;
  }

  private validatePassword(value: unknown): string {
    const password = normalizePassword(value);
    if (!password) {
      throw new Error(`OmniRoute password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`);
    }

    return password;
  }

  private emptyProcessSnapshot(): OmniRouteProcessSnapshot {
    return {
      name: OMNIROUTE_PROCESS_NAME,
      status: 'stopped',
      pid: null,
      restartCount: null,
      uptime: null,
    };
  }

  private resolveOverallStatus(process: OmniRouteProcessSnapshot, pm2Available: boolean): OmniRouteOverallStatus {
    if (!pm2Available) {
      return 'error';
    }
    if (process.status === 'online') {
      return 'running';
    }
    if (process.status === 'errored' || process.status === 'unknown') {
      return 'error';
    }
    return 'stopped';
  }

  private buildFallbackStatus(error: unknown): OmniRouteStatusSnapshot {
    const paths = this.getPaths();
    const config = this.getConfig();
    return {
      status: 'error',
      config,
      paths,
      processes: [this.emptyProcessSnapshot()],
      pm2Available: false,
      pm2ExecutablePath: null,
      error: error instanceof Error ? error.message : String(error),
      generatedAt: new Date().toISOString(),
    };
  }

  private firstLine(value: string): string | null {
    return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
  }
}

export default OmniRouteManager;
