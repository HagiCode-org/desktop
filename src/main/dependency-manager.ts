import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { RegionDetector } from './region-detector.js';
import { ParsedDependency, DependencyTypeName, type Manifest, type Region, type ParsedInstallCommand, type NpmPackageInfo } from './manifest-reader.js';
import Store from 'electron-store';
import log from 'electron-log';

const execAsync = promisify(exec);

/**
 * Dependency type enumeration
 */
export enum DependencyType {
  DotNetRuntime = 'dotnet-runtime',
  NodeJs = 'nodejs',
  JavaRuntime = 'java-runtime',
  ClaudeCode = 'claude-code',
  OpenSpec = 'openspec',
}

/**
 * Result of a dependency check
 */
export interface DependencyCheckResult {
  key: string;  // Manifest dependency key (e.g., "dotnet", "claudeCode")
  name: string;
  type: DependencyType;
  installed: boolean;
  version?: string;
  requiredVersion?: string;
  versionMismatch?: boolean;
  installCommand?: string | Record<string, unknown>; // Support both string and object formats
  checkCommand?: string; // Command to verify installation
  downloadUrl?: string;
  description?: string;
}

/**
 * DependencyManager handles detection and installation of system dependencies
 */
export class DependencyManager {
  private platform: NodeJS.Platform;
  private regionDetector: RegionDetector;
  private currentManifest: Manifest | null = null;

  constructor(store?: Store<Record<string, unknown>>) {
    this.platform = process.platform;
    // Initialize RegionDetector if store is provided
    if (store) {
      this.regionDetector = new RegionDetector(store);
    } else {
      // Create a temporary store for RegionDetector
      this.regionDetector = new RegionDetector(new Store());
    }
  }

  /**
   * Set the current manifest for dependency operations
   * @param manifest - The manifest object
   */
  setManifest(manifest: Manifest | null): void {
    this.currentManifest = manifest;
    log.info('[DependencyManager] Manifest set:', manifest?.package.name, manifest?.package.version);
  }

  /**
   * Get the current manifest
   * @returns The current manifest or null
   */
  getManifest(): Manifest | null {
    return this.currentManifest;
  }

  /**
   * Check all dependencies from manifest
   */
  async checkAllDependencies(): Promise<DependencyCheckResult[]> {
    // If manifest is available, use it
    if (this.currentManifest) {
      const { manifestReader } = await import('./manifest-reader.js');
      const dependencies = manifestReader.parseDependencies(this.currentManifest);
      return this.checkFromManifest(dependencies);
    }

    // No manifest available, return empty result
    log.warn('[DependencyManager] No manifest available, cannot check dependencies');
    return [];
  }

  /**
   * Check dependencies from parsed manifest
   * @param dependencies - Parsed dependencies from manifest
   * @returns Array of dependency check results
   */
  async checkFromManifest(dependencies: ParsedDependency[]): Promise<DependencyCheckResult[]> {
    const results: DependencyCheckResult[] = [];

    for (const dep of dependencies) {
      try {
        const result = await this.checkSingleDependency(dep);
        results.push(result);
      } catch (error) {
        console.error(`[DependencyManager] Failed to check dependency ${dep.name}:`, error);
        // Add failed check result
        results.push({
          key: dep.key,
          name: dep.name,
          type: this.mapDependencyType(dep.key, dep.type),
          installed: false,
          description: dep.description,
        });
      }
    }

    return results;
  }

