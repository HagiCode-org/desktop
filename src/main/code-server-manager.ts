import fs from 'node:fs/promises';
import path from 'node:path';
import { app, shell } from 'electron';
import {
  inspectVendoredCodeServerRuntime,
} from './code-server-runtime.js';
import type DependencyManagementService from './dependency-management-service.js';
import type { ConfigManager } from './config.js';
import { buildPm2MajorHomePaths } from './portable-toolchain-paths.js';
import { ensurePm2HomeAlias } from './pm2-home-alias.js';
import {
  injectCodeServerRuntimeEnv,
  injectManagedCliPathEnv,
  resolvePathEnvKey,
} from './portable-toolchain-env.js';
import { Pm2DotnetManager, resolvePm2LaunchPlan } from './pm2-dotnet-manager.js';
import { resolveCommandLaunch } from './toolchain-launch.js';
import { executeCli } from './utils/cli-executor.js';
import { PathManager } from './path-manager.js';
import type {
  VendoredRuntimeHealthSnapshot,
  VendoredRuntimeLifecycleAction,
  VendoredRuntimeLifecycleResult,
  VendoredRuntimePathOpenResult,
  VendoredRuntimeStatusSnapshot,
} from '../types/dependency-management.js';
import type {
  CodeServerConfigSnapshot,
  CodeServerConfigUpdatePayload,
  CodeServerConfigUpdateResult,
  CodeServerLogReadRequest,
  CodeServerLogReadResult,
  CodeServerManagedPaths,
  CodeServerOverallStatus,
  CodeServerPathOpenResult,
  CodeServerPathTarget,
  CodeServerProcessStatus,
  CodeServerStatusSnapshot,
} from '../types/code-server-management.js';

const PROCESS_NAME = 'hagicode-code-server';
const OUT_LOG_FILE = 'code-server-out.log';
const ERROR_LOG_FILE = 'code-server-error.log';
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 200;
const DEFAULT_LOG_LINE_LIMIT = 200;
const DEFAULT_PM2_STATUS_TIMEOUT_MS = 5_000;
const DEFAULT_PM2_LIFECYCLE_TIMEOUT_MS = 20_000;

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface Pm2ContextSnapshot {
  executablePath: string | null;
  env: NodeJS.ProcessEnv | null;
  available: boolean;
  error?: string;
}

interface CodeServerLaunchSpec {
  script: string;
  args: string[];
  interpreterNone: boolean;
  cwd: string;
}

function normalizePassword(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const password = value.trim();
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH ? password : null;
}

function coerceLogLineLimit(value: number | undefined): number {
  if (!Number.isInteger(value) || !value || value <= 0) {
    return DEFAULT_LOG_LINE_LIMIT;
  }

  return Math.min(value, 1000);
}

export class CodeServerManager {
  private readonly dependencyManagementService: DependencyManagementService;
  private readonly configManager: ConfigManager;
  private readonly pathManager: PathManager;
  private readonly userDataPath: string;
  private readonly openPathImpl: (targetPath: string) => Promise<string>;

  constructor(options: {
    dependencyManagementService: DependencyManagementService;
    configManager: ConfigManager;
    pathManager?: PathManager;
    userDataPath?: string;
    openPath?: (targetPath: string) => Promise<string>;
  }) {
    this.dependencyManagementService = options.dependencyManagementService;
    this.configManager = options.configManager;
    this.pathManager = options.pathManager ?? PathManager.getInstance();
    this.userDataPath = options.userDataPath ?? app.getPath('userData');
    this.openPathImpl = options.openPath ?? ((targetPath) => shell.openPath(targetPath));
  }

  async getRuntimeSnapshots(): Promise<VendoredRuntimeStatusSnapshot[]> {
    return [await this.getRuntimeSnapshot()];
  }

