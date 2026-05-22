import path from 'node:path';
import fs from 'node:fs/promises';
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
  resolveWebServiceConfigMode,
  type ManagedEnvSnapshotEntry,
  type WebServiceConfigMode,
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
  HagiscriptRuntimeContextResolver,
  type HagiscriptRuntimeContext,
} from './hagiscript-runtime-context.js';
import {
  HagiscriptServerManager,
  type HagiscriptManagedServerStatus,
  type HagiscriptRuntimeStateReport,
  type HagiscriptRuntimeStateResult,
  type HagiscriptServerLifecycleAction,
  type HagiscriptServerLifecycleResult,
} from './hagiscript-server-manager.js';
import {
  buildAccessUrl,
  coerceListenHost,
  DEFAULT_WEB_SERVICE_HOST,
  normalizeListenHost,
  resolveProbeHostsForListenHost,
} from '../types/web-service-network.js';
import { OMNIROUTE_DEFAULT_PORT } from '../types/omniroute-management.js';
import type { ActiveRuntimeDescriptor, DistributionMode } from '../types/distribution-mode.js';
import {
  resolveSteamIntegration,
  HAGICODE_STEAM_ACHIEVEMENT_SYNC_ENV_KEY,
} from './steam-integration-env.js';

const { app } = electron;

export type ProcessStatus = 'running' | 'stopped' | 'error' | 'starting' | 'stopping';

export enum StartupPhase {
  Idle = 'idle',
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
  mode: WebServiceConfigMode;
  mergedEnv: NodeJS.ProcessEnv;
  managedSnapshot: ManagedEnvSnapshotEntry[];
}

const OMNIROUTE_MIN_PORT = 1024;
const OMNIROUTE_MAX_PORT = 65535;

export interface ManagedLaunchContext {
  serviceDllPath: string;
  serviceWorkingDirectory: string;
  requiredRuntimeLabel?: string;
}

interface WebServiceManagerDeps {
  configManager?: ConfigManager | null;
  httpClient?: DesktopHttpClient;
  dependencyManagementService?: DependencyManagementService | null;
  hagiscriptServerManager?: HagiscriptServerManager;
  hagiscriptRuntimeContextResolver?: HagiscriptRuntimeContextResolver;
}

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

  log.info('[WebService] Managed entry point:', payloadValidation.payloadPaths.serviceDllPath);
  log.info('[WebService] Managed working directory:', path.dirname(payloadValidation.payloadPaths.serviceDllPath));
  if (payloadValidation.requirement?.effectiveLabel) {
    log.info('[WebService] Required ASP.NET Core runtime:', payloadValidation.requirement.effectiveLabel);
  }

  return {
    serviceDllPath: payloadValidation.payloadPaths.serviceDllPath,
    serviceWorkingDirectory: path.dirname(payloadValidation.payloadPaths.serviceDllPath),
    requiredRuntimeLabel: payloadValidation.requirement?.effectiveLabel,
  };
}

function normalizeManagedOmniRoutePort(value: unknown): number | null {
  const port = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(port) && port >= OMNIROUTE_MIN_PORT && port <= OMNIROUTE_MAX_PORT
    ? port
    : null;
}

function buildManagedOmniRouteApiEndpoint(port: number): string {
  return `http://localhost:${port}`;
}

export class PCodeWebServiceManager {
  private config: WebServiceConfig;
  private readonly configManager: ConfigManager | null;
  private readonly httpClient: DesktopHttpClient;
  private dependencyManagementService: DependencyManagementService | null;
  private hagiscriptRuntimeContextResolver: HagiscriptRuntimeContextResolver | null;
  private readonly hagiscriptServerManager: HagiscriptServerManager;
  private status: ProcessStatus = 'stopped';
  private startTime: number | null = null;
  private restartCount: number = 0;
  private maxRestartAttempts: number = 3;
  private startTimeout: number = 30000; // 30 seconds
  private stopTimeout: number = 10000; // 10 seconds
  private pathManager: PathManager;
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
  private lastPm2StatusWarningKey: string | null = null;
  private repeatedPm2StatusWarningSuppressed: boolean = false;
  private distributionMode: DistributionMode = 'normal';
  private statusRequestPromise: Promise<ProcessInfo> | null = null;

