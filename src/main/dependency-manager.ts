import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { RegionDetector } from './region-detector.js';
import { ParsedDependency, DependencyTypeName, type Manifest, type NpmPackageInfo, type EntryPoint, type ResultSessionFile, type ParsedResult, type InstallResult, type StartResult } from './manifest-reader.js';
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
  isChecking?: boolean;  // True while check is in progress
}

/**
 * DependencyManager handles detection and installation of system dependencies
 */
export class DependencyManager {
  private platform: NodeJS.Platform;
  private regionDetector: RegionDetector;
  private currentManifest: Manifest | null = null;
  private workingDirectory: string | null = null;

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
   * Set working directory for script execution
   * @param directory - Working directory path
   */
  setWorkingDirectory(directory: string): void {
    this.workingDirectory = directory;
    log.info('[DependencyManager] Working directory set to:', directory);
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
   * Read result.json file from working directory
   * Supports multiple result file names and formats for backward compatibility
   * @param workingDirectory - Directory containing result file
   * @returns Parsed ResultSessionFile or null if not found
   */
  private async readResultFile(workingDirectory: string): Promise<ResultSessionFile | null> {
    // List of possible result file names (in order of preference)
    const resultFileNames = ['result.json', 'check-result.json', 'install-result.json'];

    for (const fileName of resultFileNames) {
      const resultPath = path.join(workingDirectory, fileName);

      try {
        log.info('[DependencyManager] Reading result file:', resultPath);
        const content = await fs.readFile(resultPath, 'utf-8');
        const rawData = JSON.parse(content);

        // Convert to ResultSessionFile format
        const result = this.normalizeResultFile(rawData, fileName);
        log.info('[DependencyManager] Result file read successfully from:', fileName, 'success:', result.success);
        return result;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          // File doesn't exist, try next file name
          continue;
        } else {
          log.error('[DependencyManager] Failed to read', fileName, ':', error);
        }
      }
    }

    // No result file found
    log.warn('[DependencyManager] No result file found in:', workingDirectory);
    return null;
  }

  /**
   * Normalize result file data to ResultSessionFile format
   * Handles different result file formats (result.json vs check-result.json)
   * @param rawData - Raw JSON data from result file
   * @param fileName - Source file name
   * @returns Normalized ResultSessionFile
   */
  private normalizeResultFile(rawData: any, fileName: string): ResultSessionFile {
    // Check if already in ResultSessionFile format
    if ('exitCode' in rawData && 'success' in rawData && typeof rawData.success === 'boolean') {
      return rawData as ResultSessionFile;
    }

    // Handle check-result.json format (dependency check results)
    if (fileName === 'check-result.json' && 'summary' in rawData) {
      const summary = rawData.summary || {};
      const success = summary.ready === true;

      return {
        exitCode: success ? 0 : 1,
        stdout: JSON.stringify(rawData, null, 2),
        stderr: '',
        duration: 0,
        timestamp: rawData.timestamp || new Date().toISOString(),
        success,
        version: undefined, // No single version in check-result
        errorMessage: success ? undefined : 'Some dependencies are not installed',
      };
    }

    // Handle install-result.json format
    if (fileName === 'install-result.json') {
      const success = rawData.success === true;
      return {
        exitCode: success ? 0 : 1,
        stdout: rawData.stdout || '',
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
   * Execute entryPoint script and wait for result.json generation
   * @param scriptPath - Full path to the script to execute
   * @param workingDirectory - Directory where script should be executed
   * @param onOutput - Optional callback for real-time output (stdout/stderr)
   * @returns ResultSessionFile from generated result.json
   */
  private async executeEntryPointScript(
    scriptPath: string,
    workingDirectory: string,
    onOutput?: (type: 'stdout' | 'stderr', data: string) => void
  ): Promise<ResultSessionFile> {
    log.info('[DependencyManager] Executing entryPoint script:', scriptPath);
    log.info('[DependencyManager] Working directory:', workingDirectory);

    // Ensure script has execute permissions on Unix
    if (this.platform !== 'win32') {
      try {
        await fs.chmod(scriptPath, 0o755);
      } catch (error) {
        log.warn('[DependencyManager] Failed to set execute permissions:', error);
      }
    }

    // Execute script using bash explicitly to handle path with spaces
    // Use '/bin/bash' on Unix and 'cmd.exe' on Windows
    const shell = this.platform === 'win32' ? true : '/bin/bash';
    const command = this.platform === 'win32'
      ? `"${scriptPath}"`
      : `"${scriptPath}"`;

    // Execute script with output capture
    return new Promise((resolve, reject) => {
      const child = spawn(command, [], {
        cwd: workingDirectory,
        shell: shell,
        stdio: ['pipe', 'pipe', 'pipe'], // Capture stdin, stdout, stderr
        detached: this.platform === 'win32',
      });

      let timeout: NodeJS.Timeout | null = null;
      let stdoutBuffer = '';
      let stderrBuffer = '';

      // Set timeout (5 minutes)
      timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Script execution timeout'));
      }, 300000);

      // Capture stdout in real-time
      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdoutBuffer += chunk;

        // Log to console
        log.info('[DependencyManager] STDOUT:', chunk.trim());

        // Send to callback if provided
        if (onOutput) {
          onOutput('stdout', chunk);
        }
      });

      // Capture stderr in real-time
      child.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderrBuffer += chunk;

        // Log to console
        log.error('[DependencyManager] STDERR:', chunk.trim());

        // Send to callback if provided
        if (onOutput) {
          onOutput('stderr', chunk);
        }
      });