  async getRuntimeSnapshot(): Promise<VendoredRuntimeStatusSnapshot> {
    await this.ensureLayout();
    const pm2 = await this.resolvePm2Context();
    const pm2ProcessStatus = await this.getPm2ProcessStatus(pm2);
    const health = await this.probeHealth(this.getBaseUrl(), pm2ProcessStatus);
    const snapshot = await inspectVendoredCodeServerRuntime(this.pathManager, { health });
    const diagnostics = [...snapshot.diagnostics];

    if (!pm2.available && pm2.error) {
      diagnostics.push(pm2.error);
    }
    if (pm2ProcessStatus === 'errored') {
      diagnostics.push('PM2 reports the vendored code-server process as errored.');
    }
    if (pm2ProcessStatus === 'online' && !health.reachable) {
      diagnostics.push('PM2 reports code-server online, but the local health probe failed.');
    }

    return {
      ...snapshot,
      diagnostics,
      health: {
        ...health,
        url: this.getBaseUrl(),
      },
      message: diagnostics[0] ?? snapshot.message,
    };
  }

  getConfig(): CodeServerConfigSnapshot {
    return this.configManager.getCodeServerConfig();
  }

  async setConfig(payload: CodeServerConfigUpdatePayload): Promise<CodeServerConfigUpdateResult> {
    let currentStatus: CodeServerStatusSnapshot | null = null;

    try {
      currentStatus = await this.getStatus();
      const port = this.validatePort(payload.port);
      const currentConfig = this.getConfig();
      const password = payload.password === undefined ? currentConfig.password : this.validatePassword(payload.password);
      const changed = currentConfig.port !== port || currentConfig.password !== password;

      this.configManager.set('codeServer', { port, password });

      if (changed && currentStatus.process.status === 'online') {
        const restartResult = await this.restart();
        if (!restartResult.success) {
          const status = await this.getStatus();
          return {
            success: false,
            config: status.config,
            status,
            error: restartResult.error ?? 'Failed to restart Code Server after saving configuration.',
          };
        }
      }

      const status = await this.getStatus();
      return {
        success: true,
        config: status.config,
        status,
      };
    } catch (error) {
      const status = await this.getStatus().catch(async () => currentStatus ?? await this.buildFallbackStatus(error));
      return {
        success: false,
        config: status.config,
        status,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getStatus(): Promise<CodeServerStatusSnapshot> {
    const paths = await this.ensureLayout();
    const config = this.getConfig();
    const pm2 = await this.resolvePm2Context();
    const processStatus = await this.getPm2ProcessStatus(pm2);
    const runtime = await this.getRuntimeSnapshot();
    const status = this.resolveOverallStatus(runtime.status, pm2.available, processStatus);

    return {
      status,
      config,
      runtime,
      paths,
      pm2Available: pm2.available,
      pm2ExecutablePath: pm2.executablePath,
      process: {
        name: PROCESS_NAME,
        status: processStatus,
        restartCount: null,
      },
      error: this.resolveStatusError(runtime, pm2, processStatus),
      generatedAt: new Date().toISOString(),
    };
  }

  async readLog(request: CodeServerLogReadRequest): Promise<CodeServerLogReadResult> {
    const paths = await this.ensureLayout();
    const fileName = request.target === 'service-out'
      ? OUT_LOG_FILE
      : request.target === 'service-error'
        ? ERROR_LOG_FILE
        : null;
    if (!fileName) {
      throw new Error(`Unsupported Code Server log target: ${request.target}`);
    }

    const logPath = path.join(paths.logs, fileName);
    try {
      const raw = await fs.readFile(logPath, 'utf8');
      return {
        target: request.target,
        path: logPath,
        exists: true,
        lines: raw.split(/\r?\n/).slice(-coerceLogLineLimit(request.maxLines)),
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

  async openManagedPath(target: CodeServerPathTarget): Promise<CodeServerPathOpenResult> {
    const paths = await this.ensureLayout();
    const resolvedPath = target === 'logs'
      ? paths.logs
      : target === 'runtime-root'
        ? this.pathManager.getCodeServerRuntimeRoot()
        : target === 'data'
          ? paths.data
          : paths.extensions;
    const result = await this.openPathImpl(resolvedPath);

    return {
      success: result.length === 0,
      target,
      path: resolvedPath,
      error: result.length > 0 ? result : undefined,
    };
  }

  async start(): Promise<VendoredRuntimeLifecycleResult> {
    return this.runLifecycle('start');
  }

  async stop(): Promise<VendoredRuntimeLifecycleResult> {
    return this.runLifecycle('stop');
  }

  async restart(): Promise<VendoredRuntimeLifecycleResult> {
    return this.runLifecycle('restart');
  }

  async repair(): Promise<VendoredRuntimeLifecycleResult> {
    return this.runLifecycle('repair');
  }

  async openPath(target: 'logs' | 'runtime-root'): Promise<VendoredRuntimePathOpenResult> {
    const result = await this.openManagedPath(target);

    return {
      success: result.success,
      runtimeId: 'code-server',
      target,
      path: result.path,
      error: result.error,
    };
  }

  private async runLifecycle(action: VendoredRuntimeLifecycleAction): Promise<VendoredRuntimeLifecycleResult> {
    try {
      if (action === 'repair') {
        return await this.runRepair();
      }

      const snapshot = await this.getRuntimeSnapshot();
      if (!snapshot.wrapperPath && !(process.platform === 'win32' && snapshot.entryScriptPath)) {
        throw new Error(snapshot.message ?? 'Vendored code-server runtime is not ready.');
      }

      const paths = await this.ensureLayout();
      const pm2 = await this.resolvePm2Context();
      if (!pm2.available || !pm2.executablePath || !pm2.env) {
        throw new Error(pm2.error ?? 'Desktop-managed PM2 is unavailable.');
      }

      const runtimeEnv = injectCodeServerRuntimeEnv(pm2.env, this.pathManager, {
        platform: process.platform,
      });
      const nodeExecutablePath = pm2.env.HAGICODE_NODE_EXECUTABLE_PATH ?? pm2.env.HAGICODE_DOTNET_EXE;
      const launchSpec = this.resolveLaunchSpec(snapshot, nodeExecutablePath);
      await this.renderEcosystem(paths, launchSpec, runtimeEnv.env);

      if (action === 'start') {
        await this.deletePm2Process(pm2.executablePath, pm2.env);
        await this.runPm2(pm2.executablePath, ['start', paths.ecosystemFile, '--only', PROCESS_NAME, '--update-env'], pm2.env);
      } else if (action === 'stop') {
        await this.stopPm2Process(pm2.executablePath, pm2.env);
      } else {
        const processStatus = await this.getPm2ProcessStatus(pm2);
        if (processStatus === 'online') {
          const restartResult = await this.runPm2(pm2.executablePath, ['restart', PROCESS_NAME, '--update-env'], pm2.env, true);
          if (restartResult.exitCode !== 0) {
            await this.deletePm2Process(pm2.executablePath, pm2.env);
            await this.runPm2(pm2.executablePath, ['start', paths.ecosystemFile, '--only', PROCESS_NAME, '--update-env'], pm2.env);
          }
        } else {
          await this.deletePm2Process(pm2.executablePath, pm2.env);
          await this.runPm2(pm2.executablePath, ['start', paths.ecosystemFile, '--only', PROCESS_NAME, '--update-env'], pm2.env);
        }
      }

      return {
        success: true,
        runtimeId: 'code-server',
        action,
        status: await this.getRuntimeSnapshot(),
      };
    } catch (error) {
      return {
        success: false,
        runtimeId: 'code-server',
        action,
        status: await this.fallbackSnapshot(error),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async runRepair(): Promise<VendoredRuntimeLifecycleResult> {
    if (app.isPackaged) {
      return {
        success: false,
        runtimeId: 'code-server',
        action: 'repair',
        status: await this.getRuntimeSnapshot(),
        error: 'Vendored code-server repair is only available in development builds. Reinstall Desktop to restore the packaged runtime.',
      };
    }

    const prepareScriptPath = path.resolve(process.cwd(), 'scripts', 'prepare-code-server-runtime.js');
    const result = await executeCli({
      command: process.execPath,
      args: [prepareScriptPath],
      env: {
        ...process.env,
      },
      shell: false,
      windowsHide: true,
      metadata: { component: 'CodeServerManager', command: 'prepare-code-server-runtime' },
    });

    if (result.exitCode !== 0) {
      return {
        success: false,
        runtimeId: 'code-server',
        action: 'repair',
        status: await this.getRuntimeSnapshot(),
        error: (result.stderr || result.stdout || 'Vendored code-server repair failed.').trim(),
      };
    }

    return {
      success: true,
      runtimeId: 'code-server',
      action: 'repair',
      status: await this.getRuntimeSnapshot(),
    };
  }

  private async fallbackSnapshot(error: unknown): Promise<VendoredRuntimeStatusSnapshot> {
    const health: VendoredRuntimeHealthSnapshot = {
      reachable: false,
      url: this.getBaseUrl(),
      lastCheckedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
    return inspectVendoredCodeServerRuntime(this.pathManager, { health });
  }

  private async buildFallbackStatus(error: unknown): Promise<CodeServerStatusSnapshot> {
    const config = this.getConfig();
    const runtime = await this.fallbackSnapshot(error);
    const paths = this.getPaths();

    return {
      status: runtime.status === 'missing'
        ? 'missing'
        : runtime.status === 'damaged'
          ? 'damaged'
          : 'error',
      config,
      runtime,
      paths,
      pm2Available: false,
      pm2ExecutablePath: null,
      process: {
        name: PROCESS_NAME,
        status: 'unknown',
        restartCount: null,
      },
      error: error instanceof Error ? error.message : String(error),
      generatedAt: new Date().toISOString(),
    };
  }

  private getBaseUrl(): string {
    return this.getConfig().baseUrl;
  }

  private getPort(): string {
    return String(this.getConfig().port);
  }

  private async probeHealth(baseUrl: string, pm2Status: CodeServerProcessStatus): Promise<VendoredRuntimeHealthSnapshot> {
    try {
      const response = await fetch(baseUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(2000),
      });
      return {
        reachable: response.status < 500,
        url: baseUrl,
        lastCheckedAt: new Date().toISOString(),
        message: response.status < 500 ? undefined : `Health probe returned HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        reachable: false,
        url: baseUrl,
        lastCheckedAt: new Date().toISOString(),
        message: pm2Status === 'online'
          ? `PM2 reports code-server online, but the health probe failed: ${error instanceof Error ? error.message : String(error)}`
          : pm2Status === 'errored'
            ? 'PM2 reports code-server as errored.'
            : 'code-server is not running.',
      };
    }
  }

  getPaths(): CodeServerManagedPaths {
    const root = this.pathManager.getCodeServerRuntimeDataHome();
    const runtime = path.join(root, 'runtime');
    return {
      root,
      data: path.join(root, 'data'),
      extensions: path.join(root, 'data', 'extensions'),
      logs: path.join(root, 'logs'),
      runtime,
      ecosystemFile: path.join(runtime, 'ecosystem.config.cjs'),
    };
  }

  private async ensureLayout(): Promise<CodeServerManagedPaths> {
    const paths = this.getPaths();
    await Promise.all([
      fs.mkdir(paths.data, { recursive: true }),
      fs.mkdir(paths.extensions, { recursive: true }),
      fs.mkdir(paths.logs, { recursive: true }),
      fs.mkdir(paths.runtime, { recursive: true }),
    ]);
    return paths;
  }

  private async resolvePm2Context(): Promise<Pm2ContextSnapshot> {
    try {
      const pm2Context = await this.dependencyManagementService.getManagedCommandContext('pm2');
      if (!pm2Context.executablePath || pm2Context.packageStatus?.status !== 'installed') {
        return {
          executablePath: pm2Context.executablePath,
          env: null,
          available: false,
          error: 'Desktop-managed PM2 is unavailable. Install PM2 from Dependency Management first.',
        };
      }

      const env = await this.buildManagedPm2CommandEnv(pm2Context.commandEnv, pm2Context.environment);
      return {
        executablePath: pm2Context.executablePath,
        env,
        available: true,
      };
    } catch (error) {
      return {
        executablePath: null,
        env: null,
        available: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
      node: {
        executablePath: string;
      };
    },
  ): Promise<NodeJS.ProcessEnv> {
    const managedCliEnv = injectManagedCliPathEnv(baseEnv, {
      platform: process.platform,
      npmGlobalPaths: {
        nodeVersion: environment.nodeVersion ?? process.versions.node,
        nodeMajorVersion: environment.nodeMajorVersion,
        npmGlobalPrefix: environment.npmGlobalPrefix,
        npmGlobalBinRoot: environment.npmGlobalBinRoot,
        npmGlobalModulesRoot: environment.npmGlobalModulesRoot,
        npmCacheRoot: environment.npmCacheRoot,
      },
    }).env;

    const pm2Version = await this.resolveManagedPm2Version(environment.npmGlobalModulesRoot);
    const pm2HomePaths = buildPm2MajorHomePaths({
      userDataPath: this.userDataPath,
      pm2Version,
      platform: process.platform,
    });
    const pm2Home = path.join(this.pathManager.getCodeServerRuntimeDataHome(), 'pm2', pm2HomePaths.pm2MajorVersion);
    await fs.mkdir(pm2Home, { recursive: true });
    const pm2HomeAlias = await ensurePm2HomeAlias(pm2Home, `code-server-${pm2HomePaths.pm2MajorVersion}`);

    return {
      ...managedCliEnv,
      HAGICODE_RUNTIME_HOME: this.pathManager.getRuntimeProgramHome(),
      HAGICODE_RUNTIME_DATA_HOME: this.pathManager.getCodeServerRuntimeDataHome(),
      HAGICODE_NODE_EXECUTABLE_PATH: environment.node.executablePath,
      PM2_HOME: pm2HomeAlias,
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

  private resolveLaunchSpec(
    runtime: VendoredRuntimeStatusSnapshot,
    nodeExecutablePath: string | undefined,
  ): CodeServerLaunchSpec {
    const args = [
      '--bind-addr',
      `127.0.0.1:${this.getConfig().port}`,
      '--auth',
      'password',
      '--user-data-dir',
      this.getPaths().data,
      '--extensions-dir',
      this.getPaths().extensions,
      '--disable-telemetry',
    ];

    if (process.platform === 'win32' && runtime.entryScriptPath && nodeExecutablePath) {
      return {
        script: nodeExecutablePath,
        args: [runtime.entryScriptPath, ...args],
        interpreterNone: true,
        cwd: this.pathManager.getCodeServerRuntimeRoot(),
      };
    }

    if (!runtime.wrapperPath) {
      throw new Error(runtime.message ?? 'Vendored code-server runtime is not ready.');
    }

    return {
      script: runtime.wrapperPath,
      args,
      interpreterNone: true,
      cwd: this.pathManager.getCodeServerRuntimeRoot(),
    };
  }

  private async renderEcosystem(paths: CodeServerManagedPaths, launchSpec: CodeServerLaunchSpec, runtimeEnv: NodeJS.ProcessEnv): Promise<void> {
    const pathKey = resolvePathEnvKey(runtimeEnv, process.platform);
    const pathValue = runtimeEnv[pathKey] ?? runtimeEnv.PATH ?? runtimeEnv.Path ?? '';
    const config = this.getConfig();
    const outLog = path.join(paths.logs, OUT_LOG_FILE);
    const errorLog = path.join(paths.logs, ERROR_LOG_FILE);
    const interpreterLine = launchSpec.interpreterNone ? `,\n      interpreter: 'none'` : '';
    const contents = `module.exports = {\n  apps: [\n    {\n      name: ${JSON.stringify(PROCESS_NAME)},\n      script: ${JSON.stringify(launchSpec.script)},\n      args: ${JSON.stringify(launchSpec.args)},\n      exec_mode: 'fork',\n      instances: 1,\n      autorestart: true,\n      restart_delay: 3000,\n      max_restarts: 10${interpreterLine},\n      cwd: ${JSON.stringify(launchSpec.cwd)},\n      out_file: ${JSON.stringify(outLog)},\n      error_file: ${JSON.stringify(errorLog)},\n      env: {\n        ${JSON.stringify(pathKey)}: ${JSON.stringify(pathValue)},\n        HAGICODE_RUNTIME_HOME: ${JSON.stringify(this.pathManager.getRuntimeProgramHome())},\n        HAGICODE_RUNTIME_DATA_HOME: ${JSON.stringify(this.pathManager.getCodeServerRuntimeDataHome())},\n        HAGICODE_CODE_SERVER_RUNTIME_ROOT: ${JSON.stringify(this.pathManager.getCodeServerRuntimeRoot())},\n        HAGICODE_PORTABLE_TOOLCHAIN_ROOT: ${JSON.stringify(runtimeEnv.HAGICODE_PORTABLE_TOOLCHAIN_ROOT ?? '')},\n        HAGICODE_CODE_SERVER_DESKTOP_MANAGED: 'true',\n        PORT: ${JSON.stringify(String(config.port))},\n        PASSWORD: ${JSON.stringify(config.password)}\n      }\n    }\n  ]\n};\n`;
    await fs.writeFile(paths.ecosystemFile, contents, 'utf8');
  }

  private async getPm2ProcessStatus(pm2: Pm2ContextSnapshot): Promise<CodeServerProcessStatus> {
    if (!pm2.available || !pm2.executablePath || !pm2.env) {
      return 'stopped';
    }

    const manager = new Pm2DotnetManager({
      pm2Command: pm2.executablePath,
      processName: PROCESS_NAME,
    });
    const result = await manager.status(this.getPaths().runtime, pm2.env);
    if (!result.success || !result.status) {
      return 'unknown';
    }

    const status = result.status.status;
    if (!result.status.exists || status === null) {
      return 'stopped';
    }
    if (status === 'online') {
      return 'online';
    }
    if (status === 'errored') {
      return 'errored';
    }
    if (status === 'stopped' || status === 'stopping' || status === 'launching') {
      return 'stopped';
    }
    return 'unknown';
  }

  private resolveOverallStatus(
    runtimeStatus: VendoredRuntimeStatusSnapshot['status'],
    pm2Available: boolean,
    processStatus: CodeServerProcessStatus,
  ): CodeServerOverallStatus {
    if (runtimeStatus === 'missing') {
      return 'missing';
    }
    if (runtimeStatus === 'damaged') {
      return 'damaged';
    }
    if (processStatus === 'online' || runtimeStatus === 'running') {
      return 'running';
    }
    if (!pm2Available || processStatus === 'errored') {
      return 'error';
    }
    return 'stopped';
  }

  private resolveStatusError(
    runtime: VendoredRuntimeStatusSnapshot,
    pm2: Pm2ContextSnapshot,
    processStatus: CodeServerProcessStatus,
  ): string | undefined {
    if (runtime.diagnostics[0]) {
      return runtime.diagnostics[0];
    }
    if (!pm2.available) {
      return pm2.error ?? 'Desktop-managed PM2 is unavailable.';
    }
    if (processStatus === 'errored') {
      return 'PM2 reports the Desktop-managed Code Server process as errored.';
    }
    return undefined;
  }

  private normalizePort(value: unknown, fallback: number): number {
    const port = Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : fallback;
  }

  private validatePort(value: number): number {
    if (!Number.isInteger(value) || value < 1024 || value > 65535) {
      throw new Error('Code Server port must be between 1024 and 65535.');
    }
    return value;
  }

  private validatePassword(value: string): string {
    const password = normalizePassword(value);
    if (!password) {
      throw new Error(`Code Server password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`);
    }
    return password;
  }

  private async deletePm2Process(command: string, env: NodeJS.ProcessEnv): Promise<void> {
    const result = await this.runPm2(command, ['delete', PROCESS_NAME], env, true);
    if (result.exitCode === 0 || /not found/i.test(`${result.stdout}\n${result.stderr}`)) {
      return;
    }
    throw new Error((result.stderr || result.stdout || 'PM2 delete failed').trim());
  }

  private async stopPm2Process(command: string, env: NodeJS.ProcessEnv): Promise<void> {
    const result = await this.runPm2(command, ['stop', PROCESS_NAME], env, true);
    if (result.exitCode === 0 || /not found/i.test(`${result.stdout}\n${result.stderr}`)) {
      return;
    }
    throw new Error((result.stderr || result.stdout || 'PM2 stop failed').trim());
  }

  private async runPm2(command: string, args: string[], env: NodeJS.ProcessEnv, allowFailure = false): Promise<CommandResult> {
    const pm2LaunchPlan = resolvePm2LaunchPlan(command, {
      env,
      platform: process.platform,
    });
    const launch = pm2LaunchPlan.shell
      ? resolveCommandLaunch(pm2LaunchPlan.command)
      : { command: pm2LaunchPlan.command, shell: false };

    const result = await executeCli({
      command: launch.command,
      args: [...pm2LaunchPlan.argsPrefix, ...args],
      env,
      windowsHide: true,
      shell: launch.shell,
      timeoutMs: args[0] === 'jlist' ? DEFAULT_PM2_STATUS_TIMEOUT_MS : DEFAULT_PM2_LIFECYCLE_TIMEOUT_MS,
      metadata: { component: 'CodeServerManager', command },
    });
    const normalized = {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
    if (!allowFailure && result.exitCode !== 0) {
      throw new Error((result.stderr || result.stdout || `PM2 exited with code ${result.exitCode}`).trim());
    }
    return normalized;
  }
}
