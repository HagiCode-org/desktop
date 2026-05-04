import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { app, shell } from 'electron';
import log from 'electron-log';
import { ConfigManager } from './config.js';
import type DependencyManagementService from './dependency-management-service.js';
import { buildOmniRouteDependencyRemediation } from './omniroute-remediation.js';
import { resolvePm2LaunchPlan } from './pm2-dotnet-manager.js';
import { injectManagedCliPathEnv, resolvePathEnvKey } from './portable-toolchain-env.js';
import { buildPm2MajorHomePaths } from './portable-toolchain-paths.js';
import { resolveCommandLaunch } from './toolchain-launch.js';
import { executeCli } from './utils/cli-executor.js';
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

class OmniRouteLifecycleCommandError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;

  constructor(message: string, result: CommandResult) {
    super(message);
    this.name = 'OmniRouteLifecycleCommandError';
    this.stdout = result.stdout;
    this.stderr = result.stderr;
    this.exitCode = result.exitCode;
  }
}

interface Pm2ListEntry {
  name?: string;
  pm2_env?: {
    status?: string;
    restart_time?: number;
    pm_uptime?: number;
  };
}

interface ManagedCliLaunchSpec {
  script: string;
  args: string[];
  interpreterNone: boolean;
  cwd?: string;
}

interface WindowsOmniRouteShellWrapperOptions {
  wrapperPath: string;
  execaImportUrl: string;
  executablePath: string;
}

export interface OmniRouteManagerOptions {
  configManager: ConfigManager;
  dependencyManagementService: DependencyManagementService;
  userDataPath?: string;
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
const requireFromModule = createRequire(import.meta.url);

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

function stripWrappingQuotes(value: string): string {
  return value.replace(/^"(.*)"$/, '$1');
}

function resolveOmniRouteMemoryLimitMb(): number {
  const rawMemory = Number.parseInt(process.env.OMNIROUTE_MEMORY_MB ?? '512', 10);
  return Number.isFinite(rawMemory) && rawMemory >= 64 && rawMemory <= 16384 ? rawMemory : 512;
}

function formatLifecycleFailureDetails(error: unknown): string[] {
  if (!(error instanceof OmniRouteLifecycleCommandError)) {
    return [];
  }

  const details: string[] = [];
  const stdout = error.stdout.trim();
  const stderr = error.stderr.trim();

  if (stdout) {
    details.push('stdout:');
    details.push(stdout);
  }

  if (stderr) {
    details.push('stderr:');
    details.push(stderr);
  }

  return details;
}

export class OmniRouteManager {
  private readonly configManager: ConfigManager;
  private readonly dependencyManagementService: DependencyManagementService;
  private readonly userDataPath: string;
  private readonly openPathImpl: (targetPath: string) => Promise<string>;

