import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { NpmMirrorHelper } from './npm-mirror-helper.js';
import { ParsedDependency, DependencyTypeName, type Manifest, type Region, type ParsedInstallCommand } from './manifest-reader.js';
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
  downloadUrl?: string;
  description?: string;
}

/**
 * Platform-specific package manager commands
 */
const PACKAGE_MANAGER_COMMANDS: Record<string, {
  check: string;
  install: (pkg: string) => string;
}> = {
  win32: {
    check: 'winget --version',
    install: (pkg: string) => `winget install ${pkg}`,
  },
  darwin: {
    check: 'brew --version',
    install: (pkg: string) => `brew install ${pkg}`,
  },
  linux: {
    check: 'which apt || which dnf || which yum || which pacman',
    install: (pkg: string) => {
      // Try to detect the package manager and use appropriate command
      return `sudo apt install -y ${pkg} || sudo dnf install -y ${pkg} || sudo yum install -y ${pkg} || sudo pacman -S ${pkg}`;
    },
  },
};

/**
 * NPM package definitions
 */
interface NpmPackage {
  name: string;
  packageName: string;
  version?: string; // Specific version to install
  commandName: string; // Command name to check if installed
  description: string;
}

const NPM_PACKAGES: Record<string, NpmPackage> = {
  claude_code: {
    name: 'Claude Code',
    packageName: '@anthropic-ai/claude-code',
    commandName: 'claude',
    description: 'AI-powered development assistant',
  },
  openspec: {
    name: 'OpenSpec',
    packageName: '@fission-ai/openspec',
    version: '0.23.0',
    commandName: 'openspec',
    description: 'Specification-driven development framework',
  },
};

/**
 * DependencyManager handles detection and installation of system dependencies
 */
export class DependencyManager {
  private platform: NodeJS.Platform;
  private npmMirrorHelper: NpmMirrorHelper;

  constructor(store?: Store<Record<string, unknown>>) {
    this.platform = process.platform;
    // Initialize NpmMirrorHelper if store is provided
    if (store) {
      this.npmMirrorHelper = new NpmMirrorHelper(store);
    } else {
      // Create a temporary store for NpmMirrorHelper
      this.npmMirrorHelper = new NpmMirrorHelper(new Store());
    }
  }

  /**
   * Check all dependencies
   */
  async checkAllDependencies(): Promise<DependencyCheckResult[]> {
    const results: DependencyCheckResult[] = [];

    // Check .NET Runtime (currently the only supported dependency)
    const dotNetResult = await this.checkDotNetRuntime();
    results.push(dotNetResult);

    // Check NPM-based dependencies
    const claudeCodeResult = await this.checkNpmPackage('claude_code');
    results.push(claudeCodeResult);

    const openSpecResult = await this.checkNpmPackage('openspec');
    results.push(openSpecResult);

    return results;
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
   * Check .NET Runtime installation
   */
  async checkDotNetRuntime(): Promise<DependencyCheckResult> {
    const requiredVersion = '8.0.0';
    const result: DependencyCheckResult = {
      key: 'dotnet',
      name: '.NET Runtime (ASP.NET Core)',
      type: DependencyType.DotNetRuntime,
      installed: false,
      requiredVersion,
      downloadUrl: 'https://dotnet.microsoft.com/download/dotnet/8.0',
      description: 'Web service requires .NET 8.0 Runtime to run',
    };

    try {
      // Execute dotnet --list-runtimes to check installed runtimes
      const { stdout } = await execAsync('dotnet --list-runtimes');

      // Parse output to find ASP.NET Core runtime
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.includes('Microsoft.AspNetCore.App')) {
          const match = line.match(/Microsoft\.AspNetCore\.App\s+([\d.]+)/);
          if (match) {
            const version = match[1];
            result.installed = true;
            result.version = version;
            result.versionMismatch = !this.isVersionSatisfied(version, requiredVersion);

            // Set install command based on platform
            result.installCommand = this.getDotNetInstallCommand();
            break;
          }
        }
      }
    } catch (error) {
      // dotnet CLI not found or error executing
      console.log('[DependencyManager] .NET Runtime check failed:', error);
      result.installed = false;
      result.installCommand = this.getDotNetInstallCommand();
    }

