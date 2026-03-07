import { spawn, exec, ChildProcess } from 'child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import log from 'electron-log';
import { PathManager } from './path-manager.js';
import type { EntryPoint, ResultSessionFile, ParsedResult, StartResult } from './manifest-reader.js';
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
import { loadConsoleEnvironment } from './shell-env-loader.js';

export type ProcessStatus = 'running' | 'stopped' | 'error' | 'starting' | 'stopping';

export enum StartupPhase {
  Idle = 'idle',
  CheckingPort = 'checking_port',
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
  pid: number | null;
  uptime: number;
  startTime: number | null;
  url: string | null;
  restartCount: number;
  phase: StartupPhase;
  phaseMessage?: string;
  port: number;
  recoverySource?: RecoverySource;
  recoveryMessage?: string;
}

export type RecoverySource = 'none' | 'pid_file' | 'signature_fallback';

interface RuntimeIdentity {
  pid: number;
  port: number;
  startedAt: string;
  versionId?: string;
  recoverySource?: RecoverySource;
  recoveryMessage?: string;
  updatedAt: string;
}

interface WebServiceStateFile {
  schemaVersion?: number;
  lastSuccessfulPort?: number;
  savedAt?: string;
  runtime?: RuntimeIdentity | null;
}

interface PreparedServiceEnvironment {
  mode: WebServiceConfigMode;
  mergedEnv: NodeJS.ProcessEnv;
  managedSnapshot: ManagedEnvSnapshotEntry[];
}

export class PCodeWebServiceManager {
  private process: ChildProcess | null = null;
  private config: WebServiceConfig;
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
  private recoveredRuntime: RuntimeIdentity | null = null;
  private recoverySource: RecoverySource = 'none';
  private recoveryMessage: string | null = null;
  private startupRecoveryAttempted: boolean = false;
  private startupRecoveryPromise: Promise<void> | null = null;
  private lastManagedEnvSnapshot: ManagedEnvSnapshotEntry[] = [];
  private readonly healthCheckPaths: readonly string[] = ['/api/health', '/api/health/dual-monitoring', '/api/status'];