  constructor(options: OmniRouteManagerOptions) {
    this.configManager = options.configManager;
    this.dependencyManagementService = options.dependencyManagementService;
    this.userDataPath = options.userDataPath ?? app.getPath('userData');
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
    const omnirouteContext = await this.dependencyManagementService.getManagedCommandContext('omniroute');
    const managedPm2Env = await this.buildManagedPm2CommandEnv(pm2Context.commandEnv, pm2Context.environment);
    const config = this.getConfig();
    const remediation = buildOmniRouteDependencyRemediation([
      {
        packageId: 'pm2',
        packageStatus: pm2Context.packageStatus?.status ?? null,
        executablePath: pm2Context.executablePath,
        installedVersion: pm2Context.packageStatus?.version ?? null,
      },
      {
        packageId: 'omniroute',
        packageStatus: omnirouteContext.packageStatus?.status ?? null,
        executablePath: omnirouteContext.executablePath,
        installedVersion: omnirouteContext.packageStatus?.version ?? null,
      },
    ]);
    const processSnapshot = await this.getPm2ProcessSnapshot(pm2Context.executablePath, managedPm2Env);
    const process = processSnapshot ?? this.emptyProcessSnapshot();
    const pm2Available = pm2Context.packageStatus?.status === 'installed' && pm2Context.executablePath !== null;
    const overallStatus = this.resolveOverallStatus(process, pm2Available);

    return {
      status: remediation && process.status !== 'online' ? 'error' : overallStatus,
      config,
      paths,
      processes: [process],
      pm2Available,
      pm2ExecutablePath: pm2Context.executablePath,
      error: remediation?.message,
      remediation,
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
    const paths = await this.ensureLayout();
    let remediation = undefined;
    try {
      this.validatePort(this.getConfig().port);
      const pm2Context = await this.dependencyManagementService.getManagedCommandContext('pm2');
      const omnirouteContext = await this.dependencyManagementService.getManagedCommandContext('omniroute');
      const managedPm2Env = await this.buildManagedPm2CommandEnv(pm2Context.commandEnv, pm2Context.environment);
      remediation = buildOmniRouteDependencyRemediation([
        {
          packageId: 'pm2',
          packageStatus: pm2Context.packageStatus?.status ?? null,
          executablePath: pm2Context.executablePath,
          installedVersion: pm2Context.packageStatus?.version ?? null,
        },
        {
          packageId: 'omniroute',
          packageStatus: omnirouteContext.packageStatus?.status ?? null,
          executablePath: omnirouteContext.executablePath,
          installedVersion: omnirouteContext.packageStatus?.version ?? null,
        },
      ]);
      if (remediation) {
        throw new Error(remediation.message);
      }
      const pm2ExecutablePath = pm2Context.executablePath;
      const omnirouteExecutablePath = omnirouteContext.executablePath;
      if (!pm2ExecutablePath || !omnirouteExecutablePath) {
        throw new Error('Desktop-managed OmniRoute dependencies are unavailable.');
      }

      await this.renderEnvironment(paths);
      const launchSpec = await this.resolveManagedCliLaunchSpec(paths, omnirouteExecutablePath, 'omniroute');
      await this.renderEcosystemConfig(paths, launchSpec, managedPm2Env);

      if (action === 'start') {
        await this.startFreshPm2Process(pm2ExecutablePath, paths.ecosystemFile, managedPm2Env);
      } else if (action === 'stop') {
        await this.stopPm2Process(pm2ExecutablePath, managedPm2Env);
      } else {
        const status = await this.getPm2ProcessSnapshot(pm2ExecutablePath, managedPm2Env);
        if (status) {
          const restartResult = await this.runPm2(pm2ExecutablePath, ['restart', OMNIROUTE_PROCESS_NAME, '--update-env'], managedPm2Env, true);
          if (restartResult.exitCode !== 0) {
            if (!this.isMissingPm2ProcessMessage(restartResult.stderr, restartResult.stdout)) {
              throw this.createPm2CommandError(restartResult);
            }

            await this.startFreshPm2Process(pm2ExecutablePath, paths.ecosystemFile, managedPm2Env);
          }
        } else {
          await this.startFreshPm2Process(pm2ExecutablePath, paths.ecosystemFile, managedPm2Env);
        }
      }

      return {
        success: true,
        action,
        status: await this.getStatus(),
      };
    } catch (error) {
      await this.appendLifecycleFailureLog(paths, action, error);
      const status = await this.getStatus().catch(() => this.buildFallbackStatus(error));
      const message = error instanceof Error ? error.message : String(error);
      const resolvedRemediation = remediation ?? status.remediation;
      log.warn('[OmniRouteManager] lifecycle operation failed', { action, error: message });
      return {
        success: false,
        action,
        status: { ...status, status: 'error', error: message, remediation: resolvedRemediation },
        error: message,
        remediation: resolvedRemediation,
      };
    }
  }

  private async appendLifecycleFailureLog(paths: OmniRouteManagedPaths, action: OmniRouteLifecycleAction, error: unknown): Promise<void> {
    const errorLogPath = path.join(paths.logs, LOG_FILE_BY_TARGET['service-error']);
    const message = error instanceof Error ? error.message : String(error);
    const detailLines = formatLifecycleFailureDetails(error);
    const lines = [
      `[${new Date().toISOString()}] lifecycle ${action} failed`,
      `message: ${message}`,
      ...detailLines,
      '',
    ];

    await fs.mkdir(paths.logs, { recursive: true });
    await fs.appendFile(errorLogPath, `${lines.join('\n')}\n`, 'utf8');
  }

  private isMissingPm2ProcessMessage(stderr: string, stdout: string): boolean {
    return /process \d+ not found|process or namespace .* not found|process or namespace not found|process name not found/i.test(`${stderr}\n${stdout}`);
  }

  private async deletePm2Process(command: string, env: NodeJS.ProcessEnv): Promise<void> {
    const result = await this.runPm2(command, ['delete', OMNIROUTE_PROCESS_NAME], env, true);
    if (result.exitCode === 0 || this.isMissingPm2ProcessMessage(result.stderr, result.stdout)) {
      return;
    }

    throw this.createPm2CommandError(result);
  }

  private async stopPm2Process(command: string, env: NodeJS.ProcessEnv): Promise<void> {
    const result = await this.runPm2(command, ['stop', OMNIROUTE_PROCESS_NAME], env, true);
    if (result.exitCode === 0 || this.isMissingPm2ProcessMessage(result.stderr, result.stdout)) {
      return;
    }

    throw this.createPm2CommandError(result);
  }

  private async startFreshPm2Process(command: string, ecosystemFile: string, env: NodeJS.ProcessEnv): Promise<void> {
    await this.deletePm2Process(command, env);
    await this.runPm2(command, ['start', ecosystemFile, '--only', OMNIROUTE_PROCESS_NAME, '--update-env'], env);
  }

  private async renderEnvironment(paths: OmniRouteManagedPaths): Promise<void> {
    const config = this.getConfig();
    const memoryLimitMb = resolveOmniRouteMemoryLimitMb();
    const envPath = paths.envFile;
    const contents = [
      `PORT=${config.port}`,
      `OMNIROUTE_PORT=${config.port}`,
      `DASHBOARD_PORT=${config.port}`,
      `API_PORT=${config.port}`,
      'HOSTNAME=0.0.0.0',
      'NODE_ENV=production',
      `NODE_OPTIONS=--max-old-space-size=${memoryLimitMb}`,
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

  private async buildManagedPm2CommandEnv(
    baseEnv: NodeJS.ProcessEnv,
    environment: {
      nodeVersion: string | null;
      nodeMajorVersion: string;
      npmGlobalPrefix: string;
      npmGlobalBinRoot: string;
      npmGlobalModulesRoot: string;
      npmCacheRoot: string;
    },
  ): Promise<NodeJS.ProcessEnv> {
    const hasManagedNpmGlobalContext = typeof baseEnv.HAGICODE_NPM_GLOBAL_PREFIX === 'string'
      || typeof baseEnv.HAGICODE_NODE_MAJOR_VERSION === 'string';
    const managedCliEnv = injectManagedCliPathEnv(baseEnv, {
      platform: process.platform,
      npmGlobalPaths: hasManagedNpmGlobalContext ? {
        nodeVersion: environment.nodeVersion ?? process.versions.node,
        nodeMajorVersion: environment.nodeMajorVersion,
        npmGlobalPrefix: environment.npmGlobalPrefix,
        npmGlobalBinRoot: environment.npmGlobalBinRoot,
        npmGlobalModulesRoot: environment.npmGlobalModulesRoot,
        npmCacheRoot: environment.npmCacheRoot,
      } : null,
    }).env;
    const pm2Version = await this.resolveManagedPm2Version(environment.npmGlobalModulesRoot);
    const pm2HomePaths = buildPm2MajorHomePaths({
      userDataPath: this.userDataPath,
      pm2Version,
      platform: process.platform,
    });
    await fs.mkdir(pm2HomePaths.pm2Home, { recursive: true });

    return {
      ...managedCliEnv,
      PM2_HOME: pm2HomePaths.pm2Home,
    };
  }

  private async resolveManagedPm2Version(npmGlobalModulesRoot: string): Promise<string | null> {
    const packageJsonPath = path.join(npmGlobalModulesRoot, 'pm2', 'package.json');
    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonContent) as { version?: unknown };
      return typeof packageJson.version === 'string' ? packageJson.version : null;
    } catch {
      return null;
    }
  }

  private async resolveManagedCliLaunchSpec(paths: OmniRouteManagedPaths, executablePath: string, packageName: string): Promise<ManagedCliLaunchSpec> {
    const normalizedPath = stripWrappingQuotes(executablePath);
    const binDirectory = path.dirname(normalizedPath);
    const nodeExecutable = path.join(binDirectory, process.platform === 'win32' ? 'node.exe' : 'node');
    const cliEntryPoint = path.join(binDirectory, 'node_modules', packageName, 'bin', `${packageName}.mjs`);

    if (process.platform === 'win32' && fsSync.existsSync(nodeExecutable)) {
      const wrapperPath = path.join(paths.runtime, 'omniroute-shell-wrapper.mjs');
      await this.renderWindowsOmniRouteShellWrapper({
        wrapperPath,
        execaImportUrl: pathToFileURL(this.resolveExecaEntrypoint()).href,
        executablePath: normalizedPath,
      });

      return {
        script: nodeExecutable,
        args: [wrapperPath],
        interpreterNone: true,
        cwd: paths.root,
      };
    }

    if (fsSync.existsSync(nodeExecutable) && fsSync.existsSync(cliEntryPoint)) {
      return {
        script: nodeExecutable,
        args: [cliEntryPoint, 'serve', '--no-open'],
        interpreterNone: true,
      };
    }

    return {
      script: normalizedPath,
      args: ['serve', '--no-open'],
      interpreterNone: false,
    };
  }

  private resolveExecaEntrypoint(): string {
    return requireFromModule.resolve('execa');
  }

  private async renderWindowsOmniRouteShellWrapper(options: WindowsOmniRouteShellWrapperOptions): Promise<void> {
    const contents = [
      `import { execa } from ${JSON.stringify(options.execaImportUrl)};`,
      '',
      `const executablePath = ${JSON.stringify(options.executablePath)};`,
      `const subprocess = execa(executablePath, ['serve', '--no-open'], {`,
      `  shell: true,`,
      `  windowsHide: true,`,
      `  stdout: 'inherit',`,
      `  stderr: 'inherit',`,
      `  stdin: 'ignore',`,
      `  env: process.env,`,
      `});`,
      '',
      `try {`,
      `  const result = await subprocess;`,
      `  process.exit(result.exitCode ?? 0);`,
      `} catch (error) {`,
      `  if (error?.shortMessage) {`,
      `    console.error(error.shortMessage);`,
      `  } else if (error?.message) {`,
      `    console.error(error.message);`,
      `  }`,
      `  process.exit(error?.exitCode ?? 1);`,
      `}`,
      '',
    ].join('\n');

    await fs.writeFile(options.wrapperPath, contents, 'utf8');
  }

  private async renderEcosystemConfig(
    paths: OmniRouteManagedPaths,
    launchSpec: ManagedCliLaunchSpec,
    managedPm2Env: NodeJS.ProcessEnv,
  ): Promise<void> {
    const config = this.getConfig();
    const outLog = path.join(paths.logs, LOG_FILE_BY_TARGET['service-out']);
    const errorLog = path.join(paths.logs, LOG_FILE_BY_TARGET['service-error']);
    const interpreterLine = launchSpec.interpreterNone ? `,\n      interpreter: "none"` : '';
    const windowsHideLine = process.platform === 'win32' ? `,\n      windowsHide: true` : '';
    const pathKey = resolvePathEnvKey(managedPm2Env, process.platform);
    const pathValue = managedPm2Env[pathKey] ?? managedPm2Env.PATH ?? managedPm2Env.Path;
    const managedEnvLines = [
      pathValue ? `        ${JSON.stringify(pathKey)}: ${JSON.stringify(pathValue)},\n` : '',
      managedPm2Env.HAGICODE_AGENT_CLI_PATH
        ? `        HAGICODE_AGENT_CLI_PATH: ${JSON.stringify(managedPm2Env.HAGICODE_AGENT_CLI_PATH)},\n`
        : '',
      managedPm2Env.HAGICODE_NPM_GLOBAL_PATH
        ? `        HAGICODE_NPM_GLOBAL_PATH: ${JSON.stringify(managedPm2Env.HAGICODE_NPM_GLOBAL_PATH)},\n`
        : '',
      managedPm2Env.PM2_HOME
        ? `        PM2_HOME: ${JSON.stringify(managedPm2Env.PM2_HOME)},\n`
        : '',
    ].join('');
    const contents = `module.exports = {\n  apps: [\n    {\n      name: ${JSON.stringify(OMNIROUTE_PROCESS_NAME)},\n      script: ${JSON.stringify(launchSpec.script)},\n      args: ${JSON.stringify(launchSpec.args)},\n      exec_mode: 'fork',\n      instances: 1,\n      autorestart: true,\n      restart_delay: 3000,\n      max_restarts: 10${windowsHideLine},\n      cwd: ${JSON.stringify(launchSpec.cwd ?? paths.root)},\n      out_file: ${JSON.stringify(outLog)},\n      error_file: ${JSON.stringify(errorLog)}${interpreterLine},\n      env: {\n${managedEnvLines}        PORT: ${JSON.stringify(String(config.port))},\n        OMNIROUTE_PORT: ${JSON.stringify(String(config.port))},\n        DASHBOARD_PORT: ${JSON.stringify(String(config.port))},\n        API_PORT: ${JSON.stringify(String(config.port))},\n        HOSTNAME: '0.0.0.0',\n        NODE_ENV: 'production',\n        NODE_OPTIONS: ${JSON.stringify(`--max-old-space-size=${resolveOmniRouteMemoryLimitMb()}`)},\n        OMNIROUTE_BASE_URL: ${JSON.stringify(config.baseUrl)},\n        OMNIROUTE_CONFIG_DIR: ${JSON.stringify(paths.config)},\n        OMNIROUTE_DATA_DIR: ${JSON.stringify(paths.data)},\n        OMNIROUTE_LOG_DIR: ${JSON.stringify(paths.logs)},\n        OMNIROUTE_ENV_DIR: ${JSON.stringify(paths.config)},\n        OMNIROUTE_ENV_PATH: ${JSON.stringify(paths.envFile)},\n        OMNIROUTE_RUNTIME_DIR: ${JSON.stringify(paths.runtime)},\n        DATA_DIR: ${JSON.stringify(paths.data)},\n        CLIPROXYAPI_CONFIG_DIR: ${JSON.stringify(paths.config)},\n        INITIAL_PASSWORD: ${JSON.stringify(config.password)},\n        OMNIROUTE_DESKTOP_PASSWORD: ${JSON.stringify(config.password)},\n        OMNIROUTE_DESKTOP_SECRET: ${JSON.stringify(config.password)},\n        OMNIROUTE_DESKTOP_MANAGED: 'true'\n      }\n    }\n  ]\n};\n`;
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
        restartCount: typeof entry.pm2_env?.restart_time === 'number' ? entry.pm2_env.restart_time : null,
        uptime: typeof entry.pm2_env?.pm_uptime === 'number' ? Math.max(0, Date.now() - entry.pm2_env.pm_uptime) : null,
      };
    } catch {
      return null;
    }
  }

  private runPm2(command: string, args: string[], env: NodeJS.ProcessEnv, allowFailure = false): Promise<CommandResult> {
    const pm2LaunchPlan = resolvePm2LaunchPlan(command, {
      env,
      platform: process.platform,
    });
    const launch = pm2LaunchPlan.shell
      ? resolveCommandLaunch(pm2LaunchPlan.command)
      : { command: pm2LaunchPlan.command, shell: false };

    return executeCli({
      command: launch.command,
      args: [...pm2LaunchPlan.argsPrefix, ...args],
      env,
      windowsHide: true,
      shell: launch.shell,
      metadata: { component: 'OmniRouteManager', command },
    }).then((result) => {
      const commandResult = {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };

      if (!allowFailure && result.exitCode !== 0) {
        throw this.createPm2CommandError(commandResult);
      }

      return commandResult;
    });
  }

  private createPm2CommandError(result: CommandResult): OmniRouteLifecycleCommandError {
    return new OmniRouteLifecycleCommandError(
      this.firstLine(result.stderr || result.stdout) ?? `pm2 exited with code ${result.exitCode}`,
      result,
    );
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