    return result;
  }

  /**
   * Install a dependency using system package manager
   */
  async installDependency(dependencyType: DependencyType): Promise<boolean> {
    try {
      switch (dependencyType) {
        case DependencyType.DotNetRuntime:
          return await this.installDotNetRuntime();
        case DependencyType.ClaudeCode:
          return await this.installNpmPackage('claude_code');
        case DependencyType.OpenSpec:
          return await this.installNpmPackage('openspec');
        default:
          console.warn(`[DependencyManager] Unsupported dependency type: ${dependencyType}`);
          return false;
      }
    } catch (error) {
      console.error(`[DependencyManager] Failed to install ${dependencyType}:`, error);
      return false;
    }
  }

  /**
   * Install .NET Runtime using system package manager
   */
  private async installDotNetRuntime(): Promise<boolean> {
    const packageManager = PACKAGE_MANAGER_COMMANDS[this.platform];
    if (!packageManager) {
      console.warn(`[DependencyManager] Unsupported platform: ${this.platform}`);
      return false;
    }

    // Check if package manager is available
    try {
      await execAsync(packageManager.check);
    } catch {
      console.warn('[DependencyManager] Package manager not available');
      return false;
    }

    // Install .NET Runtime
    const installCommands = this.getDotNetInstallCommands();
    for (const command of installCommands) {
      try {
        await execAsync(command, { timeout: 300000 }); // 5 minute timeout
        // Verify installation
        const checkResult = await this.checkDotNetRuntime();
        if (checkResult.installed && !checkResult.versionMismatch) {
          return true;
        }
      } catch (error) {
        console.error('[DependencyManager] Install command failed:', command, error);
        // Try next command
        continue;
      }
    }

    return false;
  }

  /**
   * Get platform-specific install commands for .NET
   */
  private getDotNetInstallCommands(): string[] {
    switch (this.platform) {
      case 'win32':
        return [
          'winget install Microsoft.DotNet.Runtime.8',
          'winget install Microsoft.DotNet.SDK.8',
        ];
      case 'darwin':
        return [
          'brew install --cask dotnet-sdk',
        ];
      case 'linux':
        return [
          'sudo apt update && sudo apt install -y dotnet-sdk-8.0',
          'sudo dnf install -y dotnet-sdk-8.0',
          'sudo yum install -y dotnet-sdk-8.0',
        ];
      default:
        return [];
    }
  }

  /**
   * Get install command string for display purposes
   */
  private getDotNetInstallCommand(): string {
    switch (this.platform) {
      case 'win32':
        return 'winget install Microsoft.DotNet.Runtime.8';
      case 'darwin':
        return 'brew install --cask dotnet-sdk';
      case 'linux':
        return 'sudo apt install dotnet-sdk-8.0';
      default:
        return 'Visit download page';
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
   * Check if an NPM package is installed
   * Uses 'which' (Unix) or 'where' (Windows) to check if the command is available
   */
  private async checkNpmPackage(packageKey: string): Promise<DependencyCheckResult> {
    const pkg = NPM_PACKAGES[packageKey];
    if (!pkg) {
      throw new Error(`Unknown NPM package key: ${packageKey}`);
    }

    const result: DependencyCheckResult = {
      key: packageKey,
      name: pkg.name,
      type: packageKey === 'claude_code' ? DependencyType.ClaudeCode : DependencyType.OpenSpec,
      installed: false,
      description: pkg.description,
    };

    try {
      // Use 'which' on Unix/macOS, 'where' on Windows
      const checkCommand = process.platform === 'win32' ? 'where' : 'which';
      const { stdout } = await execAsync(`${checkCommand} ${pkg.commandName}`);

      // If command returns output (path), the package is installed
      if (stdout.trim().length > 0) {
        result.installed = true;

        // Try to get version by running the command with --version flag
        try {
          const { stdout: versionOutput } = await execAsync(`${pkg.commandName} --version`);
          // Parse version from output (common formats: "v1.2.3", "1.2.3", "claude 1.2.3")
          const versionMatch = versionOutput.match(/(\d+\.\d+\.\d+)/);
          result.version = versionMatch ? versionMatch[1] : 'installed';
        } catch {
          // Version check failed, but command exists
          result.version = 'installed';
        }

        console.log(`[DependencyManager] Package ${pkg.name} is installed:`, result.version);
      }
    } catch (error) {
      // Command not found
      console.log(`[DependencyManager] Package ${pkg.name} not found:`, error);
      result.installed = false;
    }

    return result;
  }

  /**
   * Install an NPM package with automatic mirror configuration
   */
  private async installNpmPackage(packageKey: string): Promise<boolean> {
    const pkg = NPM_PACKAGES[packageKey];
    if (!pkg) {
      console.error(`[DependencyManager] Unknown NPM package key: ${packageKey}`);
      return false;
    }

    try {
      console.log(`[DependencyManager] Installing NPM package: ${pkg.name}`);

      // Get mirror configuration
      const mirrorArgs = this.npmMirrorHelper.getNpmInstallArgs();
      const mirrorInfo = mirrorArgs.length > 0
        ? `with mirror: ${mirrorArgs.join(' ')}`
        : 'with official npm registry';

      console.log(`[DependencyManager] Installing ${pkg.name} ${mirrorInfo}`);

      // Build package string with version if specified
      const packageString = pkg.version ? `${pkg.packageName}@${pkg.version}` : pkg.packageName;

      // Build install command
      const installArgs = ['install', '-g', packageString];
      if (mirrorArgs.length > 0) {
        installArgs.unshift(...mirrorArgs);
      }

      const command = `npm ${installArgs.join(' ')}`;
      console.log(`[DependencyManager] Executing: ${command}`);

      // Execute install with timeout
      await execAsync(command, {
        timeout: 300000, // 5 minute timeout
        env: {
          ...process.env,
          // Ensure npm uses the registry from command line args
        },
      });

      // Verify installation
      const checkResult = await this.checkNpmPackage(packageKey);
      if (checkResult.installed) {
        console.log(`[DependencyManager] Successfully installed ${pkg.name} version: ${checkResult.version || 'unknown'}`);
        return true;
      } else {
        console.error(`[DependencyManager] Installation verification failed for ${pkg.name}`);
        return false;
      }
    } catch (error) {
      console.error(`[DependencyManager] Failed to install NPM package ${pkg.name}:`, error);
      return false;
    }
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
}
