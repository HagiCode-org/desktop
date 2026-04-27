import { spawn, ChildProcess } from 'child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import log from 'electron-log';
import { app } from 'electron';
import { ConfigManager } from './config.js';
import { PathManager } from './path-manager.js';
import { manifestReader, type EntryPoint, type ResultSessionFile, type ParsedResult, type StartResult } from './manifest-reader.js';
import { PowerShellExecutor } from './utils/powershell-executor.js';
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
import { injectPortableToolchainEnv } from './portable-toolchain-env.js';
import { desktopHttpClient, type DesktopHttpClient } from './http-client.js';
import { executeCli } from './utils/cli-executor.js';
import {
  detectToolchainCommandName,
  resolveToolchainLaunchPlan,
  shouldUseShellForCommand,
} from './toolchain-launch.js';
import { BundledNodeRuntimeManager } from './bundled-node-runtime-manager.js';
import {
  evaluateRuntimeCompatibility,
  validateBundledRuntimeForPlatform,
  validateFrameworkDependentPayload,
} from './embedded-runtime.js';
import {
  PM2_RUNTIME_DIR_NAME,
  Pm2DotnetManager,
  type Pm2LifecycleResult,
} from './pm2-dotnet-manager.js';
import { evaluateDesktopCompatibility } from './desktop-compatibility.js';
import {
  buildAccessUrl,
  coerceListenHost,
  DEFAULT_WEB_SERVICE_HOST,
  normalizeListenHost,
  resolveProbeHostsForListenHost,
} from '../types/web-service-network.js';
import type { ActiveRuntimeDescriptor } from '../types/distribution-mode.js';

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

interface WebServiceManagerDeps {
  configManager?: ConfigManager | null;
  httpClient?: DesktopHttpClient;
  pm2Manager?: Pm2DotnetManager;
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
  | 'missing-runtime-payload'
  | 'unofficial-runtime-source'
  | 'pinned-runtime-mismatch'
  | 'runtime-incompatible'
  | 'desktop-incompatible';

class ManagedLaunchError extends Error {
  code: ManagedLaunchErrorCode;

  constructor(code: ManagedLaunchErrorCode, message: string) {
    super(message);
    this.name = 'ManagedLaunchError';
    this.code = code;
  }
}

export class PCodeWebServiceManager {
  private process: ChildProcess | null = null;
  private config: WebServiceConfig;
  private readonly configManager: ConfigManager | null;
  private readonly httpClient: DesktopHttpClient;
  private readonly pm2Manager: Pm2DotnetManager;
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
  private lastPm2Env: NodeJS.ProcessEnv | null = null;

  constructor(config: WebServiceConfig, deps: WebServiceManagerDeps = {}) {
    this.config = {
      ...config,
      host: coerceListenHost(config.host),
    };
    this.configManager = deps.configManager ?? null;
    this.httpClient = deps.httpClient ?? desktopHttpClient;
    this.pm2Manager = deps.pm2Manager ?? new Pm2DotnetManager();
    this.pathManager = PathManager.getInstance();

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

  /**
   * Read result.json file from working directory
   * Supports multiple result file names and formats for backward compatibility
   * @param workingDirectory - Directory containing result file
   * @returns Parsed ResultSessionFile or null if not found
   */
  private async readResultFile(workingDirectory: string): Promise<ResultSessionFile | null> {
    // List of possible result file names (in order of preference)
    const resultFileNames = ['result.json', 'start-result.json'];

    for (const fileName of resultFileNames) {
      const resultPath = path.join(workingDirectory, fileName);

      try {
        log.info('[WebService] Reading result file:', resultPath);
        const content = await fs.readFile(resultPath, 'utf-8');
        const rawData = JSON.parse(content);

        // Convert to ResultSessionFile format
        const result = this.normalizeResultFile(rawData, fileName);
        log.info('[WebService] Result file read successfully from:', fileName, 'success:', result.success);
        return result;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          // File doesn't exist, try next file name
          continue;
        } else {
          log.error('[WebService] Failed to read', fileName, ':', error);
        }
      }
    }

    // No result file found
    log.warn('[WebService] No result file found in:', workingDirectory);
    return null;
  }

  /**
   * Normalize result file data to ResultSessionFile format
   * Handles different result file formats
   * @param rawData - Raw JSON data from result file
   * @param fileName - Source file name
   * @returns Normalized ResultSessionFile
   */
  private normalizeResultFile(rawData: any, fileName: string): ResultSessionFile {
    // Check if already in ResultSessionFile format
    if ('exitCode' in rawData && 'success' in rawData && typeof rawData.success === 'boolean') {
      return rawData as ResultSessionFile;
    }

    // Handle start-result.json format
    if (fileName === 'start-result.json') {
      const success = rawData.success === true || rawData.ready === true;
      return {
        exitCode: success ? 0 : 1,
        stdout: rawData.stdout || JSON.stringify(rawData),
        stderr: rawData.stderr || '',
        duration: rawData.duration || 0,
        timestamp: rawData.timestamp || new Date().toISOString(),
        success,
        version: rawData.version,
        errorMessage: rawData.errorMessage || rawData.error,
      };
    }

    // Fallback: treat as unknown format
    return {
      exitCode: -1,
      stdout: JSON.stringify(rawData),
      stderr: 'Unknown result file format',
      duration: 0,
      timestamp: new Date().toISOString(),
      success: false,
      errorMessage: 'Unknown result file format',
    };
  }

