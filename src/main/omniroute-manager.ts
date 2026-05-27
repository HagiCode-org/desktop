import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { electron } from '../electron-api.js';
import log from 'electron-log';
import { ConfigManager } from './config.js';
import type DependencyManagementService from './dependency-management-service.js';
import type { ManagedNpmCommandContext } from './dependency-management-service.js';
import {
  HagiscriptPm2Manager,
  type HagiscriptServerLifecycleResult,
} from './hagiscript-server-manager.js';
import {
  HagiscriptRuntimeContextResolver,
  type HagiscriptRuntimeContext,
} from './hagiscript-runtime-context.js';
import { buildOmniRouteDependencyRemediation } from './omniroute-remediation.js';
import { inspectVendoredOmniRouteRuntime } from './omniroute-runtime.js';
import {
  getVendoredRuntimeActivationService,
} from './vendored-runtime-activation.js';
import { PathManager } from './path-manager.js';
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
import type {
  VendoredRuntimeLifecycleResult,
  VendoredRuntimePathOpenResult,
  VendoredRuntimeHealthSnapshot,
  VendoredRuntimeStatusSnapshot,
} from '../types/dependency-management.js';

const { shell } = electron;

class OmniRouteLifecycleCommandError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;

  constructor(message: string, result: { stdout: string; stderr: string; exitCode: number | null }) {
    super(message);
    this.name = 'OmniRouteLifecycleCommandError';
    this.stdout = result.stdout;
    this.stderr = result.stderr;
    this.exitCode = result.exitCode;
  }
}

interface OmniRouteStatusDetails {
  runtime: VendoredRuntimeStatusSnapshot;
  process: OmniRouteProcessSnapshot;
  pm2Available: boolean;
  pm2ExecutablePath: string | null;
  remediation?: OmniRouteLifecycleResult['remediation'];
  error?: string;
}

