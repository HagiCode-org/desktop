import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Dependency type enumeration
 */
export enum DependencyType {
  DotNetRuntime = 'dotnet-runtime',
  NodeJs = 'nodejs',
  JavaRuntime = 'java-runtime',
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
 * DependencyManager handles detection and installation of system dependencies
 */
export class DependencyManager {
  private platform: NodeJS.Platform;

  constructor() {
    this.platform = process.platform;
  }

  /**
   * Check all dependencies
   */
  async checkAllDependencies(): Promise<DependencyCheckResult[]> {
    const results: DependencyCheckResult[] = [];

    // Check .NET Runtime (currently the only supported dependency)
    const dotNetResult = await this.checkDotNetRuntime();
    results.push(dotNetResult);

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
}
