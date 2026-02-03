import { spawn, ChildProcess } from 'child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';
import log from 'electron-log';

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
  private userDataPath: string;
  private currentPhase: StartupPhase = StartupPhase.Idle;

  constructor(config: WebServiceConfig) {
    this.config = config;
    this.userDataPath = app.getPath('userData');

    // Initialize saved port asynchronously
    this.initializeSavedPort().catch(error => {
      log.error('[WebService] Failed to initialize saved port:', error);
    });
  }

  /**
   * Get the executable path for the current platform
   */
  private getExecutablePath(): string {
    if (this.config.executablePath) {
      return this.config.executablePath;
    }

    const platform = process.platform;
    const installedPath = path.join(this.userDataPath, 'pcode-web', 'installed');

    switch (platform) {
      case 'win32':
        return path.join(installedPath, 'win-x64', 'PCode.Web.exe');
      case 'darwin':
        return path.join(installedPath, 'osx-x64', 'PCode.Web');
      case 'linux':
        return path.join(installedPath, 'linux-x64', 'start.sh');
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Get platform-specific startup arguments
   */
  private getPlatformSpecificArgs(): string[] {
    const platform = process.platform;
    const args: string[] = this.config.args || [];

    // Don't add --urls parameter - let the service use appsettings.yml configuration
    // The configuration file is the single source of truth for URLs

    // Linux-specific: ensure shell script is executable
    if (platform === 'linux') {
      // The start.sh script should handle the execution
    }

    return args;
  }

  /**
   * Get platform-specific spawn options
   */
  private getSpawnOptions() {
    const platform = process.platform;
    const executablePath = this.getExecutablePath();
    const options: any = {
      env: { ...process.env, ...this.config.env },
      cwd: path.dirname(executablePath),
    };

    if (platform === 'win32') {
      // Windows: detach to run independently
      options.detached = true;
      options.windowsHide = true;
    } else {
      // Linux/macOS: keep attached for lifecycle management
      options.detached = false;
      options.stdio = 'ignore';
    }

    return options;
  }

  /**
   * Get the command and arguments for spawning
   * Handles paths with spaces correctly on all platforms
   */
  private getSpawnCommand(): { command: string; args: string[] } {
    const platform = process.platform;
    const executablePath = this.getExecutablePath();
    const args = this.getPlatformSpecificArgs();

    switch (platform) {
      case 'linux': {
        // On Linux with shell scripts, execute sh directly with script path and args
        // This ensures paths with spaces are handled correctly
        return { command: 'sh', args: [executablePath, ...args] };
      }
      case 'win32':
      case 'darwin': {
        // On Windows and macOS, pass the executable path and args directly
        // Node.js spawn handles quoting correctly on these platforms
        return { command: executablePath, args };
      }
      default:
        return { command: executablePath, args };
    }
  }

  /**
   * Check if the port is available
   * @returns Promise resolving to true if port is available, false if in use
   */
  public async checkPortAvailable(): Promise<boolean> {
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

      server.listen(this.config.port, this.config.host);
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

  /**
   * Wait for port to be listening
   */
  private async waitForPortListening(timeout: number = 60000): Promise<boolean> {
    const startTime = Date.now();
    const net = await import('node:net');
    let attempt = 0;

    log.info('[WebService] Waiting for port listening:', `${this.config.host}:${this.config.port}`, 'timeout:', timeout);

    while (Date.now() - startTime < timeout) {
      attempt++;
      try {
        await new Promise<void>((resolve, reject) => {
          const socket = new net.Socket();
          socket.setTimeout(5000);

          socket.on('connect', () => {
            socket.destroy();
            log.info('[WebService] Port is listening on attempt:', attempt);
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

          socket.connect(this.config.port, this.config.host);
        });
        return true; // Port is listening
      } catch (error) {
        // Port not ready yet, wait and retry
        log.debug('[WebService] Port not ready on attempt:', attempt, 'error:', (error as Error).message);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between attempts
      }
    }

    log.error('[WebService] Port listening timeout after', attempt, 'attempts');
    return false; // Timeout
  }

  /**
   * Perform HTTP health check on the web service
   */
  private async performHealthCheck(): Promise<boolean> {
    const axios = await import('axios');
    const url = `http://${this.config.host}:${this.config.port}/api/health`;

    try {
      const response = await axios.default.get(url, { timeout: 5000 });
      log.info('[WebService] Health check passed:', url, 'status:', response.status);
      return response.status === 200;
    } catch (error) {
      if (axios.default.isAxiosError(error)) {
        log.warn('[WebService] Health check failed:', url, 'error:', error.message);
      } else {
        log.warn('[WebService] Health check failed with unknown error:', url);
      }
      return false;
    }
  }

  /**
   * Start the web service process
   */
  async start(): Promise<boolean> {
    if (this.process) {
      log.warn('[WebService] Process already running');
      return false;
    }

    if (this.restartCount >= this.maxRestartAttempts) {
      log.error('[WebService] Max restart attempts reached');
      this.status = 'error';
      this.emitPhase(StartupPhase.Error, 'Max restart attempts reached');
      return false;
    }

    try {
      this.status = 'starting';
      log.info('[WebService] Starting with configured port:', this.config.port);
      this.emitPhase(StartupPhase.CheckingPort, 'Checking port availability...');

      // Check if executable exists
      const executablePath = this.getExecutablePath();
      try {
        await fs.access(executablePath);
      } catch {
        log.error('[WebService] Executable not found:', executablePath);
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, 'Executable not found');
        return false;
      }

      // Check port availability
      const portAvailable = await this.checkPortAvailable();
      log.info('[WebService] Port availability check:', portAvailable ? 'available' : 'in use');
      if (!portAvailable) {
        log.error('[WebService] Port already in use:', `${this.config.host}:${this.config.port}`);
        this.status = 'error';
        this.emitPhase(StartupPhase.Error, 'Port already in use');
        return false;
      }

      // Sync configuration to file before starting the service
      try {
        log.info('[WebService] Syncing configuration to file before starting service...');
        await this.syncConfigToFile();
        log.info('[WebService] Configuration synced successfully');
      } catch (error) {
        log.error('[WebService] Failed to sync configuration to file:', error);
        // Continue anyway - the service might start with the old config
      }

      // Spawn the process
      this.emitPhase(StartupPhase.Spawning, 'Starting service process...');
      const options = this.getSpawnOptions();
      const { command, args } = this.getSpawnCommand();

      log.info('[WebService] Spawning process:', command, args.join(' '));
      this.process = spawn(command, args, options);

      // Setup process event handlers
      this.setupProcessHandlers();

      // Wait for listening
      this.emitPhase(StartupPhase.WaitingListening, 'Waiting for service to start listening...');
      const listening = await this.waitForPortListening();
      if (!listening) {
        log.error('[WebService] Process not listening on port');
        this.emitPhase(StartupPhase.Error, 'Service failed to start listening');
        await this.stop();
        this.status = 'error';
        return false;
      }

      // Health check
      this.emitPhase(StartupPhase.HealthCheck, 'Performing health check...');
      const healthCheckPassed = await this.waitForHealthCheck();

      if (healthCheckPassed) {
        this.status = 'running';
        this.startTime = Date.now();

        // Persist successful port
        await this.saveLastSuccessfulPort(this.config.port);

        log.info('[WebService] Service started successfully on port:', this.config.port);
        this.emitPhase(StartupPhase.Running, 'Service is running');
        log.info('[WebService] Started successfully, PID:', this.process.pid);
        return true;
      } else {
        log.error('[WebService] Health check failed');
        this.emitPhase(StartupPhase.Error, 'Health check failed');
        await this.stop();
        this.status = 'error';
        return false;
      }
    } catch (error) {
      log.error('[WebService] Failed to start:', error);
      this.status = 'error';
      this.process = null;
      this.emitPhase(StartupPhase.Error, `Start failed: ${(error as Error).message}`);
      return false;
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
      log.error('[WebService] Process error:', error.message);
      this.status = 'error';
      this.process = null;
    });

    this.process.on('exit', (code, signal) => {
      log.info('[WebService] Process exited, code:', code, 'signal:', signal);

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
      this.startTime = null;
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
  async restart(): Promise<boolean> {
    log.info('[WebService] Restarting web service...');

    const stopped = await this.stop();
    if (!stopped) {
      log.error('[WebService] Failed to stop for restart');
      return false;
    }

    // Wait a bit before starting again
    await new Promise(resolve => setTimeout(resolve, 2000));

    return await this.start();
  }

  /**
   * Get current process status
   */
  async getStatus(): Promise<ProcessInfo> {
    const uptime = this.startTime ? Date.now() - this.startTime : 0;

    return {
      status: this.status,
      pid: this.process?.pid || null,
      uptime,
      startTime: this.startTime,
      url: this.status === 'running' ? `http://${this.config.host}:${this.config.port}` : null,
      restartCount: this.restartCount,
      phase: this.currentPhase,
      port: this.config.port,
    };
  }

  /**
   * Get the web service version
   */
  async getVersion(): Promise<string> {
    try {
      const installedPath = path.join(this.userDataPath, 'pcode-web', 'installed');
      const metaPath = path.join(this.userDataPath, 'pcode-web', 'meta.json');

      // Try reading from meta.json first
      try {
        const metaContent = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaContent);
        if (meta.version) {
          return meta.version;
        }
      } catch {
        // meta.json doesn't exist, try other methods
      }

      // Try reading from appsettings.yml
      const platform = process.platform;
      let configPath: string;

      switch (platform) {
        case 'win32':
          configPath = path.join(installedPath, 'win-x64', 'config', 'appsettings.yml');
          break;
        case 'darwin':
          configPath = path.join(installedPath, 'osx-x64', 'config', 'appsettings.yml');
          break;
        case 'linux':
          configPath = path.join(installedPath, 'linux-x64', 'config', 'appsettings.yml');
          break;
        default:
          return 'unknown';
      }

      const yaml = await import('js-yaml');
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = yaml.load(configContent) as any;

      if (config?.ApplicationVersion) {
        return config.ApplicationVersion;
      }

      // Try version.txt as fallback
      const versionPath = path.join(path.dirname(configPath), 'version.txt');
      const versionContent = await fs.readFile(versionPath, 'utf-8');
      return versionContent.trim();
    } catch (error) {
      log.error('[WebService] Failed to read version:', error);
      return 'unknown';
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(config: Partial<WebServiceConfig>): Promise<void> {
    const oldPort = this.config.port;
    const oldHost = this.config.host;

    this.config = { ...this.config, ...config };

    // Sync to file if host or port changed
    if ((config.port && config.port !== oldPort) ||
        (config.host && config.host !== oldHost)) {
      try {
        await this.syncConfigToFile();
      } catch (error) {
        log.error('[WebService] Config sync failed, continuing with in-memory config');
        // Don't throw - allow in-memory config to work
      }
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
   */
  private getConfigFilePath(): string {
    const installedPath = path.join(this.userDataPath, 'pcode-web', 'installed');
    const platform = process.platform;

    switch (platform) {
      case 'win32':
        return path.join(installedPath, 'win-x64', 'config', 'appsettings.yml');
      case 'darwin':
        return path.join(installedPath, 'osx-x64', 'config', 'appsettings.yml');
      case 'linux':
        return path.join(installedPath, 'linux-x64', 'config', 'appsettings.yml');
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Load saved port from config file
   */
  private async loadSavedPort(): Promise<number | null> {
    const configDir = path.join(this.userDataPath, 'config');
    const configPath = path.join(configDir, 'web-service.json');

    try {
      // Ensure config directory exists
      await fs.mkdir(configDir, { recursive: true });

      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      return config.lastSuccessfulPort || null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.error('[WebService] Error loading saved port:', error);
      } else {
        log.info('[WebService] No saved port configuration found');
      }
      return null;
    }
  }

  /**
   * Save last successful port to config file
   */
  private async saveLastSuccessfulPort(port: number): Promise<void> {
    const configDir = path.join(this.userDataPath, 'config');
    const configPath = path.join(configDir, 'web-service.json');

    try {
      // Ensure config directory exists
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        lastSuccessfulPort: port,
        savedAt: new Date().toISOString()
      };
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
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
    const legacyPath = path.join(this.userDataPath, 'web-service-config.json');
    const newDir = path.join(this.userDataPath, 'config');
    const newPath = path.join(newDir, 'web-service.json');

    try {
      // Check if legacy config exists
      await fs.access(legacyPath);

      log.info('[WebService] Migrating config from legacy location');
      const content = await fs.readFile(legacyPath, 'utf-8');

      // Ensure new config directory exists
      await fs.mkdir(newDir, { recursive: true });

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
        // Check if saved port is available
        const available = await this.checkPortAvailable();
        if (available) {
          log.info('[WebService] Using saved port:', savedPort);
          this.config.port = savedPort;
        } else {
          log.warn('[WebService] Saved port unavailable, using default:', this.config.port);
        }
      }
    } catch (error) {
      log.error('[WebService] Failed to load saved port:', error);
    }
  }

  /**
   * Sync configuration to file
   */
  private async syncConfigToFile(): Promise<void> {
    try {
      const configPath = this.getConfigFilePath();
      const yaml = await import('js-yaml');

      log.info('[WebService] Syncing config to file:', configPath);
      log.info('[WebService] New config will be:', `http://${this.config.host}:${this.config.port}`);

      // Read existing config
      const content = await fs.readFile(configPath, 'utf-8');
      const config = yaml.load(content) as any;

      log.info('[WebService] Current config URLs:', config.Urls);

      // Update URLs
      config.Urls = `http://${this.config.host}:${this.config.port}`;

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
