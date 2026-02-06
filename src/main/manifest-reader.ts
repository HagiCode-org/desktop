import fs from 'node:fs/promises';
import path from 'node:path';
import log from 'electron-log';

/**
 * Manifest schema version 1.0
 */
export interface Manifest {
  $schema: string;
  manifestVersion: string;
  package: {
    name: string;
    version: string;
    buildTimestamp: string;
    gitCommit: string;
  };
  dependencies: Record<string, Dependency>;
  filesReference: {
    path: string;
    checksum: string;
    format: string;
    count: number;
  };
  metadata: {
    description: string;
    author: string;
    license: string;
    homepage: string;
    documentation: string;
    repository: string;
  };
}

/**
 * Dependency definition from manifest
 */
export interface Dependency {
  version: DependencyVersion | DependencyVersionWithRuntime;
  installCommand?: InstallCommand;
  installHint?: string;
  checkCommand: string;
  type: DependencyTypeName;
  description: string;
}

/**
 * Version constraints
 */
export interface DependencyVersion {
  min: string;
  max: string;
  exact?: string;
  recommended?: string;
  description: string;
}

/**
 * Version constraints with runtime info
 */
export interface DependencyVersionWithRuntime extends DependencyVersion {
  runtime?: {
    min: string;
    max: string;
    recommended: string;
    description: string;
  };
}

/**
 * Dependency type names from manifest
 */
export type DependencyTypeName = 'npm' | 'system-runtime' | 'system-requirement';

/**
 * Region type for install commands
 */
export type Region = 'china' | 'global';

/**
 * Platform type for install commands
 */
export type Platform = 'windows' | 'macos' | 'linux';

/**
 * Regional install command (simple structure)
 */
export interface RegionalInstallCommand {
  china: string;
  global: string;
  isRegional: true;
}

/**
 * Platform regional install command (nested structure)
 */
export interface PlatformRegionalInstallCommand {
  windows?: {
    china: string;
    global: string;
  };
  macos?: {
    china: string;
    global: string;
  };
  linux?: {
    china: string;
    global: string;
  };
}

/**
 * Install command type (union type)
 */
export type InstallCommand =
  | string
  | RegionalInstallCommand
  | PlatformRegionalInstallCommand;

/**
 * Parsed dependency for checking
 */
export interface ParsedDependency {
  key: string;
  name: string;
  type: DependencyTypeName;
  versionConstraints: VersionConstraints;
  checkCommand: string;
  installCommand?: InstallCommand;
  installHint?: string;
  description: string;
}

/**
 * Parsed install command for execution
 */
export interface ParsedInstallCommand {
  command: string | null;  // Executable command, null means not auto-installable
  type: 'auto' | 'manual' | 'not-available';
  hint?: string;  // Manual install hint
}

/**
 * Version constraints for checking
 */
export interface VersionConstraints {
  min?: string;
  max?: string;
  exact?: string;
  recommended?: string;
  runtime?: {
    min?: string;
    max?: string;
    recommended?: string;
  };
}

/**
 * ManifestReader handles reading and parsing manifest.json files
 */