export interface OmniRouteManagerOptions {
  configManager: ConfigManager;
  dependencyManagementService: DependencyManagementService;
  pathManager?: PathManager;
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

function toStatus(value: string | undefined): OmniRouteProcessStatus {
  if (value === 'online') {
    return 'online';
  }
  if (value === 'stopped' || value === 'stopping' || value === 'launching' || value === 'missing') {
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
  private readonly pathManager: PathManager;
  private readonly openPathImpl: (targetPath: string) => Promise<string>;
  private readonly hagiscriptRuntimeContextResolver: HagiscriptRuntimeContextResolver;
  private readonly hagiscriptPm2Manager: HagiscriptPm2Manager;
  private readonly vendoredRuntimeActivationService: ReturnType<typeof getVendoredRuntimeActivationService>;

  constructor(options: OmniRouteManagerOptions) {
    this.configManager = options.configManager;
    this.dependencyManagementService = options.dependencyManagementService;
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

  getPaths(): OmniRouteManagedPaths {
    const root = this.pathManager.getOmniRouteRuntimeDataHome();
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

  async enableVendoredRuntime(): Promise<VendoredRuntimeLifecycleResult> {
    const result = await this.runRuntimeActivation('enable');
    return {
      success: result.success,
      runtimeId: 'omniroute',
      action: 'enable',
      status: result.status.runtime,
      error: result.error,
    };
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

  async startVendoredRuntime(): Promise<VendoredRuntimeLifecycleResult> {
    const result = await this.start();
    return {
      success: result.success,
      runtimeId: 'omniroute',
      action: 'start',
      status: await this.getRuntimeSnapshot(),
      error: result.error,
    };
  }

  async stopVendoredRuntime(): Promise<VendoredRuntimeLifecycleResult> {
    const result = await this.stop();
    return {
      success: result.success,
      runtimeId: 'omniroute',
      action: 'stop',
      status: await this.getRuntimeSnapshot(),
      error: result.error,
    };
  }

  async restartVendoredRuntime(): Promise<VendoredRuntimeLifecycleResult> {
    const result = await this.restart();
    return {
      success: result.success,
      runtimeId: 'omniroute',
      action: 'restart',
      status: await this.getRuntimeSnapshot(),
      error: result.error,
    };
  }

  async repairVendoredRuntime(): Promise<VendoredRuntimeLifecycleResult> {
    const result = await this.runRuntimeActivation('repair');
    return {
      success: result.success,
      runtimeId: 'omniroute',
      action: 'repair',
      status: result.status.runtime,
      error: result.error,
    };
  }

  async openVendoredRuntimePath(target: 'logs' | 'runtime-root'): Promise<VendoredRuntimePathOpenResult> {
    const resolvedPath = target === 'runtime-root'
      ? this.pathManager.getOmniRouteRuntimeRoot()
      : (await this.ensureLayout()).logs;
    const result = await this.openPathImpl(resolvedPath);
    return {
      success: result.length === 0,
      runtimeId: 'omniroute',
      target,
      path: resolvedPath,
      error: result.length > 0 ? result : undefined,
    };
  }

  async getStatus(): Promise<OmniRouteStatusSnapshot> {
    const paths = await this.ensureLayout();
    const details = await this.resolveStatusDetails(paths);
    const error = details.remediation?.message ?? details.error;
    const overallStatus = details.runtime.status === 'missing' || details.runtime.status === 'damaged'
      ? 'error'
      : error && details.process.status !== 'online'
        ? 'error'
        : this.resolveOverallStatus(details.process, details.pm2Available);

    return {
      status: overallStatus,
      config: this.getConfig(),
      runtime: details.runtime,
      paths,
      processes: [details.process],
      pm2Available: details.pm2Available,
      pm2ExecutablePath: details.pm2ExecutablePath,
      error,
      remediation: details.remediation,
      generatedAt: new Date().toISOString(),
    };
  }

  async readLog(request: OmniRouteLogReadRequest): Promise<OmniRouteLogReadResult> {
    const paths = await this.ensureLayout();
    const fileName = LOG_FILE_BY_TARGET[request.target];
    if (!fileName) {
      throw new Error(`Unsupported OmniRoute log target: ${request.target}`);
    }

    await this.refreshLegacyLogs(paths).catch(() => undefined);

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
    let remediation: OmniRouteLifecycleResult['remediation'] | undefined;
    try {
      this.validatePort(this.getConfig().port);

      const hagiscriptContext = await this.resolveDependencyContext();
      const activationFailure = action === 'start' || action === 'restart'
        ? await this.ensureRuntimeReadyForLifecycle(action)
        : null;
      if (activationFailure) {
        throw new Error(activationFailure);
      }

      const runtime = await inspectVendoredOmniRouteRuntime(this.pathManager);
      remediation = this.buildRemediation(runtime, hagiscriptContext);
      if (remediation) {
        throw new Error(remediation.message);
      }

      const managedEnv = this.buildManagedServiceEnvironment(paths);
      await this.renderEnvironment(paths, managedEnv);
      const runtimeContext = await this.createRuntimeContext(paths, managedEnv);

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

  private async resolveStatusDetails(paths?: OmniRouteManagedPaths): Promise<OmniRouteStatusDetails> {
    const resolvedPaths = paths ?? await this.ensureLayout();
    const hagiscriptContext = await this.resolveDependencyContext();
    const runtimeWithoutHealth = await inspectVendoredOmniRouteRuntime(this.pathManager);
    const remediation = this.buildRemediation(runtimeWithoutHealth, hagiscriptContext);
    let lifecycleResult: HagiscriptServerLifecycleResult | null = null;
    let pm2ExecutablePath: string | null = null;
    let error: string | undefined;

    if (!remediation) {
      try {
        const runtimeContext = await this.createRuntimeContext(resolvedPaths);
        try {
          lifecycleResult = await this.hagiscriptPm2Manager.status(runtimeContext);
          await this.syncLegacyLogFiles(runtimeContext, resolvedPaths);
        } finally {
          await runtimeContext.cleanup();
        }

        pm2ExecutablePath = lifecycleResult.pm2BinaryPath;
        if (!lifecycleResult.success) {
          error = lifecycleResult.summary;
        }
      } catch (statusError) {
        error = statusError instanceof Error ? statusError.message : String(statusError);
      }
    }

    const process = lifecycleResult && lifecycleResult.success
      ? this.mapLifecycleResultToProcess(lifecycleResult)
      : this.emptyProcessSnapshot();
    const runtime = await inspectVendoredOmniRouteRuntime(this.pathManager, {
      health: this.buildHealthSnapshot(process, lifecycleResult, error),
    });

    return {
      runtime,
      process,
      pm2Available: this.isManagedPackageAvailable(hagiscriptContext),
      pm2ExecutablePath,
      remediation,
      error,
    };
  }

  private async resolveDependencyContext(): Promise<ManagedNpmCommandContext> {
    return await this.dependencyManagementService.getManagedCommandContext('hagiscript');
  }

  private buildManagedServiceEnvironment(paths: OmniRouteManagedPaths): NodeJS.ProcessEnv {
    const config = this.getConfig();
    const updatedAt = new Date().toISOString();
    return {
      PORT: String(config.port),
      OMNIROUTE_PORT: String(config.port),
      DASHBOARD_PORT: String(config.port),
      API_PORT: String(config.port),
      HOSTNAME: '0.0.0.0',
      NODE_ENV: 'production',
      NODE_OPTIONS: `--max-old-space-size=${resolveOmniRouteMemoryLimitMb()}`,
      OMNIROUTE_BASE_URL: config.baseUrl,
      OMNIROUTE_CONFIG_DIR: paths.config,
      OMNIROUTE_DATA_DIR: paths.data,
      OMNIROUTE_LOG_DIR: paths.logs,
      OMNIROUTE_ENV_DIR: paths.config,
      OMNIROUTE_ENV_PATH: paths.envFile,
      OMNIROUTE_RUNTIME_DIR: paths.runtime,
      DATA_DIR: paths.data,
      CLIPROXYAPI_CONFIG_DIR: paths.config,
      INITIAL_PASSWORD: config.password,
      OMNIROUTE_DESKTOP_MANAGED: 'true',
      OMNIROUTE_DESKTOP_PASSWORD: config.password,
      OMNIROUTE_DESKTOP_SECRET: config.password,
      OMNIROUTE_DESKTOP_UPDATED_AT: updatedAt,
    };
  }

  private async renderEnvironment(paths: OmniRouteManagedPaths, env: NodeJS.ProcessEnv): Promise<void> {
    const keys = [
      'PORT',
      'OMNIROUTE_PORT',
      'DASHBOARD_PORT',
      'API_PORT',
      'HOSTNAME',
      'NODE_ENV',
      'NODE_OPTIONS',
      'OMNIROUTE_BASE_URL',
      'OMNIROUTE_CONFIG_DIR',
      'OMNIROUTE_DATA_DIR',
      'OMNIROUTE_LOG_DIR',
      'OMNIROUTE_ENV_DIR',
      'OMNIROUTE_ENV_PATH',
      'OMNIROUTE_RUNTIME_DIR',
      'DATA_DIR',
      'CLIPROXYAPI_CONFIG_DIR',
      'INITIAL_PASSWORD',
      'OMNIROUTE_DESKTOP_MANAGED',
      'OMNIROUTE_DESKTOP_PASSWORD',
      'OMNIROUTE_DESKTOP_SECRET',
      'OMNIROUTE_DESKTOP_UPDATED_AT',
    ] as const;

    const contents = `${keys.map((key) => `${key}=${quoteEnv(env[key] ?? '')}`).join('\n')}\n`;
    await fs.writeFile(paths.envFile, contents, 'utf8');
  }

  private async createRuntimeContext(
    paths: OmniRouteManagedPaths,
    serviceEnv: NodeJS.ProcessEnv = this.buildManagedServiceEnvironment(paths),
  ): Promise<HagiscriptRuntimeContext> {
    return await this.hagiscriptRuntimeContextResolver.resolveBundledRuntime({
      service: 'omniroute',
      serviceEnv,
    });
  }

  private async runRuntimeActivation(
    action: 'enable' | 'repair',
  ): Promise<OmniRouteLifecycleResult> {
    const activation = await this.vendoredRuntimeActivationService.activate('omniroute');
    return {
      success: activation.success,
      action,
      status: await this.getStatus(),
      error: activation.error,
      remediation: activation.success ? undefined : await this.getStatus().then((status) => status.remediation),
    };
  }

  private async ensureRuntimeReadyForLifecycle(
    action: Extract<OmniRouteLifecycleAction, 'start' | 'restart'>,
  ): Promise<string | null> {
    const runtime = await inspectVendoredOmniRouteRuntime(this.pathManager);
    if (runtime.status === 'extracting') {
      return runtime.message ?? 'Vendored OmniRoute runtime activation is already in progress.';
    }

    if (runtime.primaryAction === 'enable' || runtime.primaryAction === 'repair') {
      const activation = await this.vendoredRuntimeActivationService.activate('omniroute');
      if (!activation.success) {
        return activation.error ?? activation.status.message ?? 'Vendored OmniRoute runtime activation failed.';
      }
    }

    const readyRuntime = await inspectVendoredOmniRouteRuntime(this.pathManager);
    if (!readyRuntime.wrapperPath && !readyRuntime.entryScriptPath) {
      return readyRuntime.message ?? 'Vendored OmniRoute runtime is not ready.';
    }

    return null;
  }

  private buildRemediation(
    runtime: VendoredRuntimeStatusSnapshot,
    hagiscriptContext: ManagedNpmCommandContext,
  ): OmniRouteLifecycleResult['remediation'] {
    return buildOmniRouteDependencyRemediation({
      runtime: {
        runtimeId: 'omniroute',
        runtimeInstallStatus: runtime.installStatus,
      },
      packages: [
        {
          packageId: 'hagiscript',
          packageStatus: hagiscriptContext.packageStatus?.status ?? null,
          executablePath: hagiscriptContext.executablePath,
          installedVersion: hagiscriptContext.packageStatus?.version ?? null,
        },
      ],
    });
  }

  private isManagedPackageAvailable(context: ManagedNpmCommandContext): boolean {
    return context.packageStatus?.status === 'installed' && context.executablePath !== null;
  }

  private mapLifecycleResultToProcess(result: HagiscriptServerLifecycleResult): OmniRouteProcessSnapshot {
    return {
      name: OMNIROUTE_PROCESS_NAME,
      status: toStatus(result.status),
      pid: result.pid,
      restartCount: result.restartCount,
      uptime: result.pmUptime ? Math.max(0, Date.now() - result.pmUptime) : null,
    };
  }

  private buildHealthSnapshot(
    process: OmniRouteProcessSnapshot,
    lifecycleResult: HagiscriptServerLifecycleResult | null,
    error?: string,
  ): VendoredRuntimeHealthSnapshot {
    return {
      reachable: process.status === 'online',
      url: buildBaseUrl(this.getConfig().port),
      lastCheckedAt: new Date().toISOString(),
      message: process.status === 'online'
        ? undefined
        : error
          ? error
          : lifecycleResult?.summary ?? 'Desktop-managed OmniRoute process is not running.',
    };
  }

  private isLifecycleResultSuccessful(
    action: OmniRouteLifecycleAction,
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
    action: OmniRouteLifecycleAction,
    result: HagiscriptServerLifecycleResult,
  ): OmniRouteLifecycleCommandError {
    return new OmniRouteLifecycleCommandError(
      result.success
        ? `hagiscript PM2 reported ${result.status} during ${action}.`
        : result.summary,
      {
        stdout: result.stdout,
        stderr: result.stderr || result.summary,
        exitCode: result.exitCode,
      },
    );
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

  private async refreshLegacyLogs(paths: OmniRouteManagedPaths): Promise<void> {
    const hagiscriptContext = await this.resolveDependencyContext();
    const runtime = await inspectVendoredOmniRouteRuntime(this.pathManager);
    const remediation = this.buildRemediation(runtime, hagiscriptContext);
    if (remediation) {
      return;
    }

    const runtimeContext = await this.createRuntimeContext(paths);
    try {
      await this.syncLegacyLogFiles(runtimeContext, paths);
    } finally {
      await runtimeContext.cleanup();
    }
  }

  private async syncLegacyLogFiles(context: HagiscriptRuntimeContext, paths: OmniRouteManagedPaths): Promise<void> {
    const mappings = [
      {
        source: path.join(context.pm2LogsDirectory, `${context.appName}-out.log`),
        target: path.join(paths.logs, LOG_FILE_BY_TARGET['service-out']),
      },
      {
        source: path.join(context.pm2LogsDirectory, `${context.appName}-error.log`),
        target: path.join(paths.logs, LOG_FILE_BY_TARGET['service-error']),
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

  private async buildFallbackStatus(error: unknown): Promise<OmniRouteStatusSnapshot> {
    const paths = this.getPaths();
    const config = this.getConfig();
    const runtime = await inspectVendoredOmniRouteRuntime(this.pathManager, {
      health: {
        reachable: false,
        url: buildBaseUrl(config.port),
        lastCheckedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      },
    });
    return {
      status: 'error',
      config,
      runtime,
      paths,
      processes: [this.emptyProcessSnapshot()],
      pm2Available: false,
      pm2ExecutablePath: null,
      error: error instanceof Error ? error.message : String(error),
      generatedAt: new Date().toISOString(),
    };
  }
}

export default OmniRouteManager;