  /**
   * Check a single dependency from manifest
   * @param dep - Parsed dependency
   * @returns Dependency check result
   */
  private async checkSingleDependency(dep: ParsedDependency): Promise<DependencyCheckResult> {
    const result: DependencyCheckResult = {
      key: dep.key,
      name: dep.name,
      type: this.mapDependencyType(dep.key, dep.type),
      installed: false,
      requiredVersion: this.formatRequiredVersion(dep.versionConstraints),
      description: dep.description,
      installCommand: dep.installCommand as any,
      checkCommand: dep.checkCommand, // Add check command
      downloadUrl: dep.installHint,
    };

    try {
      // Execute check command
      const { stdout } = await execAsync(dep.checkCommand, { timeout: 10000 });

      // Parse version from output
      const versionMatch = stdout.match(/(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/);
      const installedVersion = versionMatch ? versionMatch[1] : 'installed';

      result.installed = true;
      result.version = installedVersion;

      // Check version constraints
      result.versionMismatch = !this.checkVersionConstraints(
        installedVersion,
        dep.versionConstraints
      );

      console.log(`[DependencyManager] ${dep.name}: installed=${result.installed}, version=${installedVersion}, mismatch=${result.versionMismatch}`);
    } catch (error) {
      // Command not found or failed
      console.log(`[DependencyManager] ${dep.name}: not installed (check failed)`);
      result.installed = false;
    }

    return result;
  }

  /**
   * Check if installed version satisfies version constraints
   * @param installedVersion - The installed version string
   * @param constraints - Version constraints from manifest
   * @returns true if version satisfies constraints
   */
  private checkVersionConstraints(installedVersion: string, constraints: ParsedDependency['versionConstraints']): boolean {
    // If exact version is required, check exact match
    if (constraints.exact) {
      return this.isExactVersionMatch(installedVersion, constraints.exact);
    }

    // Check min version
    if (constraints.min && !this.isVersionSatisfied(installedVersion, constraints.min)) {
      return false;
    }

    // Check max version
    if (constraints.max && !this.isMaxVersionSatisfied(installedVersion, constraints.max)) {
      return false;
    }

    // For dotnet runtime-specific check
    if (constraints.runtime?.min) {
      // Handle special case like "10.0.0+" - check if at least this version
      if (!this.isVersionSatisfied(installedVersion, constraints.runtime.min)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check exact version match (including pre-release tags)
   * @param installed - Installed version
   * @param required - Required exact version
   * @returns true if exact match
   */
  private isExactVersionMatch(installed: string, required: string): boolean {
    // Remove 'v' prefix if present
    const cleanInstalled = installed.replace(/^v/, '');
    const cleanRequired = required.replace(/^v/, '');

    // Direct string comparison for exact match
    return cleanInstalled === cleanRequired;
  }

  /**
   * Check if installed version is less than or equal to max version
   * @param installedVersion - Installed version
   * @param maxVersion - Maximum allowed version
   * @returns true if installed <= max
   */
  private isMaxVersionSatisfied(installedVersion: string, maxVersion: string): boolean {
    const parseVersion = (v: string) => {
      // Handle pre-release versions (e.g., "0.1.0-alpha.9")
      const parts = v.split('-')[0].split('.').map(Number);
      return parts;
    };

    const installed = parseVersion(installedVersion);
    const max = parseVersion(maxVersion);

    for (let i = 0; i < Math.max(installed.length, max.length); i++) {
      const ins = installed[i] || 0;
      const mx = max[i] || 0;

      if (ins < mx) return true;
      if (ins > mx) return false;
    }

    return true; // Equal versions
  }

  /**
   * Format version constraints for display
   * @param constraints - Version constraints
   * @returns Formatted version requirement string
   */
  private formatRequiredVersion(constraints: ParsedDependency['versionConstraints']): string {
    if (constraints.exact) {
      return `exactly ${constraints.exact}`;
    }

    const parts: string[] = [];
    if (constraints.min) parts.push(`${constraints.min}+`);
    if (constraints.max) parts.push(`<= ${constraints.max}`);
    if (constraints.recommended) parts.push(`recommended: ${constraints.recommended}`);

    if (parts.length === 0) return 'any';
    return parts.join(', ');
  }

  /**
   * Map manifest dependency key and type to DependencyType enum
   * @param key - Dependency key from manifest
   * @param type - Dependency type from manifest
   * @returns Mapped DependencyType enum value
   */
  private mapDependencyType(key: string, type: DependencyTypeName): DependencyType {
    // Map based on key for known dependencies
    const keyMapping: Record<string, DependencyType> = {
      'claudeCode': DependencyType.ClaudeCode,
      'openspec': DependencyType.OpenSpec,
      'dotnet': DependencyType.DotNetRuntime,
      'node': DependencyType.NodeJs,
      'npm': DependencyType.NodeJs, // Treat npm as Node.js dependency
    };

    if (keyMapping[key]) {
      return keyMapping[key];
    }

    // Fallback based on type
    switch (type) {
      case 'npm':
        return DependencyType.ClaudeCode; // Default npm package type
      case 'system-runtime':
        if (key.includes('dotnet') || key.includes('.net')) {
          return DependencyType.DotNetRuntime;
        }
        return DependencyType.NodeJs;
      default:
        return DependencyType.ClaudeCode; // Default fallback
    }
  }

  /**
   * Compare versions to check if current version satisfies required version
   */
  private isVersionSatisfied(currentVersion: string, requiredVersion: string): boolean {
    const parseVersion = (v: string) => {
      return v.split('.').map(Number);
    };

    const current = parseVersion(currentVersion);
    const required = parseVersion(requiredVersion);

    for (let i = 0; i < Math.max(current.length, required.length); i++) {
      const c = current[i] || 0;
      const r = required[i] || 0;

      if (c > r) return true;
      if (c < r) return false;
    }

    return true;
  }

  /**
   * Install dependencies from manifest
   * @param manifest - Parsed manifest object
   * @param dependencies - List of dependencies to install (optional, will check all if not provided)
   * @param onProgress - Progress callback
   * @returns Installation result
   */
  async installFromManifest(
    manifest: Manifest,
    dependencies?: ParsedDependency[],
    onProgress?: (progress: {
      current: number;
      total: number;
      dependency: string;
      status: 'installing' | 'success' | 'error';
    }) => void,
  ): Promise<{
    success: string[];
    failed: Array<{ dependency: string; error: string }>;
  }> {
    // Update manifest in DependencyManager
    this.setManifest(manifest);

    const results = {
      success: [] as string[],
      failed: [] as Array<{ dependency: string; error: string }>,
    };

    // If dependencies not provided, parse from manifest
    const depsToCheck = dependencies || [];
    const missingDeps: Array<ParsedDependency & { parsedInstallCommand: ParsedInstallCommand }> = [];

    // Get parsed install commands for all dependencies
    const { manifestReader } = await import('./manifest-reader.js');
    const region = manifestReader.detectRegion();

    for (const dep of depsToCheck) {
      const parsed = manifestReader.parseInstallCommand(dep.installCommand, region);
      // Check if dependency needs installation (assume all passed deps need to be installed)
      // since ParsedDependency doesn't have installed status
      missingDeps.push({ ...dep, parsedInstallCommand: parsed } as any);
    }

    log.info('[DependencyManager] Installing', missingDeps.length, 'missing dependencies from manifest');

    for (let i = 0; i < missingDeps.length; i++) {
      const dep = missingDeps[i];

      onProgress?.({
        current: i + 1,
        total: missingDeps.length,
        dependency: dep.name,
        status: 'installing',
      });

      try {
        await this.installSingleDependency(dep, dep.parsedInstallCommand);
        results.success.push(dep.name);

        onProgress?.({
          current: i + 1,
          total: missingDeps.length,
          dependency: dep.name,
          status: 'success',
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.failed.push({
          dependency: dep.name,
          error: errorMsg,
        });

        log.error(`[DependencyManager] Failed to install ${dep.name}:`, error);

        onProgress?.({
          current: i + 1,
          total: missingDeps.length,
          dependency: dep.name,
          status: 'error',
        });
      }
    }

    return results;
  }

  /**
   * Install a single dependency using parsed install command
   * @param dep - Parsed dependency
   * @param parsedCommand - Parsed install command
   * @returns Installation success
   */
  async installSingleDependency(
    dep: ParsedDependency,
    parsedCommand?: ParsedInstallCommand
  ): Promise<boolean> {
    const { manifestReader } = await import('./manifest-reader.js');
    const region = manifestReader.detectRegion();
    const command = parsedCommand || manifestReader.parseInstallCommand(dep.installCommand, region);

    if (!dep.installCommand) {
      throw new Error(`No install command for ${dep.name}`);
    }

    // Check if command is available
    if (command.type === 'not-available' || !command.command) {
      throw new Error(`No auto-install command available for ${dep.name}. Please install manually.`);
    }

    // Execute the install command directly from manifest
    // The manifest command already contains the correct mirror/source configuration
    return await this.executeSystemCommand(command.command);
  }

  /**
   * Execute system command for dependency installation
   * @param command - Command to execute
   * @returns Execution success
   */
  private async executeSystemCommand(command: string): Promise<boolean> {
    try {
      log.info(`[DependencyManager] Executing system command: ${command}`);

      await execAsync(command, {
        timeout: 300000, // 5 minute timeout
      });

      log.info(`[DependencyManager] System command completed successfully`);
      return true;
    } catch (error) {
      log.error(`[DependencyManager] System command failed:`, error);
      throw error;
    }
  }

  /**
   * Execute commands with progress reporting
   * @param commands - Array of commands to execute
   * @param workingDirectory - Working directory for command execution
   * @param onProgress - Progress callback
   * @returns Execution result
   */
  async executeCommandsWithProgress(
    commands: string[],
    workingDirectory: string,
    onProgress?: (progress: {
      type: 'command-start' | 'command-output' | 'command-error' | 'command-complete' | 'install-complete' | 'install-error';
      commandIndex: number;
      totalCommands: number;
      output?: string;
      error?: string;
    }) => void
  ): Promise<{ success: boolean; error?: string }> {
    log.info(`[DependencyManager] Executing ${commands.length} commands with progress reporting`);

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];

      onProgress?.({
        type: 'command-start',
        commandIndex: i,
        totalCommands: commands.length,
      });

      try {
        const success = await this.executeCommandWithRealTimeOutput(
          command,
          workingDirectory,
          (output, isError) => {
            onProgress?.({
              type: isError ? 'command-error' : 'command-output',
              commandIndex: i,
              totalCommands: commands.length,
              output: isError ? undefined : output,
              error: isError ? output : undefined,
            });
          }
        );

        if (!success) {
          const error = `Command ${i + 1}/${commands.length} failed: ${command}`;
          log.error(`[DependencyManager] ${error}`);

          onProgress?.({
            type: 'install-error',
            commandIndex: i,
            totalCommands: commands.length,
            error,
          });

          return { success: false, error };
        }

        onProgress?.({
          type: 'command-complete',
          commandIndex: i,
          totalCommands: commands.length,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error(`[DependencyManager] Command ${i + 1} failed:`, error);

        onProgress?.({
          type: 'install-error',
          commandIndex: i,
          totalCommands: commands.length,
          error: errorMsg,
        });

        return { success: false, error: errorMsg };
      }
    }

    onProgress?.({
      type: 'install-complete',
      commandIndex: commands.length - 1,
      totalCommands: commands.length,
    });

    log.info(`[DependencyManager] All ${commands.length} commands completed successfully`);
    return { success: true };
  }

  /**
   * Execute a single command with real-time output
   * @param command - Command string to execute
   * @param workingDirectory - Working directory
   * @param onOutput - Output callback (output: string, isError: boolean)
   * @returns Execution success
   */
  private async executeCommandWithRealTimeOutput(
    command: string,
    workingDirectory: string,
    onOutput?: (output: string, isError: boolean) => void
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      log.info(`[DependencyManager] Spawning command: ${command}`);

      const childProcess = spawn(command, {
        cwd: workingDirectory,
        shell: true, // Use shell to support command chaining
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0' }, // Disable ANSI colors
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';

      // Handle stdout - send line by line
      childProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        stdoutBuffer += output;
        onOutput?.(output, false);
        log.verbose(`[DependencyManager] stdout: ${output.trim()}`);
      });

      // Handle stderr - send line by line (npm uses stderr for progress)
      childProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        stderrBuffer += output;
        // For npm, stderr contains actual output info, not just errors
        onOutput?.(output, false); // Treat as info, not error
        log.verbose(`[DependencyManager] stderr: ${output.trim()}`);
      });

      // Handle process completion
      childProcess.on('close', (code) => {
        if (code === 0) {
          log.info(`[DependencyManager] Command completed successfully`);
          resolve(true);
        } else {
          log.error(`[DependencyManager] Command failed with exit code ${code}`);
          reject(new Error(`Command failed with exit code ${code}`));
        }
      });

      // Handle process error
      childProcess.on('error', (error) => {
        log.error(`[DependencyManager] Process error:`, error);
        reject(error);
      });

      // Set timeout (5 minutes)
      const timeout = setTimeout(() => {
        childProcess.kill();
        reject(new Error('Command execution timeout'));
      }, 300000);

      childProcess.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }
}
