import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { NpmMirrorHelper } from './npm-mirror-helper.js';
import Store from 'electron-store';

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
  name: string;
  type: DependencyType;
  installed: boolean;
  version?: string;
  requiredVersion?: string;
  versionMismatch?: boolean;
  installCommand?: string;
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
   * Check .NET Runtime installation
   */
  async checkDotNetRuntime(): Promise<DependencyCheckResult> {
    const requiredVersion = '8.0.0';
    const result: DependencyCheckResult = {
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
}
