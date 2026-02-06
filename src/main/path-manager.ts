import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import log from 'electron-log';

/**
 * Path types for different platforms
 */
export type Platform = 'linux-x64' | 'win-x64' | 'osx-x64' | 'darwin-arm64';

/**
 * Path structure interface
 */
export interface AppPaths {
  // Base paths
  userData: string;

  // Apps/versions paths (new structure)
  appsInstalled: string;
  appsData: string;

  // Config paths
  config: string;
  cache: string; // Moved to config directory
  webServiceConfig: string;
}

/**
 * PathManager provides centralized path management for the application.
 * All paths should be retrieved from this manager to ensure consistency.
 */
export class PathManager {
  private static instance: PathManager | null = null;
  private paths: AppPaths;
  private userDataPath: string;

  private constructor() {
    this.userDataPath = app.getPath('userData');
    this.paths = this.buildPaths();
    log.info('[PathManager] Initialized with paths:', this.paths);
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PathManager {
    if (!PathManager.instance) {
      PathManager.instance = new PathManager();
    }
    return PathManager.instance;
  }

  /**
   * Build all application paths
   */
  private buildPaths(): AppPaths {
    const userData = this.userDataPath;
    const configDir = path.join(userData, 'config');

    return {
      // Base paths
      userData,

      // Apps/versions paths (new structure)
      appsInstalled: path.join(userData, 'apps', 'installed'),
      appsData: path.join(userData, 'apps', 'data'),

      // Config paths
      config: configDir,
      cache: path.join(configDir, 'cache'),
      webServiceConfig: path.join(configDir, 'web-service.json'),
    };
  }

  /**
   * Get all paths
   */
  getPaths(): Readonly<AppPaths> {
    return this.paths;
  }

  /**
   * Get installed package path for a specific platform
   * @param platform - Platform identifier (e.g., 'linux-x64', 'win-x64')
   * @returns Path to the installed package directory
   * @deprecated Use getInstalledVersionPath instead with version ID
   */
  getInstalledPath(platform: Platform): string {
    // For backward compatibility, map platform to installed path
    return path.join(this.paths.appsInstalled, platform);
  }

  /**
   * Get appsettings.yml path for an installed version
   * Config is stored in the installed version's config directory
   * @param versionId - Version ID (e.g., "hagicode-0.1.0-alpha.9-linux-x64-nort")
   * @returns Path to appsettings.yml in the version's config directory
   */
  getAppSettingsPath(versionId: string): string {
    return path.join(this.paths.appsInstalled, versionId, 'config', 'appsettings.yml');
  }

  /**
   * Get installed version path by version ID
   * @param versionId - Version ID (e.g., "hagicode-0.1.0-alpha.9-linux-x64-nort")
   * @returns Path to the installed version directory
   */
  getInstalledVersionPath(versionId: string): string {
    return path.join(this.paths.appsInstalled, versionId);
  }

  /**
   * Get config directory for an installed version
   * @param versionId - Version ID
   * @returns Path to the version's config directory
   */
  getInstalledVersionConfigDir(versionId: string): string {
    return path.join(this.paths.appsInstalled, versionId, 'config');
  }

  /**
   * Get data directory path
   * @returns Path to the data directory
   */
  getDataDirPath(): string {
    return this.paths.appsData;
  }

  /**
   * Get platform identifier for current OS
   * @returns Platform identifier
   */
  getCurrentPlatform(): Platform {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'linux') return 'linux-x64';
    if (platform === 'win32') return 'win-x64';
    if (platform === 'darwin') {
      return arch === 'arm64' ? 'darwin-arm64' : 'osx-x64';
    }

    throw new Error(`Unsupported platform: ${platform} ${arch}`);
  }

  /**
   * Get cache path for a specific package file
   * @param filename - Package filename
   * @returns Path to cached package file
   */
  getCachePath(filename: string): string {
    return path.join(this.paths.cache, filename);
  }

  /**
   * Ensure all required directories exist
   */
  async ensureDirectories(): Promise<void> {
    const directoriesToCreate = [
      this.paths.appsInstalled,
      this.paths.appsData,
      this.paths.config,
      this.paths.cache,
    ];

    for (const dir of directoriesToCreate) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        log.info('[PathManager] Created directory:', dir);
      }
    }
  }

  /**
   * Get platform from package filename
   * @param filename - Package filename (e.g., "hagicode-0.1.0-linux-x64.zip")
   * @returns Platform identifier
   */
  extractPlatformFromFilename(filename: string): Platform {
    // Match patterns like: hagicode-0.1.0-linux-x64.zip or hagicode-0.1.0-alpha.8-win-x64.zip
    const platformMatch = filename.match(/(linux-x64|win-x64|osx-x64|darwin-arm64)/);
    if (!platformMatch) {
      throw new Error(`Cannot extract platform from filename: ${filename}`);
    }
    return platformMatch[1] as Platform;
  }

  /**
   * Get logs directory path for an installed version
   * @param versionId - Version ID (e.g., "hagicode-0.1.0-alpha.9-linux-x64-nort")
   * @returns Path to the version's logs directory
   */
  getLogsPath(versionId: string): string {
    return path.join(this.paths.appsInstalled, versionId, 'lib', 'logs');
  }

  /**
   * Get executable path for a platform
   * @param platform - Platform identifier
   * @returns Path to the executable directory
   * @deprecated Use getInstalledVersionPath instead with version ID
   */
  getExecutablePath(platform: Platform): string {
    return path.join(this.getInstalledPath(platform), 'bin');
  }

  /**
   * Get web service executable name for current platform
   * @returns Executable filename
   */
  getWebServiceExecutableName(): string {
    const platform = process.platform;
    if (platform === 'win32') return 'Newbe.PCode.Web.Service.exe';
    if (platform === 'darwin' || platform === 'linux') return 'Newbe.PCode.Web.Service';
    throw new Error(`Unsupported platform: ${platform}`);
  }
}