export class ManifestReader {
  /**
   * Read manifest.json from package installation directory
   * @param installPath - Path to the installed package directory
   * @returns Parsed Manifest object or null if not found
   */
  async readManifest(installPath: string): Promise<Manifest | null> {
    const manifestPath = path.join(installPath, 'manifest.json');

    try {
      log.info('[ManifestReader] Reading manifest:', manifestPath);

      // Check if file exists
      await fs.access(manifestPath);

      // Read file content
      const content = await fs.readFile(manifestPath, 'utf-8');

      // Parse JSON
      const manifest: Manifest = JSON.parse(content);

      // Validate manifest version
      if (manifest.manifestVersion !== '1.0') {
        log.warn('[ManifestReader] Unsupported manifest version:', manifest.manifestVersion);
      }

      log.info('[ManifestReader] Manifest loaded successfully:', manifest.package.name, manifest.package.version);
      return manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        log.warn('[ManifestReader] manifest.json not found at:', manifestPath);
      } else {
        log.error('[ManifestReader] Failed to read manifest:', error);
      }
      return null;
    }
  }

  /**
   * Parse dependencies from manifest into checkable format
   * @param manifest - The manifest object
   * @returns Array of parsed dependencies
   */
  parseDependencies(manifest: Manifest): ParsedDependency[] {
    const dependencies: ParsedDependency[] = [];

    for (const [key, dep] of Object.entries(manifest.dependencies)) {
      // Skip system requirements as they're not checkable/installable dependencies
      if (dep.type === 'system-requirement') {
        continue;
      }

      const versionConstraints: VersionConstraints = {
        min: dep.version.min,
        max: dep.version.max,
        exact: dep.version.exact,
        recommended: dep.version.recommended,
      };

      // Check for runtime-specific version constraints
      if ('runtime' in dep.version) {
        versionConstraints.runtime = {
          min: dep.version.runtime?.min,
          max: dep.version.runtime?.max,
          recommended: dep.version.runtime?.recommended,
        };
      }

      dependencies.push({
        key,
        name: this.formatDependencyName(key),
        type: dep.type,
        versionConstraints,
        checkCommand: dep.checkCommand,
        installCommand: dep.installCommand,
        installHint: dep.installHint,
        description: dep.description,
      });
    }

    log.info('[ManifestReader] Parsed', dependencies.length, 'dependencies');
    return dependencies;
  }

  /**
   * Format dependency key to display name
   * @param key - Dependency key (e.g., "claudeCode", "dotnet")
   * @returns Formatted display name
   */
  private formatDependencyName(key: string): string {
    // Capitalize first letter and handle camelCase
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  /**
   * Detect user region based on locale and timezone
   * @returns 'china' or 'global'
   */
  detectRegion(): Region {
    // Method 1: Check locale
    const locale = Intl?.DateTimeFormat()?.resolvedOptions()?.locale;
    if (locale && (locale === 'zh-CN' || locale.startsWith('zh-'))) {
      return 'china';
    }

    // Method 2: Check timezone
    const timezone = Intl?.DateTimeFormat()?.resolvedOptions()?.timeZone;
    if (timezone && (timezone === 'Asia/Shanghai' ||
                     timezone === 'Asia/Hong_Kong' ||
                     timezone === 'Asia/Taipei' ||
                     timezone === 'Asia/Chongqing' ||
                     timezone === 'Asia/Harbin')) {
      return 'china';
    }

    // Default to global
    return 'global';
  }

  /**
   * Get current platform key
   * @returns Platform key ('windows', 'macos', 'linux')
   */
  getPlatformKey(): Platform {
    switch (process.platform) {
      case 'win32':
        return 'windows';
      case 'darwin':
        return 'macos';
      case 'linux':
        return 'linux';
      default:
        return 'linux'; // Default fallback
    }
  }

  /**
   * Parse install command from manifest
   * @param installCommand - Install command from manifest
   * @param region - User region ('china' or 'global')
   * @returns Parsed command object
   */
  parseInstallCommand(
    installCommand: InstallCommand | undefined,
    region: Region = 'global'
  ): ParsedInstallCommand {
    // No install command
    if (!installCommand) {
      return {
        command: null,
        type: 'not-available',
      };
    }

    // String format - use directly
    if (typeof installCommand === 'string') {
      return {
        command: installCommand,
        type: 'auto',
      };
    }

    // Object format - check for different structures

    // Structure 1: { china: "...", global: "...", isRegional: true }
    if ('china' in installCommand && 'global' in installCommand && 'isRegional' in installCommand) {
      const regional = installCommand as RegionalInstallCommand;
      const command = regional[region] || regional.global;
      return {
        command: command || null,
        type: 'auto',
      };
    }

    // Structure 2: { platform: { china: "...", global: "..." } }
    const platform = this.getPlatformKey();
    if (platform in installCommand) {
      const platformCommands = (installCommand as PlatformRegionalInstallCommand)[platform];
      if (platformCommands) {
        const command = platformCommands[region] || platformCommands.global;
        if (command) {
          return {
            command: command,
            type: 'auto',
          };
        }
      }
    }

    // No matching command found
    return {
      command: null,
      type: 'not-available',
    };
  }

  /**
   * Parse install commands for all dependencies
   * @param dependencies - Array of parsed dependencies
   * @param region - User region ('china' or 'global')
   * @returns Array of dependencies with parsed install commands
   */
  parseInstallCommands(
    dependencies: ParsedDependency[],
    region?: Region
  ): Array<ParsedDependency & { parsedInstallCommand: ParsedInstallCommand }> {
    const detectedRegion = region || this.detectRegion();

    return dependencies.map(dep => ({
      ...dep,
      parsedInstallCommand: this.parseInstallCommand(dep.installCommand, detectedRegion),
    }));
  }
}

/**
 * Singleton instance for easy access
 */
export const manifestReader = new ManifestReader();
