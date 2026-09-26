import path from 'node:path';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import log from 'electron-log';
import { electron } from '../electron-api.js';
import { ConfigManager } from './config.js';
import { PathManager } from './path-manager.js';
import { manifestReader, type EntryPoint, type StartResult } from './manifest-reader.js';
import {
  buildSnapshotLogLines,
  buildManagedServiceEnv,
  MANAGED_ENV_VAR_DEFINITIONS,
  resolveEnvSnapshotLogLevel,
  type ManagedEnvSnapshotEntry,
} from './web-service-env.js';
import {
  buildDesktopSystemVaultEnv,
  createDesktopSystemVaultPathResolver,
  SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX,
} from './system-vault-env.js';
import { loadConsoleEnvironment } from './shell-env-loader.js';
import { desktopHttpClient, type DesktopHttpClient } from './http-client.js';
import { executeCli } from './utils/cli-executor.js';
import { validateFrameworkDependentPayload } from './embedded-runtime.js';
import { evaluateDesktopCompatibility } from './desktop-compatibility.js';
import type { DependencyManagementService } from './dependency-management-service.js';
import {
  buildAccessUrl,
  coerceListenHost,
  DEFAULT_WEB_SERVICE_HOST,
  normalizeListenHost,
  resolveProbeHostsForListenHost,
} from '../types/web-service-network.js';
import type { ActiveRuntimeDescriptor, DistributionMode } from '../types/distribution-mode.js';
import {
  resolveSteamIntegration,
  HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENV_KEY,
} from './steam-integration-env.js';
import {
  BackendProcessOwner,
  type BackendProcessLaunch,
  type BackendProcessSnapshot,
} from './backend-process-owner.js';

const { app } = electron;

export type ProcessStatus = 'running' | 'stopped' | 'error' | 'starting' | 'stopping';

export enum StartupPhase {
  Idle = 'idle',
  CheckingVersion = 'checking_version',
  CheckingDependencies = 'checking_dependencies',
  Spawning = 'spawning',
  WaitingListening = 'waiting_listening',
  HealthCheck = 'health_check',
  Running = 'running',
  Error = 'error'
}

export interface WebServiceConfig {
  port: number;
  host: string;
  executablePath?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ProcessInfo {
  status: ProcessStatus;
  uptime: number;
  startTime: number | null;
  pid: number | null;
  url: string | null;
  restartCount: number;
  phase: StartupPhase;
  phaseMessage?: string;
  host: string;
  port: number;
}

interface WebServiceStateFile {
  schemaVersion?: number;
  lastSuccessfulHost?: string;
  lastSuccessfulPort?: number;
  savedAt?: string;
}

interface PreparedServiceEnvironment {
  mergedEnv: NodeJS.ProcessEnv;
  managedSnapshot: ManagedEnvSnapshotEntry[];
}

export interface ManagedLaunchContext {
  serviceDllPath: string;
  serviceWorkingDirectory: string;
  requiredRuntimeLabel?: string;
}

interface ResolveManagedLaunchContextOptions {
  logResolvedContext?: boolean;
}

interface WebServiceManagerDeps {
  configManager?: ConfigManager | null;
  httpClient?: DesktopHttpClient;
  dependencyManagementService?: DependencyManagementService | null;
  backendProcessOwner?: BackendProcessOwner;
  pathManager?: WebServicePathManager;
  resolveLaunchContext?: typeof resolveManagedLaunchContextForRuntimeRoot;
  prepareServiceEnvironment?: () => Promise<NodeJS.ProcessEnv>;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  maxRestartAttempts?: number;
  resolveTurboEngineDlcProgramOption?: (() => { enabled: boolean | null; source: string | null } | null) | null;
}

type WebServicePathManager = Pick<
  PathManager,
  | 'getRuntimeDataHome'
  | 'getCurrentPlatform'
  | 'getDesktopLogsDirectory'
  | 'getDesktopAppsRoot'
  | 'getDesktopConfigDirectory'
  | 'getEmbeddedDotnetPath'
  | 'getInstalledVersionPath'
  | 'getPaths'
  | 'getDataDirectory'
  | 'getAppSettingsPath'
>;

export interface StartupFailureInfo {
  summary: string;
  log: string;
  port: number;
  timestamp: string;
  truncated: boolean;
}

type ManagedLaunchErrorCode =
  | 'invalid-service-payload'
  | 'desktop-incompatible';

class ManagedLaunchError extends Error {
  code: ManagedLaunchErrorCode;