      child.on('exit', async (code) => {
        if (timeout) clearTimeout(timeout);

        log.info('[DependencyManager] Script exited with code:', code);

        // Wait a bit for result.json to be written
        await new Promise(resolve => setTimeout(resolve, 500));

        // Read result.json
        const result = await this.readResultFile(workingDirectory);

        if (result) {
          // Merge captured output with result
          result.stdout = stdoutBuffer || result.stdout;
          result.stderr = stderrBuffer || result.stderr;
          resolve(result);
        } else {
          // Fallback: create a result from captured output
          resolve({
            exitCode: code ?? -1,
            stdout: stdoutBuffer,
            stderr: stderrBuffer || 'result.json not found',
            duration: 0,
            timestamp: new Date().toISOString(),
            success: code === 0,
            errorMessage: code !== 0 ? `Script exited with code ${code}` : undefined,
          });
        }
      });

      child.on('error', async (error) => {
        if (timeout) clearTimeout(timeout);

        log.error('[DependencyManager] Script execution error:', error);

        // Send error to callback if provided
        if (onOutput) {
          onOutput('stderr', `Error: ${error.message}`);
        }

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
   * Check all dependencies from manifest
   */
  async checkAllDependencies(): Promise<DependencyCheckResult[]> {
    // If manifest is available, use it
    if (this.currentManifest) {
      const { manifestReader } = await import('./manifest-reader.js');
      const dependencies = manifestReader.parseDependencies(this.currentManifest);
      const entryPoint = manifestReader.parseEntryPoint(this.currentManifest);
      return this.checkFromManifest(dependencies, entryPoint);
    }

    // No manifest available, return empty result
    log.warn('[DependencyManager] No manifest available, cannot check dependencies');
    return [];
  }

  /**
   * Check dependencies from parsed manifest
   * Executes the check script ONCE and parses results for all dependencies
   * @param dependencies - Parsed dependencies from manifest
   * @param entryPoint - EntryPoint object from manifest
   * @param onOutput - Optional callback for real-time output
   * @returns Array of dependency check results
   */
  async checkFromManifest(
    dependencies: ParsedDependency[],
    entryPoint: EntryPoint | null,
    onOutput?: (type: 'stdout' | 'stderr', data: string, dependencyName?: string) => void
  ): Promise<DependencyCheckResult[]> {
    log.info('[DependencyManager] Checking all dependencies from manifest');

    // If no entryPoint or working directory, return all as not installed
    if (!entryPoint || !this.workingDirectory) {
      log.warn('[DependencyManager] No entryPoint or working directory available for check');
      return dependencies.map(dep => ({
        key: dep.key,
        name: dep.name,
        type: this.mapDependencyType(dep.key, dep.type),
        installed: false,
        requiredVersion: this.formatRequiredVersion(dep.versionConstraints),
        description: dep.description,
        downloadUrl: dep.installHint,
      }));
    }

    try {
      // Resolve check script path
      const { manifestReader } = await import('./manifest-reader.js');
      const scriptPath = manifestReader.resolveScriptPath(entryPoint.check, this.workingDirectory);

      log.info('[DependencyManager] Executing check script:', scriptPath);

      // Execute check script ONCE for all dependencies
      const resultSession = await this.executeEntryPointScript(scriptPath, this.workingDirectory, (type, data) => {
        onOutput?.(type, data);
      });

      // Read check-result.json to get individual dependency status
      const checkResultPath = path.join(this.workingDirectory, 'check-result.json');
      let checkResultData: any = null;

      try {
        const content = await fs.readFile(checkResultPath, 'utf-8');
        checkResultData = JSON.parse(content);
        log.info('[DependencyManager] Read check-result.json with dependencies:', Object.keys(checkResultData.dependencies || {}));
      } catch (error) {
        log.warn('[DependencyManager] Could not read check-result.json, using fallback');
      }

      // Map results for each dependency
      return dependencies.map(dep => {
        const result: DependencyCheckResult = {
          key: dep.key,
          name: dep.name,
          type: this.mapDependencyType(dep.key, dep.type),
          installed: false,
          requiredVersion: this.formatRequiredVersion(dep.versionConstraints),
          description: dep.description,
          downloadUrl: dep.installHint,
        };

        // Look up this dependency in check-result.json
        if (checkResultData?.dependencies) {
          // Try different key formats (dotnet, dotnet-runtime, claudeCode, claude-code, etc.)
          const possibleKeys = [
            dep.key,
            dep.key.replace(/([A-Z])/g, '-$1').toLowerCase(), // camelCase to kebab-case
            dep.key.replace(/-/g, ''), // kebab-case to camelCase
          ];

          let depData = null;
          for (const key of possibleKeys) {
            if (checkResultData.dependencies[key]) {
              depData = checkResultData.dependencies[key];
              log.info(`[DependencyManager] Found dependency ${dep.name} with key ${key}:`, depData.status);
              break;
            }
          }

          if (depData) {
            result.installed = depData.status === 'installed';
            result.version = depData.version;

            // Check version constraints if version detected
            if (depData.version) {
              result.versionMismatch = !this.checkVersionConstraints(
                depData.version,
                dep.versionConstraints
              );
            }

            log.info(`[DependencyManager] ${dep.name}: installed=${result.installed}, version=${result.version}, mismatch=${result.versionMismatch}`);
          } else {
            log.warn(`[DependencyManager] Dependency ${dep.name} not found in check-result.json`);
          }
        }

        return result;
      });
    } catch (error) {
      log.error('[DependencyManager] Failed to check dependencies:', error);

      // Return all as not installed on error
      return dependencies.map(dep => ({
        key: dep.key,
        name: dep.name,
        type: this.mapDependencyType(dep.key, dep.type),
        installed: false,
        requiredVersion: this.formatRequiredVersion(dep.versionConstraints),
        description: dep.description,
        downloadUrl: dep.installHint,
      }));
    }
  }

  /**
   * Check a single dependency from manifest
   * @param dep - Parsed dependency
   * @param entryPoint - EntryPoint object from manifest
   * @param onOutput - Optional callback for real-time output
   * @returns Dependency check result
   */
  private async checkSingleDependency(
    dep: ParsedDependency,
    entryPoint: EntryPoint | null,
    onOutput?: (type: 'stdout' | 'stderr', data: string) => void
  ): Promise<DependencyCheckResult> {
    const result: DependencyCheckResult = {
      key: dep.key,
      name: dep.name,
      type: this.mapDependencyType(dep.key, dep.type),
      installed: false,
      requiredVersion: this.formatRequiredVersion(dep.versionConstraints),
      description: dep.description,
      downloadUrl: dep.installHint,
    };

    // If no entryPoint available, skip check
    if (!entryPoint || !this.workingDirectory) {
      log.warn('[DependencyManager] No entryPoint or working directory available for check');
      return result;
    }

    try {
      // Resolve check script path
      const { manifestReader } = await import('./manifest-reader.js');
      const scriptPath = manifestReader.resolveScriptPath(entryPoint.check, this.workingDirectory);

      log.info('[DependencyManager] Checking dependency using script:', scriptPath);

      // Execute check script with real-time output
      const resultSession = await this.executeEntryPointScript(scriptPath, this.workingDirectory, onOutput);
      const parsedResult = this.parseResultSession(resultSession);

      // Update result based on result.json
      result.installed = parsedResult.success;
      result.version = parsedResult.version;

      // Check version constraints if version detected
      if (parsedResult.version) {
        result.versionMismatch = !this.checkVersionConstraints(
          parsedResult.version,
          dep.versionConstraints
        );
      }

      console.log(`[DependencyManager] ${dep.name}: installed=${result.installed}, version=${parsedResult.version}, mismatch=${result.versionMismatch}`);
    } catch (error) {
      // Script not found or failed
      console.log(`[DependencyManager] ${dep.name}: not installed (check failed)`, error);
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
      // Remove 'v' prefix if present
      const cleanVersion = v.replace(/^v/, '');
      // Handle pre-release versions (e.g., "0.1.0-alpha.9")
      const parts = cleanVersion.split('-')[0].split('.').map(Number);
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
      // Remove 'v' prefix if present (e.g., "v24.12.0" -> "24.12.0")
      const cleanVersion = v.replace(/^v/, '');
      return cleanVersion.split('.').map(Number);
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

    // Get entryPoint for script execution
    const { manifestReader } = await import('./manifest-reader.js');
    const entryPoint = manifestReader.parseEntryPoint(manifest);

    log.info('[DependencyManager] Installing', depsToCheck.length, 'dependencies from manifest');

    for (let i = 0; i < depsToCheck.length; i++) {
      const dep = depsToCheck[i];

      onProgress?.({
        current: i + 1,
        total: depsToCheck.length,
        dependency: dep.name,
        status: 'installing',
      });

      try {
        const installResult = await this.installSingleDependency(dep, entryPoint);

        if (installResult.success) {
          results.success.push(dep.name);

          onProgress?.({
            current: i + 1,
            total: depsToCheck.length,
            dependency: dep.name,
            status: 'success',
          });
        } else {
          // Installation failed
          const errorMsg = installResult.parsedResult.errorMessage || 'Installation failed';
          results.failed.push({
            dependency: dep.name,
            error: errorMsg,
          });

          log.error(`[DependencyManager] Failed to install ${dep.name}:`, errorMsg);

          onProgress?.({
            current: i + 1,
            total: depsToCheck.length,
            dependency: dep.name,
            status: 'error',
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.failed.push({
          dependency: dep.name,
          error: errorMsg,
        });

        log.error(`[DependencyManager] Failed to install ${dep.name}:`, error);

        onProgress?.({
          current: i + 1,
          total: depsToCheck.length,
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
   * @param entryPoint - EntryPoint object from manifest
   * @param onOutput - Optional callback for real-time output
   * @returns Installation result
   */
  async installSingleDependency(
    dep: ParsedDependency,
    entryPoint: EntryPoint | null,
    onOutput?: (type: 'stdout' | 'stderr', data: string) => void
  ): Promise<InstallResult> {
    // If no entryPoint available, cannot install
    if (!entryPoint || !this.workingDirectory) {
      throw new Error(`No entryPoint or working directory available for ${dep.name}. Please install manually: ${dep.installHint || 'See documentation'}`);
    }

    try {
      // Resolve install script path
      const { manifestReader } = await import('./manifest-reader.js');
      const scriptPath = manifestReader.resolveScriptPath(entryPoint.install, this.workingDirectory);

      log.info('[DependencyManager] Installing dependency using script:', scriptPath);

      // Execute install script with real-time output
      const resultSession = await this.executeEntryPointScript(scriptPath, this.workingDirectory, onOutput);
      const parsedResult = this.parseResultSession(resultSession);

      // Build install result
      const installResult: InstallResult = {
        success: parsedResult.success,
        resultSession,
        parsedResult,
      };

      // Add install hint on failure
      if (!parsedResult.success) {
        installResult.installHint = dep.installHint;
      }

      return installResult;
    } catch (error) {
      log.error(`[DependencyManager] Failed to install ${dep.name}:`, error);

      // Return failed result with install hint
      return {
        success: false,
        resultSession: {
          exitCode: -1,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          duration: 0,
          timestamp: new Date().toISOString(),
          success: false,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        parsedResult: {
          success: false,
          errorMessage: error instanceof Error ? error.message : String(error),
          rawOutput: '',
        },
        installHint: dep.installHint,
      };
    }
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