  /**
   * Parse Result Session file to extract key information
   * @param result - ResultSessionFile from result.json
   * @returns ParsedResult with extracted information
   */
  private parseResultSession(result: ResultSessionFile | null): ParsedResult {
    // Fallback if result.json doesn't exist
    if (!result) {
      return {
        success: false,
        errorMessage: 'result.json file not found',
        rawOutput: '',
      };
    }

    return {
      success: result.success,
      version: result.version,
      errorMessage: result.errorMessage,
      rawOutput: this.formatRawOutput(result.stdout, result.stderr),
    };
  }

  /**
   * Format raw output for UI display
   * @param stdout - Standard output
   * @param stderr - Standard error output
   * @returns Formatted output string
   */
  private formatRawOutput(stdout: string, stderr: string): string {
    const parts: string[] = [];

    if (stdout && stdout.trim()) {
      parts.push(stdout.trim());
    }

    if (stderr && stderr.trim()) {
      parts.push('Errors: ' + stderr.trim());
    }

    return parts.length > 0 ? parts.join('\n') : 'No output';
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

  private captureStartupProcessOutput(output: string, level: 'info' | 'error'): void {
    output.split('\n').forEach((line) => {
      const normalized = line.trim();
      if (!normalized) {
        return;
      }

      this.appendStartupLogLine(normalized);
      if (level === 'error') {
        log.error('[WebService]', normalized);
      } else {
        log.info('[WebService]', normalized);
      }
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

  private buildManagedRuntimeEnvironment(
    mergedEnv: NodeJS.ProcessEnv,
    runtimeRoot: string,
  ): NodeJS.ProcessEnv {
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
    const existingPath = mergedEnv[pathKey] ?? mergedEnv.PATH ?? mergedEnv.Path ?? '';
    const runtimePath = existingPath ? `${runtimeRoot}${path.delimiter}${existingPath}` : runtimeRoot;

    return {
      ...mergedEnv,
      DOTNET_ROOT: runtimeRoot,
      DOTNET_MULTILEVEL_LOOKUP: '0',
      [pathKey]: runtimePath,
    };
  }

  private applySelectedNodeNpmEnvironment(
    baseEnv: NodeJS.ProcessEnv,
    nodeRuntimeRoot: string | null,
  ): NodeJS.ProcessEnv {
    if (!nodeRuntimeRoot) {
      return baseEnv;
    }

    const nodeBinRoot = process.platform === 'win32' ? nodeRuntimeRoot : path.join(nodeRuntimeRoot, 'bin');
    const nodeExecutablePath = path.join(nodeBinRoot, process.platform === 'win32' ? 'node.exe' : 'node');
    const npmCliPath = process.platform === 'win32'
      ? path.join(nodeRuntimeRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js')
      : path.join(nodeRuntimeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      NODE: nodeExecutablePath,
      npm_node_execpath: nodeExecutablePath,
      npm_execpath: npmCliPath,
    };

    delete env.npm_config_prefix;
    delete env.NPM_CONFIG_PREFIX;
    delete env.npm_config_global_prefix;
    delete env.NPM_CONFIG_GLOBAL_PREFIX;
    delete env.npm_config_globalconfig;
    delete env.NPM_CONFIG_GLOBALCONFIG;
    delete env.NPM_CONFIG_GLOBAL_CONFIG;

    return env;
  }

  private getPm2RuntimeFilesDirectory(): string {
    return path.join(this.pathManager.getPaths().config, PM2_RUNTIME_DIR_NAME);
  }

  private buildPm2LifecycleFailureResult(result: Pm2LifecycleResult): StartResult {
    const message = result.success ? 'PM2 command failed unexpectedly' : result.message;
    const failure = this.buildStartupFailureInfo(message);

    return {
      success: false,
      resultSession: {
        exitCode: -1,
        stdout: result.stdout,
        stderr: result.stderr || message,
        duration: 0,
        timestamp: failure.timestamp,
        success: false,
        errorMessage: message,
        port: failure.port,
      },
      parsedResult: {
        success: false,
        errorMessage: message,
        rawOutput: failure.log,
        port: failure.port,
      },
      port: failure.port,
    };
  }

  private async resolveManagedLaunchContext(): Promise<{
    runtimeRoot: string;
    dotnetPath: string;
    serviceDllPath: string;
    serviceWorkingDirectory: string;
    bundledRuntimeVersion?: string;
    requiredRuntimeLabel?: string;
    runtimeSource?: string;
  }> {
    if (!this.activeVersionPath) {
      throw new Error('No active version set');
    }

    const manifest = await manifestReader.readManifest(this.activeVersionPath);
    const desktopCompatibility = evaluateDesktopCompatibility(manifest, app.getVersion());
    if (!desktopCompatibility.compatible) {
      throw new ManagedLaunchError(
        'desktop-incompatible',
        desktopCompatibility.reason ?? 'Package requires a newer Desktop version.',
      );
    }

    const payloadValidation = await validateFrameworkDependentPayload(this.activeVersionPath, manifest);
    if (!payloadValidation.startable) {
      throw new ManagedLaunchError(
        'invalid-service-payload',
        `Invalid service payload: ${payloadValidation.message ?? 'framework-dependent payload validation failed.'}`,
      );
    }

    const runtimeRoot = this.pathManager.getPinnedRuntimeRoot();
    const bundledRuntimeValidation = await validateBundledRuntimeForPlatform({
      platform: this.pathManager.getCurrentPlatform(),
      runtimeRoot,
      requirement: payloadValidation.requirement,
      executableName: this.pathManager.getEmbeddedDotnetExecutableName(),
    });

    if (!bundledRuntimeValidation.valid) {
      throw new ManagedLaunchError(
        bundledRuntimeValidation.code ?? 'runtime-incompatible',
        bundledRuntimeValidation.message ?? 'Bundled Desktop runtime validation failed.',
      );
    }

    const runtimeValidation = bundledRuntimeValidation.runtimeValidation;
    const pinnedRuntimeValidation = bundledRuntimeValidation.pinnedRuntimeValidation;
    const compatibility = bundledRuntimeValidation.compatibility
      ?? (payloadValidation.requirement
        ? evaluateRuntimeCompatibility(payloadValidation.requirement, runtimeValidation.aspNetCoreVersion)
        : undefined);

    if (compatibility && !compatibility.compatible) {
      throw new ManagedLaunchError(
        'runtime-incompatible',
        `Pinned runtime version incompatible. ${compatibility.reason ?? 'Unsupported ASP.NET Core version.'}`,
      );
    }

    log.info('[WebService] Using pinned runtime root:', runtimeRoot);
    log.info('[WebService] Using pinned dotnet executable:', runtimeValidation.dotnetPath);
    log.info('[WebService] Managed entry point:', payloadValidation.payloadPaths.serviceDllPath);
    log.info('[WebService] Managed working directory:', path.dirname(payloadValidation.payloadPaths.serviceDllPath));
    if (runtimeValidation.aspNetCoreVersion) {
      log.info('[WebService] Pinned ASP.NET Core runtime:', runtimeValidation.aspNetCoreVersion);
    }
    if (pinnedRuntimeValidation.metadata?.downloadUrl) {
      log.info('[WebService] Pinned runtime source:', pinnedRuntimeValidation.metadata.downloadUrl);
    }
    if (payloadValidation.requirement?.effectiveLabel) {
      log.info('[WebService] Required ASP.NET Core runtime:', payloadValidation.requirement.effectiveLabel);
    }

    return {
      runtimeRoot,
      dotnetPath: runtimeValidation.dotnetPath,
      serviceDllPath: payloadValidation.payloadPaths.serviceDllPath,
      serviceWorkingDirectory: path.dirname(payloadValidation.payloadPaths.serviceDllPath),
      bundledRuntimeVersion: runtimeValidation.aspNetCoreVersion,
      requiredRuntimeLabel: payloadValidation.requirement?.effectiveLabel,
      runtimeSource: pinnedRuntimeValidation.metadata?.downloadUrl,
    };
  }

  /**
   * Execute entryPoint.start script and wait for result.json generation
   *
   * On Windows with .ps1 scripts: Uses direct PowerShell invocation via PowerShellExecutor
   * On Windows with .bat/.cmd: Uses legacy spawn with shell (deprecated)
   * On Unix/Linux: Uses bash to execute .sh scripts
   *
   * @param scriptPath - Full path to the start script
   * @param workingDirectory - Directory where script should be executed
   * @returns ResultSessionFile from generated result.json
   */
  private async executeStartScript(
    scriptPath: string,
    workingDirectory: string
  ): Promise<ResultSessionFile> {
    log.info('[WebService] Executing start script:', scriptPath);
    log.info('[WebService] Working directory:', workingDirectory);

    // Use PowerShellExecutor for .ps1 scripts on Windows
    if (process.platform === 'win32' && scriptPath.endsWith('.ps1')) {
      log.info('[WebService] Using PowerShellExecutor for direct invocation');
      const executor = new PowerShellExecutor();

      try {
        const result = await executor.executeAndReadResult(scriptPath, workingDirectory, {
          cwd: workingDirectory,
          timeout: this.startTimeout,
        });
        return result;
      } catch (error) {
        log.error('[WebService] PowerShell execution failed:', error);
        throw error;
      }
    }

    // Legacy execution path for .bat/.cmd on Windows and .sh on Unix
    // Ensure script has execute permissions on Unix
    if (process.platform !== 'win32') {
      try {
        await fs.chmod(scriptPath, 0o755);
      } catch (error) {
        log.warn('[WebService] Failed to set execute permissions:', error);
      }
    }

    // Build command and arguments based on platform
    // For PowerShell scripts: use 'powershell.exe' with script path as argument
    // For other scripts: use script path directly
    let command: string;
    let args: string[];

    if (process.platform === 'win32' && scriptPath.endsWith('.ps1')) {
      // PowerShell script: explicit PowerShell invocation
      command = 'powershell.exe';
      args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
      log.info('[WebService] Using explicit PowerShell invocation');
    } else {
      // Other scripts: direct invocation
      command = scriptPath;
      args = [];
    }

    const toolchainCommandName = detectToolchainCommandName(command);
    if (toolchainCommandName) {
      const activationPolicy = await new BundledNodeRuntimeManager(this.pathManager).getDesktopActivationPolicy();
      const launchPlan = resolveToolchainLaunchPlan({
        commandName: toolchainCommandName,
        args,
        pathManager: this.pathManager,
        activationPolicy,
      });
      command = launchPlan.command;
      args = launchPlan.args;
      log.info('[WebService] Resolved desktop-owned toolchain launch:', {
        commandName: toolchainCommandName,
        command,
        resolutionSource: launchPlan.resolutionSource,
        usedBundledToolchain: launchPlan.usedBundledToolchain,
        fellBackToSystemPath: launchPlan.fellBackToSystemPath,
        activationPolicy,
      });
    }

    // Execute script
    return new Promise((resolve, reject) => {
      // On Windows with shell: true, paths with spaces need to be quoted
      const spawnCommand = (process.platform === 'win32' && !scriptPath.endsWith('.ps1') && command.includes(' '))
        ? `"${command}"`
        : command;
      const useShell = !scriptPath.endsWith('.ps1') && shouldUseShellForCommand(spawnCommand);

      const child = spawn(spawnCommand, args, {
        cwd: workingDirectory,
        shell: useShell,
        stdio: 'ignore',
        detached: process.platform === 'win32',
        // Hide console window on Windows to prevent visual disruption
        ...(process.platform === 'win32' && { windowsHide: true }),
      });

      let timeout: NodeJS.Timeout | null = null;
      let isResolved = false;

      // Enhanced process termination helper for Windows detached processes
      const terminateProcess = (reason: string) => {
        if (isResolved) return;

        log.warn(`[WebService] Terminating start script (${reason}):`, scriptPath);

        if (process.platform === 'win32') {
          try {
            child.kill('SIGKILL');
          } catch (e) {
            log.error('[WebService] Failed to kill Windows process:', e);
          }
        } else {
          child.kill('SIGKILL');
        }
      };

      // Set timeout (30 seconds for start) with enhanced logging
      timeout = setTimeout(() => {
        terminateProcess('timeout');
        isResolved = true;
        reject(new Error(`Start script execution timeout after ${this.startTimeout}ms`));
      }, this.startTimeout);

      child.on('exit', async (code) => {
        if (timeout) clearTimeout(timeout);
        if (isResolved) return; // Already resolved via timeout
        isResolved = true;

        log.info('[WebService] Start script exited normally with code:', code, 'platform:', process.platform);

        // Wait a bit for result.json to be written
        await new Promise(resolve => setTimeout(resolve, 500));

        // Read result.json
        const result = await this.readResultFile(workingDirectory);

        if (result) {
          resolve(result);
        } else {
          // Fallback: create a result from exit code
          resolve({
            exitCode: code ?? -1,
            stdout: '',
            stderr: 'result.json not found',
            duration: 0,
            timestamp: new Date().toISOString(),
            success: false,
            errorMessage: 'result.json file was not generated',
          });
        }
      });

      child.on('error', async (error) => {
        if (timeout) clearTimeout(timeout);
        if (isResolved) return; // Already resolved via timeout
        isResolved = true;

        log.error('[WebService] Start script execution error:', error.message);

        // Try to read result.json even on error
        const result = await this.readResultFile(workingDirectory);
        if (result) {
          resolve(result);
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Get the startup script path for the current platform
   *
   * Uses entryPoint.start if available, otherwise falls back to platform-specific defaults.
   *
   * @returns The path to the startup script
   */
  private getStartupScriptPath(): string {
    // Use entryPoint.start if available
    if (this.entryPoint?.start) {
      const scriptPath = path.resolve(
        this.activeVersionPath || '',
        this.entryPoint.start
      );
      log.info('[WebService] Using entryPoint.start script:', scriptPath);
      return scriptPath;
    }

    // Fallback to platform-specific default
    const basePath = this.activeVersionPath || (() => {
      const currentPlatform = this.pathManager.getCurrentPlatform();
      return this.pathManager.getInstalledPath(currentPlatform);
    })();

    // Return platform-specific script path
    const scriptName = process.platform === 'win32' ? 'start.ps1' : 'start.sh';
    return path.join(basePath, scriptName);
  }

  /**
   * Get platform-specific startup arguments
   * Note: We don't add --urls parameter.
   * URL configuration is injected via ASPNETCORE_URLS environment variable at spawn time.
   */
  private getPlatformSpecificArgs(): string[] {
    return this.config.args || [];
  }

  /**
   * Get platform-specific spawn options for non-PowerShell scripts
   *
   * For Windows with .bat/.cmd: shell=true, detached=true, windowsHide=true (legacy)
   * For Unix: shell=false, detached=false, stdio=['ignore', 'pipe', 'pipe']
   *
   * Note: PowerShell (.ps1) scripts are handled by PowerShellExecutor.spawnService()
   * This method is only used for .bat/.cmd files on Windows and .sh on Unix.
   *
   * When using startup script, the working directory is the script's directory
   */
  private getSpawnOptions(mergedEnv: NodeJS.ProcessEnv) {
    const scriptPath = this.getStartupScriptPath();
    const options: any = {
      env: mergedEnv,
      cwd: path.dirname(scriptPath),
    };

    // On Unix, ensure script has execute permissions
    if (process.platform !== 'win32') {
      fs.chmod(scriptPath, 0o755).catch(error => {
        log.warn('[WebService] Failed to set execute permissions on script:', error);
      });
    }

    // On Windows .bat/.cmd: legacy shell mode for compatibility
    // On Unix: direct script execution with output capture
    if (process.platform === 'win32') {
      // BAT/CMD files: legacy shell mode
      options.shell = shouldUseShellForCommand(scriptPath);
      options.detached = true;
      options.windowsHide = true;
    } else {
      // Unix: direct script execution with output capture
      options.shell = false;
      options.detached = false;
      options.stdio = ['ignore', 'pipe', 'pipe'];
    }

    return options;
  }

  /**
   * Get the command and arguments for non-PowerShell scripts
   *
   * For Windows .bat/.cmd: Returns script path directly (legacy)
   * For Unix: Returns script path directly
   *
   * Note: PowerShell (.ps1) scripts are handled by PowerShellExecutor.spawnService()
   */
  private getSpawnCommand(): { command: string; args: string[] } {
    const scriptPath = this.getStartupScriptPath();
    const args = this.getPlatformSpecificArgs();

    // On Windows with shell: true, paths with spaces need to be quoted
    if (process.platform === 'win32' && scriptPath.includes(' ')) {
      return { command: `"${scriptPath}"`, args };
    }

    return { command: scriptPath, args };
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
    const systemVaultEnv = await buildDesktopSystemVaultEnv({
      pathResolver: createDesktopSystemVaultPathResolver(this.pathManager),
    });

    for (const warning of systemVaultEnv.warnings) {
      log.warn('[WebService][SystemVaultEnv]', warning);
    }

    const buildResult = buildManagedServiceEnv({
      host: this.config.host,
      port: this.config.port,
      dataDir,
      systemVaultEnvEntries: systemVaultEnv.envEntries,
      yamlConfig: existingConfig,
      existingEnv,
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
   * Start the web service process with the bundled dotnet host
   * @returns StartResult with service URL and port information
   */
  async start(): Promise<StartResult> {
    await this.ensureSavedConfigInitialized();
    this.resetStartupLogBuffer();
    this.appendStartupLogLine(`Starting service with configured host ${this.config.host} and port ${this.config.port}`);

    // PM2 restart_time is diagnostic state from the previous runtime. A manual
    // Desktop start should always get a fresh attempt, especially after version switches.
    this.restartCount = 0;

    if (this.process || this.status === 'running') {
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

    try {
      this.status = 'starting';
      log.info('[WebService] Starting with configured host/port:', {
        host: this.config.host,
        port: this.config.port,
      });

      let launchContext: {
        runtimeRoot: string;
        dotnetPath: string;
        serviceDllPath: string;
        serviceWorkingDirectory: string;
        bundledRuntimeVersion?: string;
        requiredRuntimeLabel?: string;
        runtimeSource?: string;
      };

      try {
        launchContext = await this.resolveManagedLaunchContext();
        this.appendStartupLogLine(`Pinned runtime root: ${launchContext.runtimeRoot}`);
        this.appendStartupLogLine(`Managed entry point: ${launchContext.serviceDllPath}`);
        this.appendStartupLogLine(`Managed working directory: ${launchContext.serviceWorkingDirectory}`);
        if (launchContext.bundledRuntimeVersion) {
          this.appendStartupLogLine(`Pinned ASP.NET Core runtime: ${launchContext.bundledRuntimeVersion}`);
        }
        if (launchContext.runtimeSource) {
          this.appendStartupLogLine(`Pinned runtime source: ${launchContext.runtimeSource}`);
        }
        if (launchContext.requiredRuntimeLabel) {
          this.appendStartupLogLine(`Required ASP.NET Core runtime: ${launchContext.requiredRuntimeLabel}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = error instanceof ManagedLaunchError ? error.code : 'runtime-incompatible';
        log.error('[WebService] Managed runtime validation failed:', errorCode, errorMessage);
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, errorMessage);
        this.appendStartupLogLine(`Start failed [${errorCode}]: ${errorMessage}`);
        return this.buildStartupFailureResult(errorMessage);
      }

      let preparedEnv: NodeJS.ProcessEnv;
      let envMode: WebServiceConfigMode = 'env';
      try {
        const prepared = await this.prepareServiceEnvironment();
        const runtimeEnv = this.buildManagedRuntimeEnvironment(prepared.mergedEnv, launchContext.runtimeRoot);
        const activationPolicy = await new BundledNodeRuntimeManager(this.pathManager).getDesktopActivationPolicy();
        const toolchainEnv = injectPortableToolchainEnv(runtimeEnv, this.pathManager, { activationPolicy });
        const selectedNodeRuntimeRoot = toolchainEnv.usedBundledToolchain
          ? this.pathManager.getPortableNodeRoot()
          : null;
        preparedEnv = this.applySelectedNodeNpmEnvironment(toolchainEnv.env, selectedNodeRuntimeRoot);
        envMode = prepared.mode;
        const pathKey = toolchainEnv.pathKey;
        this.appendStartupLogLine(`DOTNET_ROOT=${launchContext.runtimeRoot}`);
        this.appendStartupLogLine('DOTNET_MULTILEVEL_LOOKUP=0');
        this.appendStartupLogLine(`${pathKey} includes pinned runtime root`);
        if (selectedNodeRuntimeRoot) {
          this.appendStartupLogLine(`Selected Node runtime root=${selectedNodeRuntimeRoot}`);
        }
        this.appendStartupLogLine(`Bundled portable toolchain policy: enabled=${activationPolicy.enabled}, source=${activationPolicy.source}`);
        if (toolchainEnv.usedBundledToolchain) {
          this.appendStartupLogLine(`HAGICODE_PORTABLE_TOOLCHAIN_ROOT=${toolchainEnv.toolchainRoot}`);
          this.appendStartupLogLine('Bundled portable toolchain activated for desktop-managed startup');
          this.appendStartupLogLine(`${pathKey} prepends bundled toolchain paths: ${toolchainEnv.injectedPaths.join(', ')}`);
          log.info('[WebService] Portable toolchain injection enabled:', {
            pathKey,
            toolchainRoot: toolchainEnv.toolchainRoot,
            injectedPaths: toolchainEnv.injectedPaths,
            activationPolicy,
          });
        } else {
          if (activationPolicy.enabled === false) {
            this.appendStartupLogLine(`Bundled portable toolchain explicitly disabled for desktop startup; keeping inherited system PATH (${activationPolicy.source})`);
          } else {
            this.appendStartupLogLine('Bundled portable toolchain unavailable for desktop startup; keeping inherited system PATH');
            if (toolchainEnv.missingInjectedPaths.length > 0) {
              this.appendStartupLogLine(`Missing bundled PATH entries: ${toolchainEnv.missingInjectedPaths.join(', ')}`);
            }
          }
          log.info('[WebService] Portable toolchain injection skipped, falling back to inherited PATH:', {
            toolchainRoot: toolchainEnv.toolchainRoot,
            missingInjectedPaths: toolchainEnv.missingInjectedPaths,
            activationPolicy,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('[WebService] Failed to prepare environment injection:', errorMessage);
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, `Environment injection failed: ${errorMessage}`);
        this.appendStartupLogLine(`Start failed: environment injection failed - ${errorMessage}`);
        return this.buildStartupFailureResult(`Environment injection failed: ${errorMessage}`);
      }

      this.emitPhase(StartupPhase.Spawning, 'Starting service with bundled dotnet runtime through PM2...');
      const spawnArgs = [launchContext.serviceDllPath, ...(this.config.args || [])];
      const pm2RuntimeDirectory = this.getPm2RuntimeFilesDirectory();
      this.appendStartupLogLine(`PM2 managed service: ${launchContext.dotnetPath} ${spawnArgs.join(' ')}`);
      this.appendStartupLogLine(`PM2 runtime files directory: ${pm2RuntimeDirectory}`);

      if (await this.isManagedServiceReachable(this.config.port)) {
        log.warn('[WebService] Target port is reachable before PM2 start; PM2 start may fail if this is a non-PM2 port conflict:', {
          port: this.config.port,
        });
        this.appendStartupLogLine(`Target port ${this.config.port} is already reachable before PM2 start`);
      }

      const pm2StartResult = await this.pm2Manager.startFresh({
        dotnetPath: launchContext.dotnetPath,
        serviceDllPath: launchContext.serviceDllPath,
        serviceWorkingDirectory: launchContext.serviceWorkingDirectory,
        runtimeFilesDirectory: pm2RuntimeDirectory,
        args: this.config.args || [],
        env: preparedEnv,
      });

      if (!pm2StartResult.success) {
        log.error('[WebService] PM2 start failed:', {
          operation: pm2StartResult.operation,
          errorCode: pm2StartResult.errorCode,
          message: pm2StartResult.message,
        });
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, pm2StartResult.message);
        this.appendStartupLogLine(`Start failed [${pm2StartResult.errorCode}]: ${pm2StartResult.message}`);
        return this.buildPm2LifecycleFailureResult(pm2StartResult);
      }

      this.lastPm2Env = preparedEnv;

      // Wait for listening
      this.emitPhase(StartupPhase.WaitingListening, 'Waiting for service to start listening...');
      const listening = await this.waitForPortListening();
      if (!listening) {
        log.error('[WebService] Process not listening on port');
        this.emitPhase(StartupPhase.Error, 'Service failed to start listening');
        this.appendStartupLogLine(`Start failed: service did not listen on ${this.config.host}:${this.config.port}`);
        await this.stop();
        this.status = 'error';
        return this.buildStartupFailureResult('Service failed to start listening');
      }

      // Health check
      this.emitPhase(StartupPhase.HealthCheck, 'Performing health check...');
      const healthCheckPassed = await this.waitForHealthCheck();

      if (healthCheckPassed) {
        this.status = 'running';
        this.startTime = Date.now();

        // Persist successful bind configuration for future starts without storing process identity.
        await this.saveLastSuccessfulConfig();

        log.info('[WebService] Service started successfully on port:', this.config.port);
        log.info('[WebService] Environment injection confirmed:', {
          mode: envMode,
          managedVariableCount: this.lastManagedEnvSnapshot.length,
        });
        this.emitPhase(StartupPhase.Running, 'Service is running');
        log.info('[WebService] Started successfully via PM2 process name');

        // Return success result with URL and port
        return {
          success: true,
          resultSession: {
            exitCode: 0,
            stdout: '',
            stderr: '',
            duration: 0,
            timestamp: new Date().toISOString(),
            success: true,
          },
          parsedResult: {
            success: true,
            rawOutput: '',
          },
          url: buildAccessUrl(this.config.host, this.config.port),
          port: this.config.port,
        };
      } else {
        log.error('[WebService] Health check failed');
        this.emitPhase(StartupPhase.Error, 'Health check failed');
        this.appendStartupLogLine('Start failed: health check did not pass within timeout');
        await this.stop();
        this.status = 'error';
        return this.buildStartupFailureResult('Health check failed');
      }
    } catch (error) {
      log.error('[WebService] Failed to start:', error);
      this.status = 'error';
      this.process = null;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.appendStartupLogLine(`Start failed with exception: ${errorMessage}`);
      this.emitPhase(StartupPhase.Error, `Start failed: ${errorMessage}`);
      return this.buildStartupFailureResult(errorMessage);
    }
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
   * Setup process event handlers
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        this.captureStartupProcessOutput(output, 'info');
      }
    });

    this.process.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        this.captureStartupProcessOutput(output, 'error');
      }
    });

    this.process.on('error', (error) => {
      // Provide more context for dotnet-related errors
      if (error.message.includes('dotnet') || error.message.includes('ENOENT')) {
        log.error('[WebService] Bundled dotnet executable or managed payload is not accessible:', error.message);
        log.error('[WebService] Packaged Desktop does not fall back to a machine-wide dotnet installation.');
      } else {
        log.error('[WebService] Process error:', error.message);
      }
      this.appendStartupLogLine(`Process error: ${error.message}`);
      this.status = 'error';
      this.process = null;
    });

    this.process.on('exit', (code, signal) => {
      log.info('[WebService] Process exited, code:', code, 'signal:', signal);
      this.appendStartupLogLine(`Process exited: code=${String(code)} signal=${String(signal)}`);

      // Enhanced logging for debugging startup failures
      if (this.currentPhase === StartupPhase.Spawning || this.currentPhase === StartupPhase.WaitingListening) {
        log.error('[WebService] Process exited during startup phase');
        log.error('[WebService] Startup phase:', this.currentPhase);
        log.error('[WebService] Managed entry point:', this.activeVersionPath ? path.join(this.activeVersionPath, 'lib', 'PCode.Web.dll') : 'unknown');
        log.error('[WebService] Exit code:', code, 'Signal:', signal);

        if (code === 0 && this.currentPhase === StartupPhase.Spawning) {
          log.error('[WebService] Early exit with code 0 before the managed service became healthy.');
          log.error('[WebService] Check bundled runtime validation, runtime compatibility, and service startup logs.');
        }
      }

      if (this.status === 'running') {
        // Unexpected exit
        log.warn('[WebService] Process exited unexpectedly');
        this.restartCount++;
        this.status = 'error';
      }

      this.process = null;
    });

    this.process.on('close', () => {
      log.info('[WebService] Process closed');
      this.process = null;
      if (this.status === 'running') {
        this.status = 'stopped';
      }
    });
  }

  /**
   * Stop the web service process
   */
  async stop(): Promise<boolean> {
    if (!this.process && this.status !== 'running') {
      log.warn('[WebService] Process not running');
      return false;
    }

    try {
      this.status = 'stopping';
      log.info('[WebService] Stopping web service...');

      const pm2Stop = await this.pm2Manager.stop(this.getPm2RuntimeFilesDirectory(), this.lastPm2Env ?? process.env);
      if (!pm2Stop.success) {
        log.error('[WebService] PM2 stop failed:', {
          operation: pm2Stop.operation,
          errorCode: pm2Stop.errorCode,
          message: pm2Stop.message,
        });
      }

      if (this.process) {
        const pid = this.process.pid;

        // Try graceful shutdown first
        log.info('[WebService] Sending SIGTERM to process:', pid);
        this.process.kill('SIGTERM');

        // Wait for graceful shutdown
        await Promise.race([
          new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              if (!this.process) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 500);
          }),
          new Promise(resolve => setTimeout(resolve, this.stopTimeout))
        ]);

        // Force kill if still running
        if (this.process) {
          log.warn('[WebService] Force killing process:', pid);
          await this.forceKill();
        }
      }

      this.status = 'stopped';
      this.process = null;
      this.lastPm2Env = null;
      this.startTime = null;
      this.restartCount = 0;
      log.info('[WebService] Stopped successfully');
      return true;
    } catch (error) {
      log.error('[WebService] Failed to stop:', error);
      this.status = 'error';
      return false;
    }
  }

  /**
   * Force kill the process and its children
   */
  private async forceKill(): Promise<void> {
    if (!this.process) return;

    const platform = process.platform;
    const pid = this.process.pid;

    if (!pid) {
      this.process = null;
      return;
    }

    try {
      if (platform === 'win32') {
        // Windows: use taskkill to terminate process tree
        const { spawn } = await import('child_process');
        spawn('taskkill', ['/F', '/T', '/PID', pid.toString()], {
          stdio: 'ignore',
          // Hide console window on Windows to prevent visual disruption
          windowsHide: true,
        });
      } else {
        // Unix: kill process group using negative PID
        try {
          process.kill(-pid, 'SIGKILL');
          log.info('[WebService] Killed process group:', -pid);
        } catch (groupError) {
          // Fallback: kill individual process
          log.warn('[WebService] Group kill failed, trying individual PID:', pid);
          process.kill(pid, 'SIGKILL');
        }
      }

      // Wait a bit for the process to die
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      log.error('[WebService] Force kill failed:', error);
    }

    this.process = null;
  }

  /**
   * Restart the web service
   */
  async restart(): Promise<StartResult> {
    log.info('[WebService] Restarting web service...');
    this.process = null;
    this.status = 'stopped';
    this.restartCount = 0;
    return await this.start();
  }

  /**
   * Get current process status
   */
  async getStatus(): Promise<ProcessInfo> {
    await this.ensureSavedConfigInitialized();

    const pm2Status = await this.pm2Manager.status(this.getPm2RuntimeFilesDirectory(), this.lastPm2Env ?? process.env);
    if (pm2Status.success && pm2Status.status) {
      if (pm2Status.status.online) {
        this.status = 'running';
        this.currentPhase = StartupPhase.Running;
        this.startTime = this.startTime ?? Date.now() - pm2Status.status.uptime;
        this.restartCount = pm2Status.status.restartCount;
      } else if (this.status === 'running') {
        this.status = 'stopped';
        this.currentPhase = StartupPhase.Idle;
        this.startTime = null;
      }
    } else if (!pm2Status.success) {
      log.warn('[WebService] PM2 status unavailable:', {
        operation: pm2Status.operation,
        errorCode: pm2Status.errorCode,
        message: pm2Status.message,
      });
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

  /**
   * Get the web service version
   */
  async getVersion(): Promise<string> {
    try {
      // Use active version path if available
      if (this.activeVersionPath) {
        // Try reading manifest.json from active version
        const manifestPath = path.join(this.activeVersionPath, 'manifest.json');
        try {
          const manifestContent = await fs.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent);
          if (manifest.package && manifest.package.version) {
            return manifest.package.version;
          }
        } catch {
          log.warn('[WebService] Failed to read manifest from:', this.activeVersionPath);
        }
      }

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