  constructor(code: ManagedLaunchErrorCode, message: string) {
    super(message);
    this.name = 'ManagedLaunchError';
    this.code = code;
  }
}

export async function resolveManagedLaunchContextForRuntimeRoot(
  activeVersionPath: string,
  desktopVersion: string = app.getVersion(),
  options: ResolveManagedLaunchContextOptions = {},
): Promise<ManagedLaunchContext> {
  const manifest = await manifestReader.readManifest(activeVersionPath);
  const desktopCompatibility = evaluateDesktopCompatibility(manifest, desktopVersion);
  if (!desktopCompatibility.compatible) {
    throw new ManagedLaunchError(
      'desktop-incompatible',
      desktopCompatibility.reason ?? 'Package requires a newer Desktop version.',
    );
  }

  const payloadValidation = await validateFrameworkDependentPayload(activeVersionPath, manifest);
  if (!payloadValidation.startable) {
    throw new ManagedLaunchError(
      'invalid-service-payload',
      `Invalid service payload: ${payloadValidation.message ?? 'framework-dependent payload validation failed.'}`,
    );
  }

  if (options.logResolvedContext) {
    log.info('[WebService] Managed entry point:', payloadValidation.payloadPaths.serviceDllPath);
    log.info('[WebService] Managed working directory:', path.dirname(payloadValidation.payloadPaths.serviceDllPath));
    if (payloadValidation.requirement?.effectiveLabel) {
      log.info('[WebService] Required ASP.NET Core runtime:', payloadValidation.requirement.effectiveLabel);
    }
  }

  return {
    serviceDllPath: payloadValidation.payloadPaths.serviceDllPath,
    serviceWorkingDirectory: path.dirname(payloadValidation.payloadPaths.serviceDllPath),
    requiredRuntimeLabel: payloadValidation.requirement?.effectiveLabel,
  };
}

export class PCodeWebServiceManager {
  private config: WebServiceConfig;
  private readonly configManager: ConfigManager | null;
  private readonly httpClient: DesktopHttpClient;
  private dependencyManagementService: DependencyManagementService | null;
  private readonly resolveTurboEngineDlcProgramOption: (() => { enabled: boolean | null; source: string | null } | null) | null;
  private status: ProcessStatus = 'stopped';
  private startTime: number | null = null;
  private restartCount: number = 0;
  private maxRestartAttempts: number = 3;
  private startTimeout: number;
  private stopTimeout: number;
  private pathManager: WebServicePathManager;
  private currentPhase: StartupPhase = StartupPhase.Idle;
  private activeVersionPath: string | null = null; // Path to the active version installation
  private entryPoint: EntryPoint | null = null; // EntryPoint from manifest
  private activeVersionId: string | null = null;
  private activeRuntime: ActiveRuntimeDescriptor | null = null;
  private readonly savedConfigInitialization: Promise<void>;
  private lastManagedEnvSnapshot: ManagedEnvSnapshotEntry[] = [];
  private readonly healthCheckPaths: readonly string[] = ['/api/health', '/api/health/dual-monitoring', '/api/status'];
  private readonly startupLogMaxLines: number = 200;
  private readonly startupLogMaxChars: number = 16 * 1024;
  private startupLogLines: string[] = [];
  private startupLogTruncated: boolean = false;
  private lastResolvedServiceEnv: NodeJS.ProcessEnv | null = null;
  private lastHealthCheckLogState: 'healthy' | 'unhealthy' | null = null;
  private distributionMode: DistributionMode = 'normal';
  private statusRequestPromise: Promise<ProcessInfo> | null = null;
  private readonly backendProcessOwner: BackendProcessOwner;
  private readonly orphanReconciliation: Promise<void>;
  private orphanReconciliationError: Error | null = null;
  private lifecycleQueue: Promise<void> = Promise.resolve();
  private cleanupPromise: Promise<void> | null = null;
  private ownedBackend: BackendProcessSnapshot | null = null;
  private explicitStopInProgress = false;
  private explicitStopRequested = false;
  private lastBackendWasRunning = false;
  private readonly resolveLaunchContext: typeof resolveManagedLaunchContextForRuntimeRoot;
  private readonly prepareServiceEnvironmentOverride?: () => Promise<NodeJS.ProcessEnv>;

  constructor(config: WebServiceConfig, deps: WebServiceManagerDeps = {}) {
    this.config = {
      ...config,
      host: coerceListenHost(config.host),
    };
    this.configManager = deps.configManager ?? null;
    this.httpClient = deps.httpClient ?? desktopHttpClient;
    this.pathManager = deps.pathManager ?? PathManager.getInstance();
    this.resolveLaunchContext = deps.resolveLaunchContext ?? resolveManagedLaunchContextForRuntimeRoot;
    this.prepareServiceEnvironmentOverride = deps.prepareServiceEnvironment;
    this.startTimeout = deps.startupTimeoutMs ?? 30_000;
    this.stopTimeout = deps.shutdownTimeoutMs ?? 10_000;
    this.maxRestartAttempts = deps.maxRestartAttempts ?? 3;
    this.dependencyManagementService = deps.dependencyManagementService ?? null;
    this.resolveTurboEngineDlcProgramOption = deps.resolveTurboEngineDlcProgramOption ?? null;
    this.backendProcessOwner = deps.backendProcessOwner ?? new BackendProcessOwner(
      path.join(this.pathManager.getRuntimeDataHome(), 'backend-process.json'),
      {
        onOutput: (stream, text) => this.appendDiagnosticOutput(`Backend ${stream}`, text),
        onError: (message, error) => {
          this.appendStartupLogLine(message);
          log.error('[WebService][BackendProcessOwner]', message, error);
        },
        onExit: (code, signal) => {
          const exitSummary = `Owned backend exited (code=${code ?? 'n/a'}, signal=${signal ?? 'none'}).`;
          this.appendStartupLogLine(exitSummary);
          if (
            this.lastBackendWasRunning
            && !this.explicitStopRequested
            && !this.explicitStopInProgress
            && !this.cleanupPromise
          ) {
            this.scheduleUnexpectedBackendRestart();
          }
        },
      },
    );
    this.orphanReconciliation = this.backendProcessOwner.reconcileOrphan().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.orphanReconciliationError = new Error(
        `Unable to safely reconcile a previous Desktop-owned backend: ${message}`,
      );
      this.status = 'error';
      this.currentPhase = StartupPhase.Error;
      this.appendStartupLogLine(this.orphanReconciliationError.message);
      log.error('[WebService] Backend orphan reconciliation failed:', error);
    });