  constructor(config: WebServiceConfig) {
    this.config = config;
    this.pathManager = PathManager.getInstance();

    // Initialize saved port asynchronously
    this.initializeSavedPort().catch(error => {
      log.error('[WebService] Failed to initialize saved port:', error);
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
    this.activeVersionId = versionId;
    this.activeVersionPath = this.pathManager.getInstalledVersionPath(versionId);
    log.info('[WebService] Active version path set to:', this.activeVersionPath);
  }

  /**
   * Clear the active version (when no version is installed)
   */
  clearActiveVersion(): void {
    this.activeVersionId = null;
    this.activeVersionPath = null;
    log.info('[WebService] Active version cleared');
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
      return parsed && typeof parsed === 'object' ? parsed : {};
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

  private async persistRuntimeIdentity(identity: RuntimeIdentity): Promise<void> {
    try {
      await this.updateStateFile((state) => ({
        ...state,
        schemaVersion: 2,
        lastSuccessfulPort: identity.port,
        savedAt: new Date().toISOString(),
        runtime: identity,
      }));
      log.info('[WebService] Persisted runtime identity:', {
        pid: identity.pid,
        port: identity.port,
        versionId: identity.versionId,
      });
    } catch (error) {
      log.error('[WebService] Failed to persist runtime identity:', error);
    }
  }

  private async invalidateRuntimeIdentity(reason: string): Promise<void> {
    this.recoveredRuntime = null;
    this.recoverySource = 'none';
    this.recoveryMessage = null;

    try {
      await this.updateStateFile((state) => ({
        ...state,
        runtime: null,
        savedAt: new Date().toISOString(),
      }));
      log.info('[WebService] Invalidated runtime identity:', reason);
    } catch (error) {
      log.warn('[WebService] Failed to invalidate runtime identity:', error);
    }
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

    // Execute script
    return new Promise((resolve, reject) => {
      // On Windows with shell: true, paths with spaces need to be quoted
      const spawnCommand = (process.platform === 'win32' && !scriptPath.endsWith('.ps1') && command.includes(' '))
        ? `"${command}"`
        : command;

      const child = spawn(spawnCommand, args, {
        cwd: workingDirectory,
        shell: !scriptPath.endsWith('.ps1') && process.platform === 'win32', // Only use shell for .bat files
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
      options.shell = true;
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

    return new Promise((resolve) => {
      let command = '';

      if (platform === 'linux') {
        // Use ss command (modern replacement for netstat)
        // We use || true to ensure the command succeeds even if grep finds nothing
        command = `ss -tuln | grep ":${port} " || true`;
      } else if (platform === 'darwin') {
        // Use lsof on macOS
        // We use || true to ensure the command succeeds even if lsof finds nothing
        command = `lsof -i :${port} || true`;
      } else if (platform === 'win32') {
        // Use netstat on Windows
        // findstr returns exit code 1 if not found, but that's expected
        command = `netstat -an | findstr ":${port} "`;
      }

      if (!command) {
        // Fallback to node check if no system command available
        resolve(null);
        return;
      }

      exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
        // For Linux/macOS, we used || true so error shouldn't occur
        // For Windows, findstr returns exit code 1 when no matches found, which is expected
        // Only treat it as a failure if it's a different type of error

        // Check if this is an expected "not found" result
        const hasOutput = stdout && stdout.trim().length > 0;

        if (hasOutput) {
          // Port is in use (output found)
          resolve(false);
        } else {
          // No output means port is available (not in use)
          resolve(true);
        }
      });
    });
  }

  /**
   * Check if the port is available
   * First tries system command for quick check, then falls back to node's net module
   * @returns Promise resolving to true if port is available, false if in use
   */
  public async checkPortAvailable(port: number = this.config.port): Promise<boolean> {
    // Try system command first (faster)
    const systemCheck = await this.checkPortWithSystemCommand(port);
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

      server.listen(port, this.config.host);
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

  private parsePidsFromOutput(output: string): number[] {
    const matches = output.match(/\b\d+\b/g) || [];
    const parsed = matches
      .map(value => Number.parseInt(value, 10))
      .filter(value => Number.isInteger(value) && value > 0);
    return [...new Set(parsed)];
  }

  private async getListeningProcessIdsByPort(port: number): Promise<number[]> {
    try {
      if (process.platform === 'win32') {
        const psCmd = `Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`;
        const output = await this.runCommand(`powershell -NoProfile -Command "${psCmd}"`);
        const pids = this.parsePidsFromOutput(output);
        if (pids.length > 0) {
          return pids;
        }

        // Fallback for environments where Get-NetTCPConnection is unavailable.
        const netstatOutput = await this.runCommand(`netstat -ano | findstr ":${port}"`);
        return netstatOutput
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.length > 0 && /LISTENING/i.test(line))
          .map(line => {
            const parts = line.split(/\s+/);
            return Number.parseInt(parts[parts.length - 1] || '', 10);
          })
          .filter(pid => Number.isInteger(pid) && pid > 0)
          .filter((pid, index, arr) => arr.indexOf(pid) === index);
      }

      const output = await this.runCommand(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`);
      return this.parsePidsFromOutput(output);
    } catch (error) {
      log.debug('[WebService] Failed to resolve listening PID by port:', { port, error });
      return [];
    }
  }

  private async resolveManagedServicePidByPort(port: number): Promise<number | null> {
    const pids = await this.getListeningProcessIdsByPort(port);
    if (pids.length === 0) {
      return null;
    }

    for (const pid of pids) {
      const commandLine = await this.getProcessCommandLine(pid);
      if (commandLine && this.isTargetDotnetSignature(commandLine)) {
        return pid;
      }
    }

    return null;
  }

  private async terminateLingeringServiceByPort(port: number): Promise<void> {
    const targetPid = await this.resolveManagedServicePidByPort(port);
    if (!targetPid) {
      log.warn('[WebService] Port remains reachable but no managed service PID could be resolved:', { port });
      return;
    }

    if (process.platform === 'win32') {
      try {
        await this.runCommand(`taskkill /F /T /PID ${targetPid}`);
        log.warn('[WebService] Terminated lingering managed service by PID/port:', { port, pid: targetPid });
      } catch (error) {
        log.error('[WebService] Failed to terminate lingering service by PID/port:', { port, pid: targetPid, error });
      }
      return;
    }

    await this.terminateRecoveredProcess(targetPid);
    log.warn('[WebService] Terminated lingering managed service by PID/port:', { port, pid: targetPid });
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
    const normalized = host.trim().toLowerCase();
    if (!normalized) {
      return ['localhost', '127.0.0.1'];
    }

    if (normalized === '0.0.0.0' || normalized === '::' || normalized === '[::]') {
      // Binding hosts are not routable for client probes.
      return ['127.0.0.1', 'localhost'];
    }

    if (normalized === 'localhost') {
      // Include IPv4 fallback to avoid DNS/IPv6 resolution edge cases.
      return ['localhost', '127.0.0.1'];
    }

    return [host];
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
    const axios = await import('axios');
    const urls = this.buildHealthCheckUrls(port);
    let lastErrorMessage = 'No health check endpoint responded';

    for (const url of urls) {
      try {
        const response = await axios.default.get(url, {
          timeout: 5000,
          validateStatus: () => true,
        });
        if (response.status >= 200 && response.status < 300) {
          log.info('[WebService] Health check passed:', url, 'status:', response.status);
          return true;
        }
        lastErrorMessage = `HTTP ${response.status}`;
        log.debug('[WebService] Health endpoint not ready:', url, 'status:', response.status);
      } catch (error) {
        if (axios.default.isAxiosError(error)) {
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

  private async isProcessAlive(pid: number): Promise<boolean> {
    if (!Number.isInteger(pid) || pid <= 0) {
      return false;
    }

    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // EPERM means process exists but we don't have signal permission.
      return code === 'EPERM';
    }
  }

  private runCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, { timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(`${stdout || ''}\n${stderr || ''}`);
      });
    });
  }

  private async getProcessCommandLine(pid: number): Promise<string | null> {
    try {
      if (process.platform === 'win32') {
        const escaped = `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object -ExpandProperty CommandLine)`;
        const output = await this.runCommand(`powershell -NoProfile -Command "${escaped}"`);
        const line = output.trim();
        return line || null;
      }

      const output = await this.runCommand(`ps -p ${pid} -o args=`);
      const line = output.trim();
      return line || null;
    } catch (error) {
      log.warn('[WebService] Failed to read process command line:', { pid, error });
      return null;
    }
  }

  private isTargetDotnetSignature(commandLine: string): boolean {
    const normalized = commandLine.toLowerCase();
    const hasDotnet = normalized.includes('dotnet');
    const hasTargetDll = normalized.includes('pcode.web.dll');

    if (!hasDotnet || !hasTargetDll) {
      return false;
    }

    if (!this.activeVersionId) {
      return true;
    }

    // Active version may not always be present in command line when script cd's first.
    return true;
  }

  private applyRecoveredRunningState(identity: RuntimeIdentity, source: RecoverySource, message: string): void {
    this.status = 'running';
    this.currentPhase = StartupPhase.Running;
    this.config.port = identity.port;
    this.startTime = Number.isFinite(Date.parse(identity.startedAt)) ? Date.parse(identity.startedAt) : null;
    this.recoveredRuntime = {
      ...identity,
      recoverySource: source,
      recoveryMessage: message,
      updatedAt: new Date().toISOString(),
    };
    this.recoverySource = source;
    this.recoveryMessage = message;
  }

  private async validatePrimaryRecovery(identity: RuntimeIdentity): Promise<boolean> {
    const pidAlive = await this.isProcessAlive(identity.pid);
    if (!pidAlive) {
      return false;
    }

    const portReachable = await this.checkPortReachable(this.config.host, identity.port);
    if (!portReachable) {
      return false;
    }

    return await this.performHealthCheck(identity.port);
  }

  private async validateSignatureFallback(identity: RuntimeIdentity): Promise<boolean> {
    const pidAlive = await this.isProcessAlive(identity.pid);
    if (!pidAlive) {
      return false;
    }

    const commandLine = await this.getProcessCommandLine(identity.pid);
    if (!commandLine) {
      return false;
    }

    return this.isTargetDotnetSignature(commandLine);
  }

  private async attemptStartupRecovery(): Promise<void> {
    const state = await this.readStateFile();
    if (!state.runtime) {
      return;
    }

    const runtime = state.runtime;
    if (!runtime.pid || !runtime.port) {
      await this.invalidateRuntimeIdentity('invalid-runtime-shape');
      return;
    }

    if (await this.validatePrimaryRecovery(runtime)) {
      this.applyRecoveredRunningState(runtime, 'pid_file', 'Recovered via persisted pid+port+health');
      log.info('[WebService] Startup recovery succeeded via PID file:', {
        pid: runtime.pid,
        port: runtime.port,
      });
      return;
    }

    if (await this.validateSignatureFallback(runtime)) {
      this.applyRecoveredRunningState(runtime, 'signature_fallback', 'Recovered via process signature fallback');
      log.warn('[WebService] Startup recovery used signature fallback:', {
        pid: runtime.pid,
        port: runtime.port,
      });
      return;
    }

    await this.invalidateRuntimeIdentity('recovery-failed');
  }

  private async ensureStartupRecovery(): Promise<void> {
    if (this.startupRecoveryAttempted) {
      if (this.startupRecoveryPromise) {
        await this.startupRecoveryPromise;
      }
      return;
    }

    this.startupRecoveryAttempted = true;
    this.startupRecoveryPromise = this.attemptStartupRecovery()
      .catch(error => {
        log.error('[WebService] Startup recovery failed:', error);
      })
      .finally(() => {
        this.startupRecoveryPromise = null;
      });

    await this.startupRecoveryPromise;
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

    const buildResult = buildManagedServiceEnv({
      host: this.config.host,
      port: this.config.port,
      dataDir,
      yamlConfig: existingConfig,
      existingEnv,
    });

    if (buildResult.errors.length > 0) {
      throw new Error(`Environment mapping validation failed: ${buildResult.errors.join('; ')}`);
    }

    const mergedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...consoleEnv,
      ...this.config.env,
      ...buildResult.injectedEnv,
    };

    if (Object.keys(consoleEnv).length > 0) {
      log.info('[WebService] Console environment merged for startup:', {
        envCount: Object.keys(consoleEnv).length,
        source: process.platform === 'win32' ? 'powershell-profile' : 'shell-rc',
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
   * Start the web service process using entryPoint.start script
   * @returns StartResult with service URL and port information
   */
  async start(): Promise<StartResult> {
    await this.ensureStartupRecovery();

    // Default result for failures
    const failureResult: StartResult = {
      success: false,
      resultSession: {
        exitCode: -1,
        stdout: '',
        stderr: 'Start failed',
        duration: 0,
        timestamp: new Date().toISOString(),
        success: false,
        errorMessage: 'Unknown error',
      },
      parsedResult: {
        success: false,
        errorMessage: 'Unknown error',
        rawOutput: '',
      },
    };

    if (this.process || this.status === 'running') {
      log.warn('[WebService] Process already running');
      return {
        ...failureResult,
        parsedResult: {
          ...failureResult.parsedResult,
          errorMessage: 'Process already running',
        },
      };
    }

    if (this.restartCount >= this.maxRestartAttempts) {
      log.error('[WebService] Max restart attempts reached');
      this.status = 'error';
      this.emitPhase(StartupPhase.Error, 'Max restart attempts reached');
      return {
        ...failureResult,
        parsedResult: {
          ...failureResult.parsedResult,
          errorMessage: 'Max restart attempts reached',
        },
      };
    }

    // Check if entryPoint is available
    if (!this.entryPoint) {
      log.error('[WebService] No entryPoint available for start');
      this.status = 'error';
      this.emitPhase(StartupPhase.Error, 'No entryPoint configured');
      return {
        ...failureResult,
        parsedResult: {
          ...failureResult.parsedResult,
          errorMessage: 'No entryPoint configured',
        },
      };
    }

    if (!this.activeVersionPath) {
      log.error('[WebService] No active version path set');
      this.status = 'error';
      this.emitPhase(StartupPhase.Error, 'No active version');
      return {
        ...failureResult,
        parsedResult: {
          ...failureResult.parsedResult,
          errorMessage: 'No active version set',
        },
      };
    }

    try {
      this.status = 'starting';
      log.info('[WebService] Starting with configured port:', this.config.port);
      this.emitPhase(StartupPhase.CheckingPort, 'Checking port availability...');

      // Check port availability and auto-increment if needed
      let portAvailable = await this.checkPortAvailable();
      let portCheckAttempts = 0;
      const maxPortCheckAttempts = 100; // Prevent infinite loop

      while (!portAvailable && portCheckAttempts < maxPortCheckAttempts) {
        log.warn('[WebService] Port already in use:', `${this.config.host}:${this.config.port}`);

        // Increment port and try again
        this.config.port++;
        portCheckAttempts++;

        log.info('[WebService] Trying port:', this.config.port);
        portAvailable = await this.checkPortAvailable();

        if (portAvailable) {
          log.info('[WebService] Found available port:', this.config.port);
          // Save new port to configuration
          await this.savePort(this.config.port);
          this.emitPhase(StartupPhase.CheckingPort, `Port ${this.config.port} available`);
        }
      }

      log.info('[WebService] Port availability check:', portAvailable ? 'available' : 'in use');
      if (!portAvailable) {
        log.error('[WebService] Could not find available port after', maxPortCheckAttempts, 'attempts');
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, 'Unable to find available port');
        await this.invalidateRuntimeIdentity('no-port-available');
        return {
          ...failureResult,
          parsedResult: {
            ...failureResult.parsedResult,
            errorMessage: 'Unable to find available port',
          },
        };
      }

      // Resolve start script path from entryPoint
      const startScriptPath = path.resolve(
        this.activeVersionPath!,
        this.entryPoint.start
      );

      try {
        await fs.access(startScriptPath);
        log.info('[WebService] Startup script found:', startScriptPath);
      } catch {
        log.error('[WebService] Startup script not found:', startScriptPath);
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, 'Startup script not found');
        return {
          ...failureResult,
          parsedResult: {
            ...failureResult.parsedResult,
            errorMessage: 'Startup script not found',
          },
        };
      }

      let preparedEnv: NodeJS.ProcessEnv;
      let envMode: WebServiceConfigMode = 'env';
      try {
        const prepared = await this.prepareServiceEnvironment();
        preparedEnv = prepared.mergedEnv;
        envMode = prepared.mode;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('[WebService] Failed to prepare environment injection:', errorMessage);
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, `Environment injection failed: ${errorMessage}`);
        return {
          ...failureResult,
          parsedResult: {
            ...failureResult.parsedResult,
            errorMessage: `Environment injection failed: ${errorMessage}`,
          },
        };
      }

      // Spawn the process
      this.emitPhase(StartupPhase.Spawning, 'Starting service with startup script...');
      const scriptPath = this.getStartupScriptPath();

      // Use PowerShellExecutor for .ps1 scripts on Windows
      if (process.platform === 'win32' && scriptPath.endsWith('.ps1')) {
        log.info('[WebService] Using PowerShellExecutor for service spawn');
        const executor = new PowerShellExecutor();
        this.process = executor.spawnService(scriptPath, {
          cwd: path.dirname(scriptPath),
          env: preparedEnv,
          scriptArgs: this.getPlatformSpecificArgs(),
          onStdout: (data) => {
            const output = data.toString().trim();
            if (output) {
              output.split('\n').forEach((line: string) => {
                if (line.trim()) {
                  log.info('[WebService]', line.trim());
                }
              });
            }
          },
          onStderr: (data) => {
            const output = data.toString().trim();
            if (output) {
              output.split('\n').forEach((line: string) => {
                if (line.trim()) {
                  log.error('[WebService]', line.trim());
                }
              });
            }
          },
          onExit: (code, signal) => {
            log.info('[WebService] Process exited, code:', code, 'signal:', signal);

            // Enhanced logging for debugging startup failures
            if (this.currentPhase === StartupPhase.Spawning || this.currentPhase === StartupPhase.WaitingListening) {
              log.error('[WebService] Process exited during startup phase');
              log.error('[WebService] Startup phase:', this.currentPhase);
              log.error('[WebService] Script path:', scriptPath);
              log.error('[WebService] Exit code:', code, 'Signal:', signal);

              if (code === 0 && this.currentPhase === StartupPhase.Spawning) {
                log.error('[WebService] Early exit with code 0 - script may have opened but not executed');
                log.error('[WebService] This typically happens when PowerShell script is opened in editor instead of being executed');
                log.error('[WebService] Check PowerShell execution policy and ensure script is invoked via powershell.exe');
              }
            }

            if (this.status === 'running') {
              log.warn('[WebService] Process exited unexpectedly');
              this.restartCount++;
              this.status = 'error';
            }

            this.process = null;
          },
          onError: (error) => {
            if (error.message.includes('dotnet') || error.message.includes('ENOENT')) {
              log.error('[WebService] dotnet command not found or DLL not accessible:', error.message);
              log.error('[WebService] Please ensure .NET Runtime 8.0 is installed and in PATH');
            } else {
              log.error('[WebService] Process error:', error.message);
            }
            this.status = 'error';
            this.process = null;
          },
        });
      } else {
        // Legacy path for .bat/.cmd on Windows and .sh on Unix
        const { command, args } = this.getSpawnCommand();
        const options = this.getSpawnOptions(preparedEnv);

        log.info('[WebService] Spawning process:', command, args.join(' '));
        this.process = spawn(command, args, options);

        // Setup process event handlers
        this.setupProcessHandlers();
      }

      // Wait for listening
      this.emitPhase(StartupPhase.WaitingListening, 'Waiting for service to start listening...');
      const listening = await this.waitForPortListening();
      if (!listening) {
        log.error('[WebService] Process not listening on port');
        this.emitPhase(StartupPhase.Error, 'Service failed to start listening');
        await this.stop();
        this.status = 'error';
        await this.invalidateRuntimeIdentity('listening-timeout');
        return {
          ...failureResult,
          parsedResult: {
            ...failureResult.parsedResult,
            errorMessage: 'Service failed to start listening',
          },
        };
      }

      // Health check
      this.emitPhase(StartupPhase.HealthCheck, 'Performing health check...');
      const healthCheckPassed = await this.waitForHealthCheck();

      if (healthCheckPassed) {
        this.status = 'running';
        this.startTime = Date.now();
        this.recoveredRuntime = null;
        this.recoverySource = 'none';
        this.recoveryMessage = null;

        // Persist successful port
        await this.saveLastSuccessfulPort(this.config.port);
        if (this.process?.pid) {
          let runtimePid = this.process.pid;
          const managedPid = await this.resolveManagedServicePidByPort(this.config.port);
          if (managedPid && managedPid !== runtimePid) {
            log.info('[WebService] Resolved managed runtime PID from listening port:', {
              powershellPid: runtimePid,
              managedPid,
              port: this.config.port,
            });
            runtimePid = managedPid;
          }

          await this.persistRuntimeIdentity({
            pid: runtimePid,
            port: this.config.port,
            startedAt: new Date(this.startTime).toISOString(),
            versionId: this.activeVersionId || undefined,
            recoverySource: 'none',
            recoveryMessage: 'started-by-desktop',
            updatedAt: new Date().toISOString(),
          });
        }

        log.info('[WebService] Service started successfully on port:', this.config.port);
        log.info('[WebService] Environment injection confirmed:', {
          mode: envMode,
          managedVariableCount: this.lastManagedEnvSnapshot.length,
          pid: this.process?.pid ?? null,
        });
        this.emitPhase(StartupPhase.Running, 'Service is running');
        log.info('[WebService] Started successfully, PID:', this.process.pid);

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
          url: `http://${this.config.host}:${this.config.port}`,
          port: this.config.port,
        };
      } else {
        log.error('[WebService] Health check failed');
        this.emitPhase(StartupPhase.Error, 'Health check failed');
        await this.stop();
        this.status = 'error';
        await this.invalidateRuntimeIdentity('health-check-failed');
        return {
          ...failureResult,
          parsedResult: {
            ...failureResult.parsedResult,
            errorMessage: 'Health check failed',
          },
        };
      }
    } catch (error) {
      log.error('[WebService] Failed to start:', error);
      this.status = 'error';
      this.process = null;
      this.emitPhase(StartupPhase.Error, `Start failed: ${(error as Error).message}`);
      await this.invalidateRuntimeIdentity('start-exception');
      return {
        ...failureResult,
        resultSession: {
          exitCode: -1,
          stdout: '',
          stderr: (error as Error).message,
          duration: 0,
          timestamp: new Date().toISOString(),
          success: false,
          errorMessage: (error as Error).message,
        },
        parsedResult: {
          ...failureResult.parsedResult,
          errorMessage: (error as Error).message,
        },
      };
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
        // Split by lines and log each line
        output.split('\n').forEach((line: string) => {
          if (line.trim()) {
            log.info('[WebService]', line.trim());
          }
        });
      }
    });

    this.process.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        // Split by lines and log each line
        output.split('\n').forEach((line: string) => {
          if (line.trim()) {
            log.error('[WebService]', line.trim());
          }
        });
      }
    });

    this.process.on('error', (error) => {
      // Provide more context for dotnet-related errors
      if (error.message.includes('dotnet') || error.message.includes('ENOENT')) {
        log.error('[WebService] dotnet command not found or DLL not accessible:', error.message);
        log.error('[WebService] Please ensure .NET Runtime 8.0 is installed and in PATH');
      } else {
        log.error('[WebService] Process error:', error.message);
      }
      this.status = 'error';
      this.process = null;
      void this.invalidateRuntimeIdentity('process-error');
    });

    this.process.on('exit', (code, signal) => {
      log.info('[WebService] Process exited, code:', code, 'signal:', signal);

      // Enhanced logging for debugging startup failures
      if (this.currentPhase === StartupPhase.Spawning || this.currentPhase === StartupPhase.WaitingListening) {
        log.error('[WebService] Process exited during startup phase');
        log.error('[WebService] Startup phase:', this.currentPhase);
        log.error('[WebService] Script path:', this.getStartupScriptPath());
        log.error('[WebService] Exit code:', code, 'Signal:', signal);

        if (code === 0 && this.currentPhase === StartupPhase.Spawning) {
          log.error('[WebService] Early exit with code 0 - script may have opened but not executed');
          log.error('[WebService] This typically happens when PowerShell script is opened in editor instead of being executed');
          log.error('[WebService] Check PowerShell execution policy and ensure script is invoked via powershell.exe');
        }
      }

      if (this.status === 'running') {
        // Unexpected exit
        log.warn('[WebService] Process exited unexpectedly');
        this.restartCount++;
        this.status = 'error';
        void this.invalidateRuntimeIdentity('process-exit');
      }

      this.process = null;
    });

    this.process.on('close', () => {
      log.info('[WebService] Process closed');
      this.process = null;
      if (this.status === 'running') {
        this.status = 'stopped';
        void this.invalidateRuntimeIdentity('process-close');
      }
    });
  }

  /**
   * Stop the web service process
   */
  async stop(): Promise<boolean> {
    await this.ensureStartupRecovery();

    if (!this.process && this.status !== 'running') {
      log.warn('[WebService] Process not running');
      return false;
    }

    try {
      this.status = 'stopping';
      log.info('[WebService] Stopping web service...');
      const stopPort = this.recoveredRuntime?.port || this.config.port;

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
      } else if (this.recoveredRuntime?.pid) {
        await this.terminateRecoveredProcess(this.recoveredRuntime.pid);
      }

      // Safety net: if service still listens on target port, kill the managed runtime by port lookup.
      if (await this.isManagedServiceReachable(stopPort)) {
        log.warn('[WebService] Service still reachable after stop attempt, applying port-based termination:', { port: stopPort });
        await this.terminateLingeringServiceByPort(stopPort);
      }

      this.status = 'stopped';
      this.process = null;
      this.startTime = null;
      this.recoveredRuntime = null;
      this.recoverySource = 'none';
      this.recoveryMessage = null;
      await this.invalidateRuntimeIdentity('stop-confirmed');
      log.info('[WebService] Stopped successfully');
      return true;
    } catch (error) {
      log.error('[WebService] Failed to stop:', error);
      this.status = 'error';
      return false;
    }
  }

  private async terminateRecoveredProcess(pid: number): Promise<void> {
    if (process.platform === 'win32') {
      try {
        await this.runCommand(`taskkill /F /T /PID ${pid}`);
      } catch (error) {
        log.warn('[WebService] taskkill failed for recovered pid, continuing:', { pid, error });
      }
      return;
    }

    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Keep going and verify process liveness below.
    }

    const waitUntil = Date.now() + this.stopTimeout;
    while (Date.now() < waitUntil) {
      if (!(await this.isProcessAlive(pid))) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Best effort
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

    const stopped = await this.stop();
    if (!stopped) {
      log.error('[WebService] Failed to stop for restart');
      return {
        success: false,
        resultSession: {
          exitCode: -1,
          stdout: '',
          stderr: 'Failed to stop for restart',
          duration: 0,
          timestamp: new Date().toISOString(),
          success: false,
          errorMessage: 'Failed to stop for restart',
        },
        parsedResult: {
          success: false,
          errorMessage: 'Failed to stop for restart',
          rawOutput: 'Failed to stop for restart',
        },
      };
    }

    // Wait a bit before starting again
    await new Promise(resolve => setTimeout(resolve, 2000));

    return await this.start();
  }

  /**
   * Get current process status
   */
  async getStatus(): Promise<ProcessInfo> {
    await this.ensureStartupRecovery();

    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    const activePid = this.process?.pid || this.recoveredRuntime?.pid || null;
    const runningUrl = this.status === 'running' ? `http://${this.config.host}:${this.config.port}` : null;

    return {
      status: this.status,
      pid: activePid,
      uptime,
      startTime: this.startTime,
      url: runningUrl,
      restartCount: this.restartCount,
      phase: this.currentPhase,
      port: this.config.port,
      recoverySource: this.recoverySource,
      recoveryMessage: this.recoveryMessage || undefined,
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
    const oldPort = this.config.port;
    const oldHost = this.config.host;

    this.config = {
      ...this.config,
      ...config,
      env: config.env
        ? { ...(this.config.env || {}), ...config.env }
        : this.config.env,
    };

    // Keep legacy YAML sync path behind a compatibility switch.
    const shouldSyncLegacyYaml = this.getConfigMode() === 'legacy-yaml';
    if (shouldSyncLegacyYaml && ((config.port && config.port !== oldPort) ||
        (config.host && config.host !== oldHost))) {
      try {
        await this.syncConfigToFile();
      } catch (error) {
        log.error('[WebService] Config sync failed, continuing with in-memory config');
        // Don't throw - allow in-memory config to work
      }
    } else if (!shouldSyncLegacyYaml && ((config.port && config.port !== oldPort) ||
        (config.host && config.host !== oldHost))) {
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
   * Load saved port from config file
   */
  private async loadSavedPort(): Promise<number | null> {
    const state = await this.readStateFile();
    return state.lastSuccessfulPort || null;
  }

  /**
   * Save port to config file
   */
  private async savePort(port: number): Promise<void> {
    try {
      await this.updateStateFile((state) => ({
        ...state,
        schemaVersion: Math.max(2, state.schemaVersion || 0),
        lastSuccessfulPort: port,
        savedAt: new Date().toISOString(),
      }));
      log.info('[WebService] Saved port to config:', port);
    } catch (error) {
      log.error('[WebService] Error saving port:', error);
    }
  }

  /**
   * Save last successful port to config file
   */
  private async saveLastSuccessfulPort(port: number): Promise<void> {
    try {
      await this.updateStateFile((state) => ({
        ...state,
        schemaVersion: Math.max(2, state.schemaVersion || 0),
        lastSuccessfulPort: port,
        savedAt: new Date().toISOString(),
      }));
      log.info('[WebService] Saved successful port:', port);
    } catch (error) {
      log.error('[WebService] Failed to save port configuration:', error);
      // Don't throw - port persistence is not critical
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
   * Initialize saved port configuration
   */
  private async initializeSavedPort(): Promise<void> {
    try {
      // Run migration first (one-time operation)
      await this.migrateLegacyConfig();

      // Load saved port
      const savedPort = await this.loadSavedPort();
      if (savedPort && savedPort !== this.config.port) {
        log.info('[WebService] Using saved port:', savedPort);
        this.config.port = savedPort;
      }
    } catch (error) {
      log.error('[WebService] Failed to load saved port:', error);
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

      // Persist successful port for next startup
      await this.saveLastSuccessfulPort(this.config.port);
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
