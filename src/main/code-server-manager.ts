import fs from 'node:fs/promises';
import path from 'node:path';
import { electron } from '../electron-api.js';
import log from 'electron-log';
import { inspectVendoredCodeServerRuntime } from './code-server-runtime.js';
import type DependencyManagementService from './dependency-management-service.js';
import type { ConfigManager } from './config.js';
import {
  HagiscriptPm2Manager,
  type HagiscriptServerLifecycleResult,
} from './hagiscript-server-manager.js';
import {
  HagiscriptRuntimeContextResolver,
  type HagiscriptRuntimeContext,
} from './hagiscript-runtime-context.js';
import {
  getVendoredRuntimeActivationService,
} from './vendored-runtime-activation.js';
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

const { shell } = electron;

const PROCESS_NAME = 'hagicode-code-server';
const OUT_LOG_FILE = 'code-server-out.log';
const ERROR_LOG_FILE = 'code-server-error.log';
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 200;
const DEFAULT_LOG_LINE_LIMIT = 200;

class CodeServerLifecycleCommandError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;

  constructor(message: string, result: { stdout: string; stderr: string; exitCode: number | null }) {
    super(message);
    this.name = 'CodeServerLifecycleCommandError';
    this.stdout = result.stdout;
    this.stderr = result.stderr;
    this.exitCode = result.exitCode;
  }
}