  constructor(config: WebServiceConfig, deps: WebServiceManagerDeps = {}) {
    this.config = {
      ...config,
      host: coerceListenHost(config.host),
    };
    this.configManager = deps.configManager ?? null;
    this.httpClient = deps.httpClient ?? desktopHttpClient;
    this.pathManager = PathManager.getInstance();
    this.dependencyManagementService = deps.dependencyManagementService ?? null;
    this.hagiscriptRuntimeContextResolver = deps.hagiscriptRuntimeContextResolver
      ?? (this.dependencyManagementService
        ? new HagiscriptRuntimeContextResolver({
            pathManager: this.pathManager,
            dependencyManagementService: this.dependencyManagementService,
          })
        : null);
    this.hagiscriptServerManager = deps.hagiscriptServerManager ?? new HagiscriptServerManager();

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
    this.hagiscriptRuntimeContextResolver = dependencyManagementService
      ? new HagiscriptRuntimeContextResolver({
          pathManager: this.pathManager,
          dependencyManagementService,
        })
      : null;
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

  private resetPm2StatusWarningState(): void {
    this.lastPm2StatusWarningKey = null;
    this.repeatedPm2StatusWarningSuppressed = false;
  }

  private logPm2StatusFailure(result: HagiscriptServerLifecycleResult): void {
    const warningKey = `${result.action}:${result.status}:${result.summary}`;
    if (this.lastPm2StatusWarningKey === warningKey) {
      if (!this.repeatedPm2StatusWarningSuppressed) {
        log.info('[WebService] Suppressing repeated hagiscript PM2 status warnings after the initial failure:', {
          action: result.action,
          status: result.status,
          summary: result.summary,
        });
        this.repeatedPm2StatusWarningSuppressed = true;
      }
      return;
    }

    this.lastPm2StatusWarningKey = warningKey;
    this.repeatedPm2StatusWarningSuppressed = false;
    log.warn('[WebService] hagiscript PM2 status unavailable:', {
      action: result.action,
      status: result.status,
      summary: result.summary,
    });
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

  private async appendDiagnosticFile(pathValue: string): Promise<void> {
    try {
      const content = await fs.readFile(pathValue, 'utf8');
      this.appendStartupLogLine(`Diagnostic file: ${pathValue}`);
      this.appendDiagnosticOutput(path.basename(pathValue), content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }

      log.warn('[WebService] Failed to read diagnostic file:', { path: pathValue, error });
    }
  }

  private async appendHagiscriptDiagnostics(input: {
    summary: string;
    stdout: string;
    stderr: string;
    logPaths: readonly string[];
  }): Promise<void> {
    this.appendStartupLogLine(`hagiscript failure summary: ${input.summary}`);
    this.appendDiagnosticOutput('hagiscript stdout', input.stdout);
    this.appendDiagnosticOutput('hagiscript stderr', input.stderr);
    for (const logPath of input.logPaths) {
      await this.appendDiagnosticFile(logPath);
    }
  }

  private async buildHagiscriptLifecycleFailureResult(result: HagiscriptServerLifecycleResult): Promise<StartResult> {
    await this.appendHagiscriptDiagnostics({
      summary: result.summary,
      stdout: result.stdout,
      stderr: result.stderr,
      logPaths: result.logPaths,
    });
    const failure = this.buildStartupFailureInfo(result.summary);

    return {
      success: false,
      resultSession: {
        exitCode: result.exitCode ?? -1,
        stdout: result.stdout,
        stderr: result.stderr || result.summary,
        duration: 0,
        timestamp: failure.timestamp,
        success: false,
        errorMessage: result.summary,
        port: failure.port,
      },
      parsedResult: {
        success: false,
        errorMessage: result.summary,
        rawOutput: failure.log,
        port: failure.port,
      },
      port: failure.port,
    };
  }

  private async resolveManagedLaunchContext(): Promise<ManagedLaunchContext> {
    if (!this.activeVersionPath) {
      throw new Error('No active version set');
    }
    return await resolveManagedLaunchContextForRuntimeRoot(this.activeVersionPath);
  }

  private async resolveHagiscriptRuntimeContext(
    servicePayloadPath: string,
    serviceWorkingDirectory: string,
    serviceEnv?: NodeJS.ProcessEnv,
  ): Promise<HagiscriptRuntimeContext> {
    if (!this.activeRuntime) {
      throw new Error('No active runtime set');
    }

    if (!this.hagiscriptRuntimeContextResolver) {
      throw new Error('Desktop managed hagiscript is not initialized yet.');
    }

    return await this.hagiscriptRuntimeContextResolver.resolve({
      activeRuntime: this.activeRuntime,
      servicePayloadPath,
      serviceWorkingDirectory,
      serviceEnv,
    });
  }

  private buildHagiscriptServiceEnvironment(baseEnv: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
    return {
      ...(baseEnv ?? {}),
      ...(this.config.env ?? {}),
      ASPNETCORE_ENVIRONMENT: baseEnv?.ASPNETCORE_ENVIRONMENT ?? this.config.env?.ASPNETCORE_ENVIRONMENT ?? 'Production',
      ASPNETCORE_URLS: buildAccessUrl(this.config.host, this.config.port),
    };
  }

  private mapPm2StatusToProcessStatus(status: HagiscriptManagedServerStatus): ProcessStatus {
    switch (status) {
      case 'online':
        return 'running';
      case 'stopped':
      case 'missing':
        return 'stopped';
      default:
        return 'error';
    }
  }

  private getServerRuntimeState(report: HagiscriptRuntimeStateReport | null): HagiscriptRuntimeStateReport['components'][number] | null {
    return report?.components.find((component) => component.name === 'server') ?? null;
  }

  private isStartupTransitionActive(): boolean {
    return this.status === 'starting'
      || this.currentPhase === StartupPhase.Spawning
      || this.currentPhase === StartupPhase.WaitingListening
      || this.currentPhase === StartupPhase.HealthCheck;
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
   * Check if a specific host/port accepts TCP connections.
   */
  private async checkPortReachable(host: string, port: number, timeoutMs: number = 2000): Promise<boolean> {
    const net = await import('node:net');

    return await new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });
  }

  private async isManagedServiceReachable(port: number): Promise<boolean> {
    const probeHosts = this.resolveProbeHosts(this.config.host);
    for (const host of probeHosts) {
      if (await this.checkPortReachable(host, port, 1000)) {
        return true;
      }
    }
    return false;
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

      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between attempts
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
          log.info('[WebService] Health check passed:', url, 'status:', response.status);
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

    log.warn('[WebService] Health check failed after trying all endpoints:', {
      port,
      host: this.config.host,
      urlsTried: urls,
      reason: lastErrorMessage,
    });
    return false;
  }

  private getConfigMode(): WebServiceConfigMode {
    return resolveWebServiceConfigMode(process.env.HAGICODE_WEB_SERVICE_CONFIG_MODE);
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

  private logManagedEnvSnapshot(mode: WebServiceConfigMode, mergedEnv: NodeJS.ProcessEnv, entries: ManagedEnvSnapshotEntry[]): void {
    const level = this.getEnvSnapshotLogLevel(mergedEnv);
    if (level === 'off') {
      return;
    }

    log.info('[WebService] Injected environment snapshot:', {
      mode,
      total: entries.length,
      required: MANAGED_ENV_VAR_DEFINITIONS.filter(item => item.required).length,
    });

    const lines = buildSnapshotLogLines(entries, level);
    for (const line of lines) {
      log.info(line);
    }
  }

  private async prepareServiceEnvironment(): Promise<PreparedServiceEnvironment> {
    const mode = this.getConfigMode();
    if (mode === 'legacy-yaml') {
      log.warn('[WebService] Running in legacy-yaml mode (HAGICODE_WEB_SERVICE_CONFIG_MODE).');
      await this.syncConfigToFile();
    }

    const existingConfig = await this.readExistingServiceConfig();
    const consoleEnv = await loadConsoleEnvironment();
    const existingEnv = { ...process.env, ...consoleEnv, ...this.config.env };
    const dataDir = this.pathManager.getDataDirectory();
    const desktopManagedCodeServer = this.configManager
      ? (() => {
        const config = this.configManager.getCodeServerConfig();
        return {
          host: new URL(config.baseUrl).hostname,
          port: config.port,
          password: config.password,
        };
      })()
      : null;
    const desktopManagedOmniRoute = this.configManager
      ? (() => {
        const configured = this.configManager.getAll().omniroute;
        const port = normalizeManagedOmniRoutePort(configured?.port) ?? OMNIROUTE_DEFAULT_PORT;
        return {
          apiEndpoint: buildManagedOmniRouteApiEndpoint(port),
        };
      })()
      : null;
    const systemVaultEnv = await buildDesktopSystemVaultEnv({
      pathResolver: createDesktopSystemVaultPathResolver(this.pathManager),
    });
    const steamIntegration = resolveSteamIntegration({
      distributionMode: this.distributionMode,
      env: process.env,
    });

    for (const warning of systemVaultEnv.warnings) {
      log.warn('[WebService][SystemVaultEnv]', warning);
    }

    const buildResult = buildManagedServiceEnv({
      host: this.config.host,
      port: this.config.port,
      dataDir,
      currentDesktopLanguage: this.configManager?.getCurrentLanguage() ?? null,
      steamIntegrationEnabled: steamIntegration.integrationEnabled,
      steamIntegrationSource: steamIntegration.integrationSource === 'distribution-mode'
        ? 'distribution-mode'
        : 'disabled-non-steam',
      steamAchievementSyncEnabled: steamIntegration.achievementSyncEnabled,
      steamAchievementSyncSource: steamIntegration.achievementSyncSource,
      codeServer: desktopManagedCodeServer,
      omniRoute: desktopManagedOmniRoute,
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
      if (key.startsWith(SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX)) {
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
    this.logManagedEnvSnapshot(mode, mergedEnv, buildResult.snapshot);

    return {
      mode,
      mergedEnv,
      managedSnapshot: buildResult.snapshot,
    };
  }

  /**
   * Start the web service process with the pinned dotnet host
   * @returns StartResult with service URL and port information
   */
  async start(): Promise<StartResult> {
    await this.ensureSavedConfigInitialized();
    this.resetPm2StatusWarningState();
    this.resetStartupLogBuffer();
    this.appendStartupLogLine(`Starting service with configured host ${this.config.host} and port ${this.config.port}`);

    // PM2 restart_time is diagnostic state from the previous runtime. A manual
    // Desktop start should always get a fresh attempt, especially after version switches.
    this.restartCount = 0;

    if (this.status === 'running') {
      log.warn('[WebService] Existing service runtime detected before start; stopping it before launching current version.');
      this.appendStartupLogLine('Existing service runtime detected; stopping before launching current version');
      const stopped = await this.stop();
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

    return await this.runLifecycleTransition('start');
  }

  /**
   * Wait for health check with timeout
   */
  private async waitForHealthCheck(): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every second

    while (Date.now() - startTime < this.startTimeout) {
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
    try {
      this.status = 'stopping';
      log.info('[WebService] Stopping web service...');

      const launchContext = await this.resolveManagedLaunchContext();
      const context = await this.resolveHagiscriptRuntimeContext(
        launchContext.serviceDllPath,
        launchContext.serviceWorkingDirectory,
        this.lastResolvedServiceEnv ?? this.buildHagiscriptServiceEnvironment(this.config.env),
      );
      let stopResult: HagiscriptServerLifecycleResult;
      try {
        stopResult = await this.hagiscriptServerManager.stop(context);
      } finally {
        await context.cleanup();
      }

      if (!stopResult.success && !['missing', 'stopped'].includes(stopResult.status)) {
        log.error('[WebService] hagiscript stop failed:', {
          status: stopResult.status,
          summary: stopResult.summary,
        });
        this.status = 'error';
        return false;
      }

      this.status = 'stopped';
      this.lastResolvedServiceEnv = null;
      this.startTime = null;
      this.restartCount = 0;
      this.currentPhase = StartupPhase.Idle;
      this.resetPm2StatusWarningState();
      log.info('[WebService] Stopped successfully');
      return true;
    } catch (error) {
      log.error('[WebService] Failed to stop:', error);
      this.status = 'error';
      return false;
    }
  }

  /**
   * Restart the web service
   */
  async restart(): Promise<StartResult> {
    log.info('[WebService] Restarting web service...');
    this.restartCount = 0;
    return await this.runLifecycleTransition('restart');
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

    if (!this.activeVersionPath || !this.activeRuntime) {
      this.status = 'stopped';
      this.currentPhase = StartupPhase.Idle;
      this.startTime = null;
      this.restartCount = 0;
      return {
        status: this.status,
        uptime: 0,
        startTime: null,
        url: null,
        restartCount: 0,
        phase: this.currentPhase,
        port: this.config.port,
        host: this.config.host,
      };
    }

    const launchContext = await this.resolveManagedLaunchContext();
    const context = await this.resolveHagiscriptRuntimeContext(
      launchContext.serviceDllPath,
      launchContext.serviceWorkingDirectory,
      this.lastResolvedServiceEnv ?? this.buildHagiscriptServiceEnvironment(this.config.env),
    );
    let lifecycleResult: HagiscriptServerLifecycleResult;
    let runtimeStateResult: HagiscriptRuntimeStateResult | null = null;
    try {
      lifecycleResult = await this.hagiscriptServerManager.status(context);
      if (lifecycleResult.status === 'online') {
        runtimeStateResult = await this.hagiscriptServerManager.getRuntimeState(context);
      }
    } finally {
      await context.cleanup();
    }

    const startupTransitionActive = this.isStartupTransitionActive();

    if (!lifecycleResult.success) {
      if (startupTransitionActive && this.currentPhase !== StartupPhase.Error) {
        this.status = 'starting';
        this.restartCount = lifecycleResult.restartCount;
      } else {
        this.logPm2StatusFailure(lifecycleResult);
        this.status = 'error';
        this.currentPhase = StartupPhase.Error;
        this.startTime = null;
        this.restartCount = 0;
      }
    } else if (lifecycleResult.status === 'online') {
      const healthCheckPassed = await this.performHealthCheck();
      if (healthCheckPassed) {
        this.status = 'running';
        this.currentPhase = StartupPhase.Running;
        this.startTime = lifecycleResult.pmUptime ?? this.startTime ?? Date.now();
        this.restartCount = lifecycleResult.restartCount;
        this.resetPm2StatusWarningState();
      } else if (startupTransitionActive && this.currentPhase !== StartupPhase.Error) {
        this.status = 'starting';
        this.currentPhase = StartupPhase.HealthCheck;
        this.startTime = lifecycleResult.pmUptime ?? this.startTime ?? Date.now();
        this.restartCount = lifecycleResult.restartCount;
      } else {
        const serverState = this.getServerRuntimeState(runtimeStateResult?.report ?? null);
        const releasedServiceReady = serverState?.details?.releasedServiceReady;
        this.status = 'error';
        this.currentPhase = StartupPhase.Error;
        this.appendStartupLogLine(
          releasedServiceReady === false
            ? 'hagiscript PM2 reports the server online, but the released-service payload is not ready.'
            : 'hagiscript PM2 reports the server online, but Desktop health verification failed.',
        );
        this.startTime = lifecycleResult.pmUptime ?? this.startTime;
        this.restartCount = lifecycleResult.restartCount;
      }
    } else {
      if (startupTransitionActive && this.currentPhase !== StartupPhase.Error) {
        this.status = 'starting';
        this.restartCount = lifecycleResult.restartCount;
      } else {
        this.status = this.mapPm2StatusToProcessStatus(lifecycleResult.status);
        this.currentPhase = this.status === 'stopped' ? StartupPhase.Idle : StartupPhase.Error;
        this.startTime = null;
        this.restartCount = lifecycleResult.restartCount;
      }
    }

    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    const runningUrl = this.status === 'running' ? buildAccessUrl(this.config.host, this.config.port) : null;

    return {
      status: this.status,
      uptime,
      startTime: this.startTime,
      url: runningUrl,
      restartCount: this.restartCount,
      phase: this.currentPhase,
      port: this.config.port,
      host: this.config.host,
    };
  }

  private async runLifecycleTransition(action: HagiscriptServerLifecycleAction): Promise<StartResult> {
    try {
      this.status = 'starting';
      log.info('[WebService] Starting with configured host/port:', {
        host: this.config.host,
        port: this.config.port,
        action,
      });

      let launchContext: {
        serviceDllPath: string;
        serviceWorkingDirectory: string;
        requiredRuntimeLabel?: string;
      };

      try {
        launchContext = await this.resolveManagedLaunchContext();
        this.appendStartupLogLine(`Managed entry point: ${launchContext.serviceDllPath}`);
        this.appendStartupLogLine(`Managed working directory: ${launchContext.serviceWorkingDirectory}`);
        if (launchContext.requiredRuntimeLabel) {
          this.appendStartupLogLine(`Required ASP.NET Core runtime: ${launchContext.requiredRuntimeLabel}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = error instanceof ManagedLaunchError ? error.code : 'invalid-service-payload';
        log.error('[WebService] Service payload validation failed:', errorCode, errorMessage);
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, errorMessage);
        this.appendStartupLogLine(`Start failed [${errorCode}]: ${errorMessage}`);
        return this.buildStartupFailureResult(errorMessage);
      }

      let preparedEnv: NodeJS.ProcessEnv;
      let envMode: WebServiceConfigMode = 'env';
      try {
        const prepared = await this.prepareServiceEnvironment();
        preparedEnv = this.buildHagiscriptServiceEnvironment(prepared.mergedEnv);
        envMode = prepared.mode;
        this.lastResolvedServiceEnv = preparedEnv;
        this.appendStartupLogLine(`ASPNETCORE_URLS=${preparedEnv.ASPNETCORE_URLS}`);
        this.appendStartupLogLine(`ASPNETCORE_ENVIRONMENT=${preparedEnv.ASPNETCORE_ENVIRONMENT}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('[WebService] Failed to prepare environment injection:', errorMessage);
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, `Environment injection failed: ${errorMessage}`);
        this.appendStartupLogLine(`Start failed: environment injection failed - ${errorMessage}`);
        return this.buildStartupFailureResult(`Environment injection failed: ${errorMessage}`);
      }

      const context = await this.resolveHagiscriptRuntimeContext(
        launchContext.serviceDllPath,
        launchContext.serviceWorkingDirectory,
        preparedEnv,
      );
      let lifecycleResult: HagiscriptServerLifecycleResult;
      let runtimeStateResult: HagiscriptRuntimeStateResult | null = null;
      try {
        this.emitPhase(
          StartupPhase.Spawning,
          action === 'restart'
            ? 'Restarting service via hagiscript PM2...'
            : 'Starting service via hagiscript PM2...',
        );
        this.appendStartupLogLine(`hagiscript executable: ${context.hagiscriptExecutablePath}`);
        this.appendStartupLogLine(`hagiscript manifest override: ${context.manifestPath}`);
        this.appendStartupLogLine(`hagiscript runtime home: ${context.runtimeHome}`);
        this.appendStartupLogLine(`hagiscript runtime data root: ${context.runtimeDataRoot}`);
        this.appendStartupLogLine(`hagiscript PM2 home: ${context.pm2Home}`);
        this.appendStartupLogLine(`hagiscript runtime files directory: ${context.runtimeFilesDir}`);

        if (await this.isManagedServiceReachable(this.config.port)) {
          log.warn('[WebService] Target port is reachable before hagiscript start; lifecycle start may fail if another process owns it:', {
            port: this.config.port,
          });
          this.appendStartupLogLine(`Target port ${this.config.port} is already reachable before hagiscript PM2 action`);
        }

        lifecycleResult = action === 'restart'
          ? await this.hagiscriptServerManager.restart(context)
          : await this.hagiscriptServerManager.start(context);

        if (!lifecycleResult.success || lifecycleResult.status !== 'online') {
          runtimeStateResult = await this.hagiscriptServerManager.getRuntimeState(context);
        }
      } finally {
        await context.cleanup();
      }

      if (!lifecycleResult.success || lifecycleResult.status !== 'online') {
        if (runtimeStateResult) {
          await this.appendHagiscriptDiagnostics({
            summary: runtimeStateResult.summary,
            stdout: runtimeStateResult.stdout,
            stderr: runtimeStateResult.stderr,
            logPaths: runtimeStateResult.logPaths,
          });
        }
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, lifecycleResult.summary);
        return await this.buildHagiscriptLifecycleFailureResult(
          lifecycleResult.success
            ? {
                ...lifecycleResult,
                success: false,
                summary: `hagiscript PM2 reported ${lifecycleResult.status} during ${action}.`,
              }
            : lifecycleResult,
        );
      }

      this.restartCount = lifecycleResult.restartCount;
      this.startTime = lifecycleResult.pmUptime ?? Date.now();

      this.emitPhase(StartupPhase.WaitingListening, 'Waiting for service to start listening...');
      const listening = await this.waitForPortListening();
      if (!listening) {
        this.emitPhase(StartupPhase.Error, 'Service failed to start listening');
        this.appendStartupLogLine(`Start failed: service did not listen on ${this.config.host}:${this.config.port}`);
        await this.stop();
        this.status = 'error';
        return this.buildStartupFailureResult('Service failed to start listening');
      }

      this.emitPhase(StartupPhase.HealthCheck, 'Performing health check...');
      const healthCheckPassed = await this.waitForHealthCheck();
      if (!healthCheckPassed) {
        const contextForDiagnostics = await this.resolveHagiscriptRuntimeContext(
          launchContext.serviceDllPath,
          launchContext.serviceWorkingDirectory,
          preparedEnv,
        );
        try {
          const runtimeStateResult = await this.hagiscriptServerManager.getRuntimeState(contextForDiagnostics);
          await this.appendHagiscriptDiagnostics({
            summary: runtimeStateResult.summary,
            stdout: runtimeStateResult.stdout,
            stderr: runtimeStateResult.stderr,
            logPaths: runtimeStateResult.logPaths,
          });
        } finally {
          await contextForDiagnostics.cleanup();
        }
        log.error('[WebService] Health check failed');
        this.emitPhase(StartupPhase.Error, 'Health check failed');
        this.appendStartupLogLine('Start failed: health check did not pass within timeout');
        await this.stop();
        this.status = 'error';
        return this.buildStartupFailureResult('Health check failed');
      }

      this.status = 'running';
      this.resetPm2StatusWarningState();
      await this.saveLastSuccessfulConfig();

      log.info('[WebService] Service started successfully on port:', this.config.port);
      log.info('[WebService] Environment injection confirmed:', {
        mode: envMode,
        managedVariableCount: this.lastManagedEnvSnapshot.length,
      });
      this.emitPhase(StartupPhase.Running, 'Service is running');

      return {
        success: true,
        resultSession: {
          exitCode: lifecycleResult.exitCode ?? -1,
          stdout: lifecycleResult.stdout,
          stderr: lifecycleResult.stderr,
          duration: 0,
          timestamp: new Date().toISOString(),
          success: true,
          port: this.config.port,
          url: buildAccessUrl(this.config.host, this.config.port),
        },
        parsedResult: {
          success: true,
          rawOutput: lifecycleResult.summary,
          port: this.config.port,
          url: buildAccessUrl(this.config.host, this.config.port),
        },
        url: buildAccessUrl(this.config.host, this.config.port),
        port: this.config.port,
      };
    } catch (error) {
      log.error('[WebService] Failed to start:', error);
      this.status = 'error';
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.appendStartupLogLine(`Start failed with exception: ${errorMessage}`);
      this.emitPhase(StartupPhase.Error, `Start failed: ${errorMessage}`);
      return this.buildStartupFailureResult(errorMessage);
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

    // Keep legacy YAML sync path behind a compatibility switch.
    const shouldSyncLegacyYaml = this.getConfigMode() === 'legacy-yaml';
    if (shouldSyncLegacyYaml && ((config.port !== undefined && config.port !== oldPort) ||
        (nextHost !== undefined && nextHost !== oldHost))) {
      try {
        await this.syncConfigToFile();
      } catch (error) {
        log.error('[WebService] Config sync failed, continuing with in-memory config');
        // Don't throw - allow in-memory config to work
      }
    } else if (!shouldSyncLegacyYaml && ((config.port !== undefined && config.port !== oldPort) ||
        (nextHost !== undefined && nextHost !== oldHost))) {
      log.info('[WebService] Host/port updated in memory, YAML sync skipped (env mode).');
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
   * Sync configuration to file (legacy compatibility path)
   * Creates the config file if it doesn't exist.
   */
  private async syncConfigToFile(): Promise<void> {
    try {
      const configPath = this.getConfigFilePath();
      const yaml = await import('js-yaml');

      log.info('[WebService] Syncing config to file:', configPath);
      log.info('[WebService] New config will be:', `http://${this.config.host}:${this.config.port}`);

      let config: any;

      try {
        // Try to read existing config
        const content = await fs.readFile(configPath, 'utf-8');
        config = yaml.load(content) as any;
        log.info('[WebService] Current config URLs:', config.Urls);
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === 'ENOENT') {
          // Config file doesn't exist, create a new one
          log.info('[WebService] Config file does not exist, creating new one');
          config = {
            Urls: `http://${this.config.host}:${this.config.port}`,
            Logging: {
              LogLevel: {
                Default: 'Information'
              }
            }
          };
        } else {
          throw readError; // Re-throw other errors
        }
      }

      // Update URLs
      config.Urls = `http://${this.config.host}:${this.config.port}`;

      // Sync data directory path to appsettings.yml
      // This ensures PCode service uses the configured data directory
      const dataDir = this.pathManager.getDataDirectory();
      if (dataDir) {
        config.DataDir = dataDir;
        log.info('[WebService] Syncing data directory to config:', dataDir);
      }

      // Ensure directory exists
      const configDir = path.dirname(configPath);
      await fs.mkdir(configDir, { recursive: true });

      // Write back
      const newContent = yaml.dump(config, {
        lineWidth: -1, // Don't wrap lines
        noRefs: true,
      });
      await fs.writeFile(configPath, newContent, 'utf-8');

      log.info('[WebService] Config synced successfully to file:', configPath);
      log.info('[WebService] New URLs:', config.Urls);

      // Persist successful bind config for next startup
      await this.saveLastSuccessfulConfig();
    } catch (error) {
      log.error('[WebService] Failed to sync config to file');
      log.error('[WebService] Error details:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        log.error('[WebService] Stack trace:', error.stack);
      }
      throw error; // Re-throw for caller to handle
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.status === 'running') {
      await this.stop();
    }
  }
}