    this.savedConfigInitialization = this.initializeSavedConfig().catch(error => {
      log.error('[WebService] Failed to initialize saved bind config:', error);
    });
  }

  /**
   * Set entry point for service operations
   * @param entryPoint - EntryPoint object from manifest
   */
  setEntryPoint(entryPoint: EntryPoint | null): void {
    this.entryPoint = entryPoint;
    log.info('[WebService] EntryPoint set:', entryPoint);
  }

  setDistributionMode(distributionMode: DistributionMode): void {
    this.distributionMode = distributionMode;
    log.info('[WebService] Distribution mode set:', { distributionMode });
  }

  setDependencyManagementService(dependencyManagementService: DependencyManagementService | null): void {
    this.dependencyManagementService = dependencyManagementService;
  }

  /**
   * Set the active version installation path
   * @param versionId - Version ID (e.g., "hagicode-0.1.0-alpha.9-linux-x64-nort")
   */
  setActiveVersion(versionId: string): void {
    this.setActiveRuntime({
      kind: 'installed-version',
      rootPath: this.pathManager.getInstalledVersionPath(versionId),
      versionId,
      versionLabel: versionId,
      displayName: versionId,
      isReadOnly: false,
    });
  }

  setActiveRuntime(runtime: ActiveRuntimeDescriptor | null): void {
    this.activeRuntime = runtime;
    this.activeVersionId = runtime?.versionId ?? null;
    this.activeVersionPath = runtime?.rootPath ?? null;
    this.lastHealthCheckLogState = null;

    if (runtime) {
      log.info('[WebService] Active runtime set:', {
        kind: runtime.kind,
        rootPath: runtime.rootPath,
        versionId: runtime.versionId ?? null,
      });
      return;
    }

    log.info('[WebService] Active runtime cleared');
  }

  /**
   * Clear the active version (when no version is installed)
   */
  clearActiveVersion(): void {
    this.setActiveRuntime(null);
  }

  private getStateFilePath(): string {
    return this.pathManager.getPaths().webServiceConfig;
  }

  private async readStateFile(): Promise<WebServiceStateFile> {
    const paths = this.pathManager.getPaths();
    const statePath = this.getStateFilePath();

    try {
      await fs.mkdir(paths.config, { recursive: true });
      const content = await fs.readFile(statePath, 'utf-8');
      const parsed = JSON.parse(content) as WebServiceStateFile;
      return this.normalizeStateFile(parsed);
    } catch (error) {
      const errno = (error as NodeJS.ErrnoException).code;
      if (errno !== 'ENOENT') {
        log.warn('[WebService] Failed to read state file, fallback to empty state:', error);
      }
      return {};
    }
  }

  private async writeStateFile(nextState: WebServiceStateFile): Promise<void> {
    const paths = this.pathManager.getPaths();
    const statePath = this.getStateFilePath();

    await fs.mkdir(paths.config, { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(nextState, null, 2), 'utf-8');
  }

  private async updateStateFile(mutator: (state: WebServiceStateFile) => WebServiceStateFile): Promise<void> {
    const current = await this.readStateFile();
    const next = mutator(current);
    await this.writeStateFile(next);
  }

  private normalizeStateFile(state: WebServiceStateFile | null | undefined): WebServiceStateFile {
    if (!state || typeof state !== 'object') {
      return {};
    }

    return {
      ...state,
      lastSuccessfulHost: coerceListenHost(state.lastSuccessfulHost),
    };
  }

  private async ensureSavedConfigInitialized(): Promise<void> {
    await this.savedConfigInitialization;
  }

  private async runLifecycleExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycleQueue.then(operation, operation);
    this.lifecycleQueue = result.then(() => undefined, () => undefined);
    return await result;
  }

  private resetStartupLogBuffer(): void {
    this.startupLogLines = [];
    this.startupLogTruncated = false;
  }

  private appendStartupLogLine(line: string): void {
    const normalized = line.trim();
    if (!normalized) {
      return;
    }

    this.startupLogLines.push(normalized);

    if (this.startupLogLines.length > this.startupLogMaxLines) {
      this.startupLogLines = this.startupLogLines.slice(-this.startupLogMaxLines);
      this.startupLogTruncated = true;
    }
  }

  private appendDiagnosticOutput(label: string, content: string): void {
    const lines = content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .slice(-5);

    for (const line of lines) {
      this.appendStartupLogLine(`${label}: ${line}`);
    }
  }

  private buildStartupFailureInfo(summary: string): StartupFailureInfo {
    const timestamp = new Date().toISOString();
    const fallbackLog = summary || 'Service startup failed without additional output.';
    const lines = this.startupLogLines.length > 0 ? [...this.startupLogLines] : [fallbackLog];
    let logContent = lines.join('\n');

    if (logContent.length > this.startupLogMaxChars) {
      logContent = logContent.slice(logContent.length - this.startupLogMaxChars);
      this.startupLogTruncated = true;
    }

    if (this.startupLogTruncated) {
      logContent = `${logContent}\n[Startup log truncated - showing most recent output]`;
    }

    return {
      summary,
      log: logContent.trim() || fallbackLog,
      port: this.config.port,
      timestamp,
      truncated: this.startupLogTruncated,
    };
  }

  private buildStartupFailureResult(summary: string): StartResult {
    const failure = this.buildStartupFailureInfo(summary);
    return {
      success: false,
      resultSession: {
        exitCode: -1,
        stdout: '',
        stderr: failure.summary,
        duration: 0,
        timestamp: failure.timestamp,
        success: false,
        errorMessage: failure.summary,
        port: failure.port,
      },
      parsedResult: {
        success: false,
        errorMessage: failure.summary,
        rawOutput: failure.log,
        port: failure.port,
      },
      port: failure.port,
    };
  }

  private async resolveDirectBackendLaunchContext(): Promise<ManagedLaunchContext> {
    if (!this.activeVersionPath) {
      throw new Error('No active version set');
    }

    const desktopVersion = app?.getVersion?.() ?? '0.0.0';
    const context = await this.resolveLaunchContext(this.activeVersionPath, desktopVersion, {
      logResolvedContext: true,
    });
    return context;
  }

  private async resolveManagedDotnetExecutable(): Promise<string> {
    const executablePath = path.resolve(this.pathManager.getEmbeddedDotnetPath());
    const stats = await fs.stat(executablePath);
    if (!stats.isFile()) {
      throw new Error(`Managed .NET executable is not a file: ${executablePath}`);
    }
    if (process.platform !== 'win32') {
      await fs.access(executablePath, fsConstants.X_OK);
    }
    return executablePath;
  }

  private buildHagiscriptServiceEnvironment(baseEnv: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
    return {
      ...(this.config.env ?? {}),
      ...(baseEnv ?? {}),
      ASPNETCORE_ENVIRONMENT: baseEnv?.ASPNETCORE_ENVIRONMENT ?? this.config.env?.ASPNETCORE_ENVIRONMENT ?? 'Production',
      ASPNETCORE_URLS: buildAccessUrl(this.config.host, this.config.port),
    };
  }

  private isStartupTransitionActive(): boolean {
    return this.status === 'starting'
      || this.currentPhase === StartupPhase.CheckingVersion
      || this.currentPhase === StartupPhase.CheckingDependencies
      || this.currentPhase === StartupPhase.Spawning
      || this.currentPhase === StartupPhase.WaitingListening
      || this.currentPhase === StartupPhase.HealthCheck;
  }

  syncExternalStartupPhase(phase: StartupPhase, message?: string): void {
    switch (phase) {
      case StartupPhase.Idle:
        this.status = 'stopped';
        this.startTime = null;
        this.restartCount = 0;
        this.lastBackendWasRunning = false;
        break;
      case StartupPhase.CheckingVersion:
      case StartupPhase.CheckingDependencies:
      case StartupPhase.Spawning:
      case StartupPhase.WaitingListening:
      case StartupPhase.HealthCheck:
        this.status = 'starting';
        break;
      case StartupPhase.Running:
        this.status = 'running';
        break;
      case StartupPhase.Error:
        this.status = 'error';
        break;
      default:
        break;
    }

    this.emitPhase(phase, message);
  }

  /**
   * Check if the port is available using system commands (faster and more reliable)
   * @returns Promise resolving to true if port is available, false if in use, null if check failed
   */
  private async checkPortWithSystemCommand(port: number): Promise<boolean | null> {
    const platform = process.platform;

    let command = '';
    let args: string[] = [];
    let shell = false;

    if (platform === 'linux') {
      // Use ss command (modern replacement for netstat)
      command = 'sh';
      args = ['-c', `ss -tuln | grep ":${port} " || true`];
    } else if (platform === 'darwin') {
      // Use lsof on macOS
      command = 'sh';
      args = ['-c', `lsof -i :${port} || true`];
    } else if (platform === 'win32') {
      // Use netstat on Windows; findstr returns exit code 1 when not found.
      command = 'netstat';
      args = ['-an'];
      shell = true;
    }

    if (!command) {
      // Fallback to node check if no system command available
      return null;
    }

    const result = await executeCli({
      command,
      args,
      shell,
      windowsHide: true,
      metadata: { component: 'WebServiceManager', operation: 'checkPortWithSystemCommand', port },
    });

    if (!result.success && platform !== 'win32') {
      return null;
    }

    const stdout = platform === 'win32'
      ? result.stdout.split(/\r?\n/).filter(line => line.includes(`:${port} `)).join('\n')
      : result.stdout;
    const hasOutput = stdout.trim().length > 0;

    return !hasOutput;
  }

  /**
   * Check if the port is available
   * First tries system command for quick check, then falls back to node's net module
   * @returns Promise resolving to true if port is available, false if in use
   */
  public async checkPortAvailable(port?: number): Promise<boolean> {
    await this.ensureSavedConfigInitialized();
    const targetPort = port ?? this.config.port;
    // Try system command first (faster)
    const systemCheck = await this.checkPortWithSystemCommand(targetPort);
    if (systemCheck !== null) {
      return systemCheck;
    }

    // Fallback to node's net module
    const net = await import('node:net');
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', () => {
        resolve(false); // Port is in use
      });

      server.once('listening', () => {
        server.close();
        resolve(true); // Port is available
      });

      server.listen(targetPort, this.config.host);
    });
  }

  /**
   * Emit phase update to renderer
   */
  private emitPhase(phase: StartupPhase, message?: string): void {
    // Store phase for getStatus()
    this.currentPhase = phase;

    // Emit to renderer via IPC
    // Note: Need to access mainWindow from main module
    // This will be handled through a callback or event emitter in a full implementation
    if ((global as any).mainWindow) {
      (global as any).mainWindow.webContents.send('web-service-startup-phase', {
        phase,
        message,
        timestamp: Date.now()
      });
    }

    log.info('[WebService] Phase:', phase, message || '');
  }

  private resolveProbeHosts(host: string): string[] {
    return resolveProbeHostsForListenHost(host);
  }

  private buildHealthCheckUrls(port: number): string[] {
    const hosts = this.resolveProbeHosts(this.config.host);
    return hosts.flatMap((host) => this.healthCheckPaths.map((path) => `http://${host}:${port}${path}`));
  }

  /**
   * Wait for port to be listening
   */
  private async waitForPortListening(timeout: number = 60000): Promise<boolean> {
    const startTime = Date.now();
    const net = await import('node:net');
    let attempt = 0;
    const probeHosts = this.resolveProbeHosts(this.config.host);

    log.info('[WebService] Waiting for port listening:', `${this.config.host}:${this.config.port}`, 'probeHosts:', probeHosts, 'timeout:', timeout);

    while (Date.now() - startTime < timeout) {
      if (!this.ownedBackend?.isAlive()) {
        return false;
      }
      attempt++;
      for (const probeHost of probeHosts) {
        try {
          await new Promise<void>((resolve, reject) => {
            const socket = new net.Socket();
            socket.setTimeout(5000);

            socket.on('connect', () => {
              socket.destroy();
              log.info('[WebService] Port is listening on attempt:', attempt, 'host:', probeHost);
              resolve();
            });

            socket.on('timeout', () => {
              socket.destroy();
              reject(new Error('Timeout'));
            });

            socket.on('error', (err) => {
              socket.destroy();
              reject(new Error(`Connection error: ${err.message}`));
            });

            socket.connect(this.config.port, probeHost);
          });
          return true; // Port is listening
        } catch (error) {
          log.debug('[WebService] Port not ready on attempt:', attempt, 'host:', probeHost, 'error:', (error as Error).message);
        }
      }

      await new Promise(resolve => setTimeout(
        resolve,
        Math.min(500, Math.max(0, timeout - (Date.now() - startTime))),
      ));
    }

    log.error('[WebService] Port listening timeout after', attempt, 'attempts');
    return false; // Timeout
  }

  /**
   * Perform HTTP health check on the web service
   */
  private async performHealthCheck(port: number = this.config.port): Promise<boolean> {
    const urls = this.buildHealthCheckUrls(port);
    let lastErrorMessage = 'No health check endpoint responded';

    for (const url of urls) {
      try {
        const response = await this.httpClient.requestText(url, {
          timeoutMs: 5000,
          validateStatus: () => true,
        });
        if (response.status >= 200 && response.status < 300) {
          if (this.lastHealthCheckLogState !== 'healthy') {
            log.info(
              this.lastHealthCheckLogState === 'unhealthy'
                ? '[WebService] Health check recovered:'
                : '[WebService] Health check passed:',
              url,
              'status:',
              response.status,
            );
          }
          this.lastHealthCheckLogState = 'healthy';
          return true;
        }
        lastErrorMessage = `HTTP ${response.status}`;
        log.debug('[WebService] Health endpoint not ready:', url, 'status:', response.status);
      } catch (error) {
        if (error instanceof Error) {
          lastErrorMessage = error.message;
          log.debug('[WebService] Health endpoint request failed:', url, 'error:', error.message);
        } else {
          lastErrorMessage = 'Unknown error';
          log.debug('[WebService] Health endpoint request failed with unknown error:', url);
        }
      }
    }

    const failureDetails = {
      port,
      host: this.config.host,
      urlsTried: urls,
      reason: lastErrorMessage,
    };

    if (this.lastHealthCheckLogState !== 'unhealthy') {
      log.warn('[WebService] Health check failed after trying all endpoints:', failureDetails);
    } else {
      log.debug('[WebService] Health check still failing after trying all endpoints:', failureDetails);
    }
    this.lastHealthCheckLogState = 'unhealthy';
    return false;
  }

  private getEnvSnapshotLogLevel(mergedEnv: NodeJS.ProcessEnv): 'off' | 'summary' | 'detailed' {
    return resolveEnvSnapshotLogLevel(mergedEnv.HAGICODE_WEB_SERVICE_ENV_LOG_LEVEL);
  }

  private async readExistingServiceConfig(): Promise<Record<string, unknown> | null> {
    const configPath = this.getConfigFilePath();
    try {
      const yaml = await import('js-yaml');
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = yaml.load(content);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn('[WebService] Failed to read existing config for env mapping:', error);
      }
      return null;
    }
  }

  private logManagedEnvSnapshot(mergedEnv: NodeJS.ProcessEnv, entries: ManagedEnvSnapshotEntry[]): void {
    const level = this.getEnvSnapshotLogLevel(mergedEnv);
    if (level === 'off') {
      return;
    }

    log.info('[WebService] Injected environment snapshot:', {
      mode: 'env',
      total: entries.length,
      required: MANAGED_ENV_VAR_DEFINITIONS.filter(item => item.required).length,
    });

    const lines = buildSnapshotLogLines(entries, level);
    for (const line of lines) {
      log.info(line);
    }
  }

  private async prepareServiceEnvironment(): Promise<PreparedServiceEnvironment> {
    if (this.prepareServiceEnvironmentOverride) {
      const mergedEnv = await this.prepareServiceEnvironmentOverride();
      return {
        mergedEnv,
        managedSnapshot: [],
      };
    }

    const existingConfig = await this.readExistingServiceConfig();
    const consoleEnv = await loadConsoleEnvironment();
    const existingEnv = { ...process.env, ...consoleEnv, ...this.config.env };
    const dataDir = this.pathManager.getDataDirectory();
    const systemVaultEnv = await buildDesktopSystemVaultEnv({
      pathResolver: createDesktopSystemVaultPathResolver(this.pathManager),
    });
    const steamIntegration = resolveSteamIntegration({
      distributionMode: this.distributionMode,
      env: process.env,
    });
    const turboEngineDlcProgramOption = this.resolveTurboEngineDlcProgramOption?.() ?? null;

    for (const warning of systemVaultEnv.warnings) {
      log.warn('[WebService][SystemVaultEnv]', warning);
    }

    const buildResult = buildManagedServiceEnv({
      host: this.config.host,
      port: this.config.port,
      dataDir,
      currentDesktopLanguage: this.configManager?.getCurrentLanguage() ?? null,
      turboEngineDlcEnabled: turboEngineDlcProgramOption?.enabled ?? null,
      turboEngineDlcSource: turboEngineDlcProgramOption?.source ?? null,
      steamIntegrationEnabled: steamIntegration.integrationEnabled,
      steamIntegrationSource: steamIntegration.integrationSource === 'distribution-mode'
        ? 'distribution-mode'
        : 'disabled-non-steam',
      steamAchievementSyncEnabled: steamIntegration.achievementSyncEnabled,
      steamAchievementSyncSource: steamIntegration.achievementSyncSource,
      systemVaultEnvEntries: systemVaultEnv.envEntries,
      yamlConfig: existingConfig,
      existingEnv,
    });

    log.info('[WebService][SteamEnv] Resolved Steam backend flags:', {
      distributionMode: this.distributionMode,
      integrationEnabled: steamIntegration.integrationEnabled,
      integrationSource: steamIntegration.integrationSource,
      achievementSyncEnabled: steamIntegration.achievementSyncEnabled,
      achievementSyncSource: steamIntegration.achievementSyncSource,
      hasHagicodeEnvAchievementSyncValue: typeof process.env[HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENV_KEY] === 'string',
    });

    if (buildResult.errors.length > 0) {
      throw new Error(`Environment mapping validation failed: ${buildResult.errors.join('; ')}`);
    }

    for (const warning of buildResult.warnings) {
      log.warn('[WebService][Env]', warning);
    }

    const mergedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...consoleEnv,
      ...this.config.env,
    };

    // Desktop owns this env contract and injects it only into the managed
    // backend child process, so inherited process-level values must not leak.
    for (const key of Object.keys(mergedEnv)) {
      if (
        MANAGED_ENV_VAR_DEFINITIONS.some(item => item.key === key)
        ||
        key.startsWith(SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX)
        || key === 'DATADIR'
        || key === 'DataDir'
      ) {
        delete mergedEnv[key];
      }
    }

    Object.assign(mergedEnv, buildResult.injectedEnv);

    if (Object.keys(consoleEnv).length > 0) {
      log.info('[WebService] Console environment merged for startup:', {
        envCount: Object.keys(consoleEnv).length,
        source: process.platform === 'win32' ? 'powershell-profile' : 'shell-startup-files',
      });
    }

    this.lastManagedEnvSnapshot = buildResult.snapshot;
    this.logManagedEnvSnapshot(mergedEnv, buildResult.snapshot);

    return {
      mergedEnv,
      managedSnapshot: buildResult.snapshot,
    };
  }

  /**
   * Start the web service process with the pinned dotnet host
   * @returns StartResult with service URL and port information
   */
  async start(): Promise<StartResult> {
    return await this.runLifecycleExclusive(async () => await this.startInternal());
  }

  private async startInternal(): Promise<StartResult> {
    await this.ensureSavedConfigInitialized();
    await this.orphanReconciliation;
    this.resetStartupLogBuffer();
    this.appendStartupLogLine(`Starting service with configured host ${this.config.host} and port ${this.config.port}`);

    // A manual Desktop start gets a fresh automatic-restart budget.
    this.restartCount = 0;
    this.lastBackendWasRunning = false;

    const currentOwned = this.backendProcessOwner.snapshot;
    const runtime = this.activeRuntime;
    if (
      currentOwned
      && runtime
      && this.status === 'running'
      && currentOwned.identity.runtimeIdentity === this.getRuntimeIdentity(runtime)
    ) {
      const currentStatus = await this.getStatusInternal();
      if (currentStatus.status === 'running') {
        this.lastBackendWasRunning = true;
        return this.buildSuccessfulStartResult('Desktop-owned backend is already healthy.');
      }
    }

    if (currentOwned) {
      log.warn('[WebService] Existing owned backend detected before start; stopping it before launching current version.');
      this.appendStartupLogLine('Existing service runtime detected; stopping before launching current version');
      const stopped = await this.stopInternal();
      if (!stopped) {
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, 'Failed to stop existing service runtime');
        this.appendStartupLogLine('Start aborted: failed to stop existing service runtime');
        return this.buildStartupFailureResult('Failed to stop existing service runtime');
      }
    }

    if (this.restartCount >= this.maxRestartAttempts) {
      log.error('[WebService] Max restart attempts reached');
      this.status = 'error';
      this.emitPhase(StartupPhase.Error, 'Max restart attempts reached');
      this.appendStartupLogLine(`Start aborted: max restart attempts reached (${this.maxRestartAttempts})`);
      return this.buildStartupFailureResult('Max restart attempts reached');
    }

    if (!this.activeVersionPath) {
      log.error('[WebService] No active version path set');
      this.status = 'error';
      this.emitPhase(StartupPhase.Error, 'No active version');
      this.appendStartupLogLine('Start failed: no active version set');
      return this.buildStartupFailureResult('No active version set');
    }

    return await this.runDirectLifecycleTransition('start');
  }

  private getRuntimeIdentity(runtime: ActiveRuntimeDescriptor): string {
    return `${runtime.kind}:${path.resolve(runtime.rootPath)}:${runtime.versionId ?? ''}`;
  }

  private buildSuccessfulStartResult(stdout: string): StartResult {
    const url = buildAccessUrl(this.config.host, this.config.port);
    return {
      success: true,
      resultSession: {
        exitCode: 0,
        stdout,
        stderr: '',
        duration: Date.now() - (this.startTime ?? Date.now()),
        timestamp: new Date().toISOString(),
        success: true,
        port: this.config.port,
        url,
      },
      parsedResult: {
        success: true,
        rawOutput: 'Desktop-owned backend passed HTTP health verification.',
        port: this.config.port,
        url,
      },
      url,
      port: this.config.port,
    };
  }

  /**
   * Wait for health check with timeout
   */
  private async waitForHealthCheck(): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every second

    while (Date.now() - startTime < this.startTimeout) {
      if (!this.ownedBackend?.isAlive()) {
        return false;
      }
      const isHealthy = await this.performHealthCheck();
      if (isHealthy) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return false;
  }

  /**
   * Stop the web service process
   */
  async stop(): Promise<boolean> {
    this.explicitStopRequested = true;
    return await this.runLifecycleExclusive(async () => await this.stopInternal());
  }

  private async stopInternal(): Promise<boolean> {
    try {
      await this.orphanReconciliation;
      this.explicitStopInProgress = true;
      this.status = 'stopping';
      this.lastHealthCheckLogState = null;
      log.info('[WebService] Stopping web service...');
      await this.backendProcessOwner.stop(this.stopTimeout);
      this.ownedBackend = null;

      this.status = 'stopped';
      this.lastResolvedServiceEnv = null;
      this.startTime = null;
      this.restartCount = 0;
      this.lastBackendWasRunning = false;
      this.currentPhase = StartupPhase.Idle;
      this.lastHealthCheckLogState = null;
      log.info('[WebService] Stopped successfully');
      return true;
    } catch (error) {
      log.error('[WebService] Failed to stop:', error);
      this.status = 'error';
      this.appendStartupLogLine(`Backend shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      this.explicitStopInProgress = false;
      this.explicitStopRequested = false;
    }
  }

  /**
   * Restart the web service
   */
  async restart(): Promise<StartResult> {
    this.explicitStopRequested = true;
    return await this.runLifecycleExclusive(async () => {
      log.info('[WebService] Restarting web service...');
      this.restartCount = 0;
      const stopped = await this.stopInternal();
      if (!stopped) {
        return this.buildStartupFailureResult('Failed to stop the owned backend before restart.');
      }
      return await this.runDirectLifecycleTransition('restart');
    });
  }

  /**
   * Get current process status
   */
  async getStatus(): Promise<ProcessInfo> {
    if (this.statusRequestPromise) {
      return await this.statusRequestPromise;
    }

    this.statusRequestPromise = this.getStatusInternal()
      .finally(() => {
        this.statusRequestPromise = null;
      });

    return await this.statusRequestPromise;
  }

  private async getStatusInternal(): Promise<ProcessInfo> {
    await this.ensureSavedConfigInitialized();
    await this.orphanReconciliation;

    if (this.orphanReconciliationError) {
      this.status = 'error';
      this.currentPhase = StartupPhase.Error;
      return this.buildProcessInfo();
    }

    if (this.explicitStopRequested || this.explicitStopInProgress || this.status === 'stopping') {
      this.status = 'stopping';
      return this.buildProcessInfo();
    }

    const owned = this.backendProcessOwner.snapshot;
    if (!owned || !owned.isAlive()) {
      const restartUnexpectedExit = this.lastBackendWasRunning
        && !this.explicitStopRequested
        && !this.cleanupPromise;
      this.ownedBackend = null;
      this.startTime = null;
      if (restartUnexpectedExit) {
        this.scheduleUnexpectedBackendRestart();
      } else if (!this.isStartupTransitionActive() && this.currentPhase !== StartupPhase.Error) {
        this.status = 'stopped';
        this.currentPhase = StartupPhase.Idle;
      }
      return this.buildProcessInfo();
    }

    if (!this.activeRuntime) {
      this.status = 'error';
      this.currentPhase = StartupPhase.Error;
      this.appendStartupLogLine('An owned backend is running but no active runtime is selected.');
      return this.buildProcessInfo();
    }

    this.ownedBackend = owned;
    const startupTransitionActive = this.isStartupTransitionActive();
    const healthCheckPassed = await this.performHealthCheck();
    if (healthCheckPassed) {
      this.status = 'running';
      this.currentPhase = StartupPhase.Running;
      this.lastBackendWasRunning = true;
      this.startTime = owned.startTime;
      this.lastBackendWasRunning = true;
    } else if (startupTransitionActive && this.currentPhase !== StartupPhase.Error) {
      this.status = 'starting';
      this.currentPhase = StartupPhase.HealthCheck;
      this.startTime = owned.startTime;
    } else {
      this.status = 'error';
      this.currentPhase = StartupPhase.Error;
      this.appendStartupLogLine('The owned backend process is alive, but HTTP health verification failed.');
    }
    return this.buildProcessInfo();
  }

  private buildProcessInfo(): ProcessInfo {
    return {
      status: this.status,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      startTime: this.startTime,
      pid: this.backendProcessOwner.snapshot?.pid ?? null,
      url: this.status === 'running' ? buildAccessUrl(this.config.host, this.config.port) : null,
      restartCount: this.restartCount,
      phase: this.currentPhase,
      port: this.config.port,
      host: this.config.host,
    };
  }

  private scheduleUnexpectedBackendRestart(): void {
    if (this.restartCount >= this.maxRestartAttempts) {
      this.status = 'error';
      this.currentPhase = StartupPhase.Error;
      this.appendStartupLogLine(`Automatic backend restart budget exhausted after ${this.restartCount} retries.`);
      this.lastBackendWasRunning = false;
      return;
    }

    this.restartCount += 1;
    const attempt = this.restartCount;
    this.lastBackendWasRunning = false;
    this.status = 'starting';
    this.currentPhase = StartupPhase.CheckingVersion;
    this.appendStartupLogLine(`Unexpected backend exit; scheduling automatic restart ${attempt}/${this.maxRestartAttempts}.`);
    void this.runLifecycleExclusive(async () => {
      if (this.explicitStopRequested || this.cleanupPromise || this.backendProcessOwner.snapshot) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 1_000, 5_000)));
      if (this.explicitStopRequested || this.cleanupPromise || this.backendProcessOwner.snapshot) {
        return;
      }
      const result = await this.runDirectLifecycleTransition('restart');
      if (!result.success) {
        this.status = 'error';
        this.currentPhase = StartupPhase.Error;
      }
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.status = 'error';
      this.currentPhase = StartupPhase.Error;
      this.appendStartupLogLine(`Automatic backend restart failed: ${message}`);
      log.error('[WebService] Automatic backend restart failed:', error);
    });
  }

  private async runDirectLifecycleTransition(action: 'start' | 'restart'): Promise<StartResult> {
    this.status = 'starting';
    this.lastHealthCheckLogState = null;
    this.emitPhase(StartupPhase.CheckingVersion, 'Validating installed server version...');
    log.info('[WebService] Starting the Desktop-owned backend:', {
      host: this.config.host,
      port: this.config.port,
      action,
    });

    try {
      await this.orphanReconciliation;
      if (this.orphanReconciliationError) {
        throw this.orphanReconciliationError;
      }

      const launchContext = await this.resolveDirectBackendLaunchContext();
      this.appendStartupLogLine(`Managed entry point: ${launchContext.serviceDllPath}`);
      this.appendStartupLogLine(`Managed working directory: ${launchContext.serviceWorkingDirectory}`);
      if (launchContext.requiredRuntimeLabel) {
        this.appendStartupLogLine(`Required ASP.NET Core runtime: ${launchContext.requiredRuntimeLabel}`);
      }

      this.emitPhase(StartupPhase.CheckingDependencies, 'Preparing the managed .NET runtime and service environment...');
      const prepared = await this.prepareServiceEnvironment();
      const serviceEnv = this.buildHagiscriptServiceEnvironment(prepared.mergedEnv);
      this.lastResolvedServiceEnv = serviceEnv;
      this.appendStartupLogLine(`ASPNETCORE_URLS=${serviceEnv.ASPNETCORE_URLS}`);
      this.appendStartupLogLine(`ASPNETCORE_ENVIRONMENT=${serviceEnv.ASPNETCORE_ENVIRONMENT}`);

      const dotnetExecutable = await this.resolveManagedDotnetExecutable();
      const available = await this.checkPortAvailable(this.config.port);
      if (!available) {
        throw new Error(
          `Port ${this.config.port} is already in use by a process Desktop does not own. Stop that service before starting Hagicode Server; Desktop will not adopt a port-only listener.`,
        );
      }

      const runtime = this.activeRuntime;
      if (!runtime) {
        throw new Error('No active runtime set.');
      }
      const launch: BackendProcessLaunch = {
        executablePath: dotnetExecutable,
        args: [launchContext.serviceDllPath, ...(this.config.args ?? [])],
        workingDirectory: launchContext.serviceWorkingDirectory,
        env: serviceEnv,
        runtimeIdentity: this.getRuntimeIdentity(runtime),
        runtimeRoot: runtime.rootPath,
        serviceDllPath: launchContext.serviceDllPath,
        port: this.config.port,
      };

      this.emitPhase(StartupPhase.Spawning, action === 'restart' ? 'Restarting the owned backend...' : 'Starting the owned backend...');
      this.appendStartupLogLine(`Managed .NET executable: ${dotnetExecutable}`);
      this.ownedBackend = await this.backendProcessOwner.start(launch);
      this.startTime = this.ownedBackend.startTime;
      this.restartCount = Math.max(this.restartCount, 0);

      this.emitPhase(StartupPhase.WaitingListening, 'Waiting for the owned backend to start listening...');
      const listening = await this.waitForPortListening(this.startTimeout);
      if (!listening) {
        const summary = this.ownedBackend?.isAlive()
          ? `Owned backend did not listen on ${this.config.host}:${this.config.port} within ${this.startTimeout}ms.`
          : 'Owned backend exited before it began listening.';
        this.appendStartupLogLine(summary);
        await this.stopBackendAfterStartupFailure();
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, summary);
        return this.buildStartupFailureResult(summary);
      }

      this.emitPhase(StartupPhase.HealthCheck, 'Verifying the owned backend health endpoint...');
      const healthCheckPassed = await this.waitForHealthCheck();
      if (!healthCheckPassed) {
        const summary = this.ownedBackend?.isAlive()
          ? `Owned backend failed its HTTP health check within ${this.startTimeout}ms.`
          : 'Owned backend exited before passing its HTTP health check.';
        this.appendStartupLogLine(summary);
        await this.stopBackendAfterStartupFailure();
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, summary);
        return this.buildStartupFailureResult(summary);
      }

      this.status = 'running';
      this.currentPhase = StartupPhase.Running;
      await this.saveLastSuccessfulConfig();
      this.emitPhase(StartupPhase.Running, 'Service is running');
      log.info('[WebService] Desktop-owned backend is healthy:', {
        pid: this.ownedBackend?.pid ?? null,
        port: this.config.port,
      });
      return this.buildSuccessfulStartResult(this.startupLogLines.join('\n'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('[WebService] Direct backend startup failed:', error);
      this.appendStartupLogLine(`Direct backend startup failed: ${message}`);
      const stopError = await this.stopBackendAfterStartupFailure();
      const summary = stopError ? `${message}; cleanup also failed: ${stopError}` : message;
      this.status = 'error';
      this.currentPhase = StartupPhase.Error;
      this.emitPhase(StartupPhase.Error, summary);
      return this.buildStartupFailureResult(summary);
    }
  }

  private async stopBackendAfterStartupFailure(): Promise<string | null> {
    try {
      await this.backendProcessOwner.stop(this.stopTimeout);
      this.ownedBackend = null;
      this.startTime = null;
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.appendStartupLogLine(`Failed to clean up the backend after startup failure: ${message}`);
      return message;
    }
  }

  /**
   * Get the web service version
   */
  async getVersion(): Promise<string> {
    try {
      if (this.activeRuntime?.rootPath) {
        const manifestPath = path.join(this.activeRuntime.rootPath, 'manifest.json');
        try {
          const manifestContent = await fs.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent);
          if (manifest.package && manifest.package.version) {
            return manifest.package.version;
          }
        } catch {
          log.warn('[WebService] Failed to read manifest from active runtime:', {
            runtimeKind: this.activeRuntime.kind,
            runtimeRoot: this.activeRuntime.rootPath,
            distributionMode: this.distributionMode,
          });
        }
      }

      log.info('[WebService] Falling back to unknown version because runtime metadata is unavailable', {
        activeRuntimeRoot: this.activeRuntime?.rootPath ?? null,
        distributionMode: this.distributionMode,
      });
      return 'unknown';
    } catch (error) {
      log.error('[WebService] Failed to get version:', error);
      return 'unknown';
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(config: Partial<WebServiceConfig>): Promise<void> {
    await this.ensureSavedConfigInitialized();
    const oldPort = this.config.port;
    const oldHost = this.config.host;
    const nextHost = config.host !== undefined ? normalizeListenHost(config.host) : undefined;

    if (config.host !== undefined && !nextHost) {
      throw new Error('Invalid listen host. Supported values: localhost, 127.0.0.1, 0.0.0.0, or a valid IPv4 address.');
    }

    if (config.port !== undefined && (config.port < 1024 || config.port > 65535)) {
      throw new Error('Port must be between 1024 and 65535.');
    }

    this.config = {
      ...this.config,
      ...config,
      host: nextHost ?? this.config.host,
      env: config.env
        ? { ...(this.config.env || {}), ...config.env }
        : this.config.env,
    };

    if ((config.port !== undefined && config.port !== oldPort) ||
        (nextHost !== undefined && nextHost !== oldHost)) {
      await this.saveConfig(this.config.host, this.config.port);
    }

    if ((config.port !== undefined && config.port !== oldPort) ||
        (nextHost !== undefined && nextHost !== oldHost)) {
      log.info('[WebService] Host/port updated in memory.');
    }
  }

  /**
   * Reset restart count
   */
  resetRestartCount(): void {
    this.restartCount = 0;
  }

  /**
   * Get the config file path for the current platform
   * Uses active version path if available, otherwise falls back to old path
   */
  private getConfigFilePath(): string {
    // Use active version path if available
    if (this.activeVersionPath) {
      return path.join(this.activeVersionPath, 'config', 'appsettings.yml');
    }

    // Fallback to old path (for backward compatibility)
    const currentPlatform = this.pathManager.getCurrentPlatform();
    return this.pathManager.getAppSettingsPath(currentPlatform);
  }

  /**
   * Load saved bind host and port from the state file.
   */
  private async loadSavedConfig(): Promise<{ host: string; port: number | null }> {
    const state = await this.readStateFile();
    return {
      host: coerceListenHost(state.lastSuccessfulHost),
      port: state.lastSuccessfulPort || null,
    };
  }

  /**
   * Save configured host and port to the state file
   */
  private async saveConfig(host: string, port: number): Promise<void> {
    try {
      await this.updateStateFile((state) => ({
        ...state,
        schemaVersion: Math.max(3, state.schemaVersion || 0),
        lastSuccessfulHost: host,
        lastSuccessfulPort: port,
        savedAt: new Date().toISOString(),
      }));
      log.info('[WebService] Saved bind config to state file:', { host, port });
    } catch (error) {
      log.error('[WebService] Error saving bind config:', error);
    }
  }

  /**
   * Save last successful bind config to the state file
   */
  private async saveLastSuccessfulConfig(): Promise<void> {
    try {
      await this.updateStateFile((state) => ({
        ...state,
        schemaVersion: Math.max(3, state.schemaVersion || 0),
        lastSuccessfulHost: this.config.host,
        lastSuccessfulPort: this.config.port,
        savedAt: new Date().toISOString(),
      }));
      log.info('[WebService] Saved successful bind config:', {
        host: this.config.host,
        port: this.config.port,
      });
    } catch (error) {
      log.error('[WebService] Failed to save bind configuration:', error);
      // Don't throw - host/port persistence is not critical
    }
  }

  /**
   * Migrate config from legacy location
   */
  private async migrateLegacyConfig(): Promise<void> {
    const paths = this.pathManager.getPaths();
    const legacyPath = path.join(paths.userData, 'web-service-config.json');
    const newPath = paths.webServiceConfig;

    try {
      // Check if legacy config exists
      await fs.access(legacyPath);

      log.info('[WebService] Migrating config from legacy location');
      const content = await fs.readFile(legacyPath, 'utf-8');

      // Ensure new config directory exists
      await fs.mkdir(paths.config, { recursive: true });

      // Copy to new location
      await fs.writeFile(newPath, content, 'utf-8');

      // Delete legacy file
      await fs.unlink(legacyPath);

      log.info('[WebService] Config migration completed');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // No legacy config, nothing to migrate
        log.info('[WebService] No legacy config found, skipping migration');
      } else {
        log.error('[WebService] Config migration failed:', error);
        // Continue with new config location
      }
    }
  }

  /**
   * Initialize saved bind configuration
   */
  private async initializeSavedConfig(): Promise<void> {
    try {
      // Run migration first (one-time operation)
      await this.migrateLegacyConfig();

      const { host: savedHost, port: savedPort } = await this.loadSavedConfig();
      if (savedHost !== this.config.host) {
        log.info('[WebService] Using saved host:', savedHost);
        this.config.host = savedHost;
      }

      if (savedPort && savedPort !== this.config.port) {
        log.info('[WebService] Using saved port:', savedPort);
        this.config.port = savedPort;
      }
    } catch (error) {
      log.error('[WebService] Failed to load saved bind config:', error);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (!this.cleanupPromise) {
      this.explicitStopRequested = true;
      this.cleanupPromise = this.runLifecycleExclusive(async () => {
        await this.stopInternal();
      });
    }
    await this.cleanupPromise;
  }
}