interface CodeServerStatusDetails {
  runtime: VendoredRuntimeStatusSnapshot;
  processStatus: CodeServerProcessStatus;
  restartCount: number | null;
  pm2Available: boolean;
  pm2ExecutablePath: string | null;
  error?: string;
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

function toProcessStatus(value: string | undefined): CodeServerProcessStatus {
  if (value === 'online') {
    return 'online';
  }
  if (value === 'errored') {
    return 'errored';
  }
  if (value === 'stopped' || value === 'stopping' || value === 'launching' || value === 'missing') {
    return 'stopped';
  }
  return 'unknown';
}

function formatLifecycleFailureDetails(error: unknown): string[] {
  if (!(error instanceof CodeServerLifecycleCommandError)) {
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

export class CodeServerManager {
  private readonly dependencyManagementService: DependencyManagementService;
  private readonly configManager: ConfigManager;
  private readonly pathManager: PathManager;
  private readonly openPathImpl: (targetPath: string) => Promise<string>;
  private readonly hagiscriptRuntimeContextResolver: HagiscriptRuntimeContextResolver;
  private readonly hagiscriptPm2Manager: HagiscriptPm2Manager;
  private readonly vendoredRuntimeActivationService: ReturnType<typeof getVendoredRuntimeActivationService>;

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
    this.openPathImpl = options.openPath ?? ((targetPath) => shell.openPath(targetPath));
    this.hagiscriptRuntimeContextResolver = new HagiscriptRuntimeContextResolver({
      pathManager: this.pathManager,
      dependencyManagementService: this.dependencyManagementService,
    });
    this.hagiscriptPm2Manager = new HagiscriptPm2Manager();
    this.vendoredRuntimeActivationService = getVendoredRuntimeActivationService(
      this.pathManager,
      this.dependencyManagementService,
    );
  }

  async getRuntimeSnapshots(): Promise<VendoredRuntimeStatusSnapshot[]> {
    return [await this.getRuntimeSnapshot()];
  }

  async getRuntimeSnapshot(): Promise<VendoredRuntimeStatusSnapshot> {
    return (await this.resolveStatusDetails()).runtime;
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
      await this.syncManagedConfigFile(await this.ensureLayout());

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
    await this.syncManagedConfigFile(paths);
    const config = this.getConfig();
    const details = await this.resolveStatusDetails(paths);
    const status = this.resolveOverallStatus(details.runtime.status, details.pm2Available, details.processStatus);

    return {
      status,
      config,
      runtime: details.runtime,
      paths,
      pm2Available: details.pm2Available,
      pm2ExecutablePath: details.pm2ExecutablePath,
      process: {
        name: PROCESS_NAME,
        status: details.processStatus,
        restartCount: details.restartCount,
      },
      error: this.resolveStatusError(details.runtime, details.pm2Available, details.processStatus, details.error),
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

    await this.refreshLegacyLogs(paths).catch(() => undefined);

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

  async enable(): Promise<VendoredRuntimeLifecycleResult> {
    return this.runLifecycle('enable');
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

  private async runLifecycle(action: VendoredRuntimeLifecycleAction): Promise<VendoredRuntimeLifecycleResult> {
    let paths: CodeServerManagedPaths | null = null;
    try {
      if (action === 'repair' || action === 'enable') {
        return await this.runRepair(action);
      }

      paths = await this.ensureLayout();
      if (action !== 'stop') {
        const activationFailure = await this.ensureRuntimeReadyForLifecycle(action);
        if (activationFailure) {
          return activationFailure;
        }
      }

      const runtime = await inspectVendoredCodeServerRuntime(this.pathManager);
      if (!runtime.wrapperPath && !runtime.entryScriptPath) {
        throw new Error(runtime.message ?? 'Vendored code-server runtime is not ready.');
      }

      const runtimeContext = await this.createRuntimeContext(paths);

      try {
        const lifecycleResult = action === 'start'
          ? await this.hagiscriptPm2Manager.start(runtimeContext)
          : action === 'stop'
            ? await this.hagiscriptPm2Manager.stop(runtimeContext)
            : await this.hagiscriptPm2Manager.restart(runtimeContext);

        await this.syncLegacyLogFiles(runtimeContext, paths);

        if (!this.isLifecycleResultSuccessful(action, lifecycleResult)) {
          throw this.createHagiscriptCommandError(action, lifecycleResult);
        }
      } finally {
        await runtimeContext.cleanup();
      }

      return {
        success: true,
        runtimeId: 'code-server',
        action,
        status: await this.getRuntimeSnapshot(),
      };
    } catch (error) {
      if (paths) {
        await this.appendLifecycleFailureLog(paths, action, error).catch(() => undefined);
      }
      const message = error instanceof Error ? error.message : String(error);
      log.warn('[CodeServerManager] lifecycle operation failed', { action, error: message });
      return {
        success: false,
        runtimeId: 'code-server',
        action,
        status: await this.fallbackSnapshot(error),
        error: message,
      };
    }
  }

  private async runRepair(action: 'enable' | 'repair'): Promise<VendoredRuntimeLifecycleResult> {
    const result = await this.vendoredRuntimeActivationService.activate('code-server');
    if (result.success) {
      await this.syncManagedConfigFile(await this.ensureLayout());
    }
    return {
      success: result.success,
      runtimeId: 'code-server',
      action,
      status: result.status,
      error: result.error,
    };
  }

  private async ensureRuntimeReadyForLifecycle(
    action: Extract<VendoredRuntimeLifecycleAction, 'start' | 'restart'>,
  ): Promise<VendoredRuntimeLifecycleResult | null> {
    const runtime = await inspectVendoredCodeServerRuntime(this.pathManager);
    if (runtime.status === 'extracting') {
      return {
        success: false,
        runtimeId: 'code-server',
        action,
        status: runtime,
        error: runtime.message ?? 'Vendored code-server runtime activation is already in progress.',
      };
    }

    if (runtime.primaryAction === 'enable' || runtime.primaryAction === 'repair') {
      const activation = await this.vendoredRuntimeActivationService.activate('code-server');
      if (!activation.success) {
        return {
          success: false,
          runtimeId: 'code-server',
          action,
          status: activation.status,
          error: activation.error,
        };
      }
    }

    const readyRuntime = await inspectVendoredCodeServerRuntime(this.pathManager);
    if (!readyRuntime.wrapperPath && !readyRuntime.entryScriptPath) {
      return {
        success: false,
        runtimeId: 'code-server',
        action,
        status: readyRuntime,
        error: readyRuntime.message ?? 'Vendored code-server runtime is not ready.',
      };
    }

    return null;
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

  private async resolveStatusDetails(paths?: CodeServerManagedPaths): Promise<CodeServerStatusDetails> {
    const resolvedPaths = paths ?? await this.ensureLayout();
    const pm2Context = await this.resolvePm2Context();
    let processStatus: CodeServerProcessStatus = 'stopped';
    let restartCount: number | null = null;
    let pm2ExecutablePath: string | null = null;
    let error: string | undefined;

    const runtimeWithoutHealth = await inspectVendoredCodeServerRuntime(this.pathManager);
    if (pm2Context.available && (runtimeWithoutHealth.wrapperPath || runtimeWithoutHealth.entryScriptPath)) {
      try {
        const runtimeContext = await this.createRuntimeContext(resolvedPaths);
        try {
          const lifecycleResult = await this.hagiscriptPm2Manager.status(runtimeContext);
          await this.syncLegacyLogFiles(runtimeContext, resolvedPaths);
          processStatus = toProcessStatus(lifecycleResult.status);
          restartCount = lifecycleResult.success ? lifecycleResult.restartCount : null;
          pm2ExecutablePath = lifecycleResult.pm2BinaryPath;
          if (!lifecycleResult.success) {
            error = lifecycleResult.summary;
          }
        } finally {
          await runtimeContext.cleanup();
        }
      } catch (statusError) {
        error = statusError instanceof Error ? statusError.message : String(statusError);
        processStatus = 'unknown';
      }
    } else if (!pm2Context.available) {
      error = pm2Context.error;
    }

    const health = await this.probeHealth(this.getBaseUrl(), processStatus);
    const snapshot = await inspectVendoredCodeServerRuntime(this.pathManager, { health });
    const diagnostics = [...snapshot.diagnostics];

    if (!pm2Context.available && pm2Context.error) {
      diagnostics.push(pm2Context.error);
    }
    if (error && !diagnostics.includes(error)) {
      diagnostics.push(error);
    }
    if (processStatus === 'errored') {
      diagnostics.push('PM2 reports the vendored code-server process as errored.');
    }
    if (processStatus === 'online' && !health.reachable) {
      diagnostics.push('PM2 reports code-server online, but the local health probe failed.');
    }

    return {
      runtime: {
        ...snapshot,
        diagnostics,
        health: {
          ...health,
          url: this.getBaseUrl(),
        },
        message: diagnostics[0] ?? snapshot.message,
      },
      processStatus,
      restartCount,
      pm2Available: pm2Context.available,
      pm2ExecutablePath,
      error,
    };
  }

  private buildManagedServiceEnvironment(paths: CodeServerManagedPaths): NodeJS.ProcessEnv {
    const config = this.getConfig();
    return {
      PASSWORD: config.password,
      PORT: String(config.port),
      CODE_SERVER_BIND_HOST: '127.0.0.1',
      CODE_SERVER_BIND_PORT: String(config.port),
      HAGICODE_CODE_SERVER_DESKTOP_MANAGED: 'true',
      HAGICODE_RUNTIME_HOME: this.pathManager.getRuntimeProgramHome(),
      HAGICODE_RUNTIME_DATA_HOME: this.pathManager.getCodeServerRuntimeDataHome(),
      HAGICODE_CODE_SERVER_RUNTIME_ROOT: this.pathManager.getCodeServerRuntimeRoot(),
      HAGICODE_CODE_SERVER_DATA_DIR: paths.data,
      HAGICODE_CODE_SERVER_EXTENSIONS_DIR: paths.extensions,
    };
  }

  private async resolvePm2Context(): Promise<{
    executablePath: string | null;
    available: boolean;
    error?: string;
  }> {
    try {
      const pm2Context = await this.dependencyManagementService.getManagedCommandContext('pm2');
      if (pm2Context.packageStatus?.status !== 'installed' || !pm2Context.executablePath) {
        return {
          executablePath: pm2Context.executablePath,
          available: false,
          error: 'Desktop-managed PM2 is unavailable. Install or repair PM2 from Dependency Management first.',
        };
      }

      return {
        executablePath: pm2Context.executablePath,
        available: true,
      };
    } catch (error) {
      return {
        executablePath: null,
        available: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getManagedConfigDirectory(paths: CodeServerManagedPaths): string {
    return path.join(paths.root, 'config');
  }

  private getManagedConfigFilePath(paths: CodeServerManagedPaths): string {
    return path.join(this.getManagedConfigDirectory(paths), 'config.yaml');
  }

  private async syncManagedConfigFile(paths: CodeServerManagedPaths): Promise<string> {
    const configDirectory = this.getManagedConfigDirectory(paths);
    const configPath = this.getManagedConfigFilePath(paths);
    const config = this.getConfig();
    const contents = [
      `bind-addr: ${JSON.stringify(`127.0.0.1:${config.port}`)}`,
      'auth: password',
      `password: ${JSON.stringify(config.password)}`,
      `user-data-dir: ${JSON.stringify(paths.data)}`,
      `extensions-dir: ${JSON.stringify(paths.extensions)}`,
      'log: info',
      '',
    ].join('\n');

    await fs.mkdir(configDirectory, { recursive: true });
    await fs.writeFile(configPath, contents, 'utf8');
    return configPath;
  }

  private async createRuntimeContext(
    paths: CodeServerManagedPaths,
    serviceEnv: NodeJS.ProcessEnv = this.buildManagedServiceEnvironment(paths),
  ): Promise<HagiscriptRuntimeContext> {
    await this.syncManagedConfigFile(paths);
    const runtime = await inspectVendoredCodeServerRuntime(this.pathManager);
    const launchScriptPath = runtime.entryScriptPath ?? runtime.wrapperPath ?? null;
    if (!launchScriptPath) {
      throw new Error(runtime.message ?? 'Vendored code-server runtime is not ready.');
    }

    const config = this.getConfig();
    const launchWorkingDirectory = this.pathManager.getCodeServerRuntimeRoot();
    return await this.hagiscriptRuntimeContextResolver.resolveBundledRuntime({
      service: 'code-server',
      launchScriptPath,
      launchWorkingDirectory,
      launchArgs: [
        '--bind-addr',
        `127.0.0.1:${config.port}`,
        '--auth',
        'password',
        '--user-data-dir',
        paths.data,
        '--extensions-dir',
        paths.extensions,
        '--disable-telemetry',
      ],
      serviceEnv,
    });
  }

  private async refreshLegacyLogs(paths: CodeServerManagedPaths): Promise<void> {
    const pm2Context = await this.resolvePm2Context();
    const runtime = await inspectVendoredCodeServerRuntime(this.pathManager);
    if (!pm2Context.available || (!runtime.wrapperPath && !runtime.entryScriptPath)) {
      return;
    }

    const runtimeContext = await this.createRuntimeContext(paths);
    try {
      await this.syncLegacyLogFiles(runtimeContext, paths);
    } finally {
      await runtimeContext.cleanup();
    }
  }

  private async syncLegacyLogFiles(context: HagiscriptRuntimeContext, paths: CodeServerManagedPaths): Promise<void> {
    const mappings = [
      {
        source: path.join(context.pm2LogsDirectory, `${context.appName}-out.log`),
        target: path.join(paths.logs, OUT_LOG_FILE),
      },
      {
        source: path.join(context.pm2LogsDirectory, `${context.appName}-error.log`),
        target: path.join(paths.logs, ERROR_LOG_FILE),
      },
    ];

    for (const mapping of mappings) {
      try {
        const content = await fs.readFile(mapping.source, 'utf8');
        await fs.writeFile(mapping.target, content, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }
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
    if (runtimeStatus === 'enable-required' || runtimeStatus === 'extracting') {
      return 'stopped';
    }
    if (processStatus === 'online' || runtimeStatus === 'running') {
      return 'running';
    }
    if (!pm2Available || processStatus === 'errored' || processStatus === 'unknown') {
      return 'error';
    }
    return 'stopped';
  }

  private resolveStatusError(
    runtime: VendoredRuntimeStatusSnapshot,
    pm2Available: boolean,
    processStatus: CodeServerProcessStatus,
    statusError?: string,
  ): string | undefined {
    if (runtime.status === 'enable-required' || runtime.status === 'extracting') {
      return runtime.message;
    }
    if (runtime.diagnostics[0]) {
      return runtime.diagnostics[0];
    }
    if (!pm2Available) {
      return statusError ?? 'Desktop-managed PM2 is unavailable.';
    }
    if (processStatus === 'errored') {
      return 'PM2 reports the Desktop-managed Code Server process as errored.';
    }
    return statusError;
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

  private isLifecycleResultSuccessful(
    action: VendoredRuntimeLifecycleAction,
    result: HagiscriptServerLifecycleResult,
  ): boolean {
    if (!result.success) {
      return false;
    }

    if (action === 'stop') {
      return result.status === 'stopped' || result.status === 'missing';
    }

    return result.status === 'online';
  }

  private createHagiscriptCommandError(
    action: VendoredRuntimeLifecycleAction,
    result: HagiscriptServerLifecycleResult,
  ): CodeServerLifecycleCommandError {
    return new CodeServerLifecycleCommandError(
      result.success
        ? `Desktop SDK PM2 reported ${result.status} during ${action}.`
        : result.summary,
      {
        stdout: result.stdout,
        stderr: result.stderr || result.summary,
        exitCode: result.exitCode,
      },
    );
  }

  private async appendLifecycleFailureLog(
    paths: CodeServerManagedPaths,
    action: VendoredRuntimeLifecycleAction,
    error: unknown,
  ): Promise<void> {
    const errorLogPath = path.join(paths.logs, ERROR_LOG_FILE);
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
}
