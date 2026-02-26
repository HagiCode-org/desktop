import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import yaml from 'js-yaml';
import log from 'electron-log';

/**
 * Path types for different platforms
 */
export type Platform = 'linux-x64' | 'linux-arm64' | 'win-x64' | 'osx-x64' | 'osx-arm64';

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
 * Validation result interface for path validation
 */
export interface ValidationResult {
  isValid: boolean;
  message: string;
  warnings?: string[];
}

/**
 * Storage information interface
 */
export interface StorageInfo {
  used: number; // bytes
  total: number; // bytes
  available: number; // bytes
  usedPercentage: number; // 0-100
}

/**
 * PathManager provides centralized path management for application.
 * All paths should be retrieved from this manager to ensure consistency.
 */
export class PathManager {
  private static instance: PathManager | null = null;
  private paths: AppPaths;
  private userDataPath: string;
  private customDataDirectory: string | null = null;
  private static readonly MIN_DISK_SPACE = 1024 * 1024 * 1024; // 1GB in bytes

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
   * @returns Path to installed package directory
   * @deprecated Use getInstalledVersionPath instead with version ID
   */
  getInstalledPath(platform: Platform): string {
    // For backward compatibility, map platform to installed path
    return path.join(this.paths.appsInstalled, platform);
  }

  /**
   * Get appsettings.yml path for an installed version
   * Config is stored in installed version's config directory
   * @param versionId - Version ID (e.g., "hagicode-0.1.0-alpha.9-linux-x64-nort")
   * @returns Path to appsettings.yml in version's config directory
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
   * Get data directory path (legacy method)
   * @returns Path to data directory
   */
  getDataDirPath(): string {
    return this.paths.appsData;
  }

  /**
   * Read data directory path from YAML config (appsettings.yml)
   * @param versionId - Version ID to read config from (optional, reads from any available if not specified)
   * @returns Data directory path from YAML config, or null if not found/invalid
   */
  async readDataDirFromYamlConfig(versionId?: string): Promise<string | null> {
    try {
      let configPath: string | null = null;

      if (versionId) {
        // Read from specific version's config
        configPath = this.getAppSettingsPath(versionId);
      } else {
        // Try to find any installed version's config
        const installedDir = this.paths.appsInstalled;
        try {
          const versionDirs = await fs.readdir(installedDir);
          // Sort to get most recent version first
          versionDirs.sort((a, b) => b.localeCompare(a));

          for (const versionDir of versionDirs) {
            const versionPath = path.join(installedDir, versionDir);
            const stats = await fs.stat(versionPath);
            if (stats.isDirectory()) {
              configPath = this.getAppSettingsPath(versionDir);
              break;
            }
          }
        } catch {
          // No installed versions or can't read directory
          log.warn('[PathManager] No installed versions found for YAML config read');
        }
      }

      if (!configPath) {
        log.info('[PathManager] No YAML config path found');
        return null;
      }

      // Read and parse YAML file
      const content = await fs.readFile(configPath, 'utf-8');
      const config = yaml.load(content) as { DataDir?: string } | null;

      if (!config || typeof config !== 'object') {
        log.warn('[PathManager] Invalid YAML config format:', configPath);
        return null;
      }

      const dataDir = config.DataDir;
      if (!dataDir || typeof dataDir !== 'string') {
        log.info('[PathManager] No DataDir found in YAML config:', configPath);
        return null;
      }

      log.info('[PathManager] Read DataDir from YAML config:', configPath, '->', dataDir);
      return dataDir;
    } catch (error) {
      log.warn('[PathManager] Failed to read DataDir from YAML config:', error);
      return null;
    }
  }

  /**
   * Get the actual data directory path (supports custom configuration)
   * @returns The absolute path to the data directory
   */
  getDataDirectory(): string {
    return this.customDataDirectory || this.paths.appsData;
  }

  /**
   * Get the default data directory path
   * @returns The default absolute path to the data directory
   */
  getDefaultDataDirectory(): string {
    return path.join(this.userDataPath, 'apps', 'data');
  }

  /**
   * Set a custom data directory path
   * @param customPath - The absolute path to the data directory
   * @throws Error if the path is invalid
   */
  setDataDirectory(customPath: string): void {
    const validation = this.validatePathSync(customPath);
    if (!validation.isValid) {
      throw new Error(`Invalid data directory: ${validation.message}`);
    }
    this.customDataDirectory = customPath;
    this.paths.appsData = customPath;
    log.info('[PathManager] Data directory updated to:', customPath);
  }

  /**
   * Validate a path for use as data directory (synchronous version)
   * @param dirPath - The path to validate
   * @returns Validation result with status and messages
   */
  validatePathSync(dirPath: string): ValidationResult {
    const warnings: string[] = [];

    // 1. Validate absolute path (requirement: only absolute paths allowed)
    if (!path.isAbsolute(dirPath)) {
      return {
        isValid: false,
        message: 'Only absolute paths are supported. Please provide a full path starting with / or a drive letter (e.g., C:\\ or /).',
      };
    }

    // 2. Validate path format (invalid characters)
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(dirPath)) {
      return {
        isValid: false,
        message: 'Path contains invalid characters: < > : " | ? *',
      };
    }

    // Normalize path for cross-platform compatibility
    const normalizedPath = path.normalize(dirPath);

    // 3. Check if path exists, try to create if not
    let pathExists = false;
    try {
      fsSync.accessSync(normalizedPath);
      pathExists = true;
    } catch {
      // Path doesn't exist, try to create it
      try {
        fsSync.mkdirSync(normalizedPath, { recursive: true });
        log.info('[PathManager] Created data directory:', normalizedPath);
        pathExists = true;
      } catch (error) {
        return {
          isValid: false,
          message: `Cannot create directory at ${normalizedPath}: ${error}`,
        };
      }
    }

    // 4. Check writability if path exists
    if (pathExists) {
      const testFile = path.join(normalizedPath, '.write-test');
      try {
        fsSync.writeFileSync(testFile, 'test', { flag: 'wx' });
        fsSync.unlinkSync(testFile);
      } catch (error) {
        return {
          isValid: false,
          message: `No write permission for directory ${normalizedPath}: ${error}`,
        };
      }

      // 5. Check disk space (minimum 1GB) - sync version with limited info
      try {
        const stats = fsSync.statSync(normalizedPath);
        warnings.push('Note: Full disk space check requires async validation');
      } catch (error) {
        // Continue without disk space check
        log.warn('[PathManager] Could not check disk space:', error);
      }
    }

    return {
      isValid: true,
      message: 'Path is valid and writable',
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate a path for use as data directory (asynchronous version)
   * @param dirPath - The path to validate
   * @returns Validation result with status and messages
   */
  async validatePath(dirPath: string): Promise<ValidationResult> {
    const warnings: string[] = [];

    // 1. Validate absolute path (requirement: only absolute paths allowed)
    if (!path.isAbsolute(dirPath)) {
      return {
        isValid: false,
        message: 'Only absolute paths are supported. Please provide a full path starting with / or a drive letter (e.g., C:\\ or /).',
      };
    }

    // 2. Validate path format (invalid characters)
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(dirPath)) {
      return {
        isValid: false,
        message: 'Path contains invalid characters: < > : " | ? *',
      };
    }

    // Normalize path for cross-platform compatibility
    const normalizedPath = path.normalize(dirPath);

    // 3. Check if path exists, try to create if not
    let pathExists = false;
    try {
      await fs.access(normalizedPath);
      pathExists = true;
    } catch {
      // Path doesn't exist, try to create it
      try {
        await fs.mkdir(normalizedPath, { recursive: true });
        log.info('[PathManager] Created data directory:', normalizedPath);
        pathExists = true;
      } catch (error) {
        return {
          isValid: false,
          message: `Cannot create directory at ${normalizedPath}: ${error}`,
        };
      }
    }

    // 4. Check writability if path exists
    if (pathExists) {
      const testFile = path.join(normalizedPath, '.write-test');
      try {
        await fs.writeFile(testFile, 'test', { flag: 'wx' });
        await fs.unlink(testFile);
      } catch (error) {
        return {
          isValid: false,
          message: `No write permission for directory ${normalizedPath}: ${error}`,
        };
      }

      // 5. Check disk space (minimum 1GB)
      try {
        const stats = await fs.stat(normalizedPath);
        warnings.push('Note: Full disk space check may not be available on all platforms');
      } catch (error) {
        // Disk space check is not critical, just log warning
        log.warn('[PathManager] Could not check disk space:', error);
        warnings.push('Could not verify available disk space.');
      }
    }

    return {
      isValid: true,
      message: 'Path is valid and writable',
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Get storage information for the data directory
   * @param dirPath - The directory path to check
   * @returns Storage information
   */
  async getStorageInfo(dirPath: string): Promise<StorageInfo> {
    let used = 0;
    let total = 0;
    let available = 0;

    try {
      // Calculate directory size
      used = await this.calculateDirectorySize(dirPath);

      // Get disk space information (using statfs for available space)
      const stats = await fs.stat(dirPath);
      // Use size as approximate total
      total = stats.size || used * 2; // Approximate
      available = Math.max(0, total - used);
    } catch (error) {
      log.error('[PathManager] Failed to get storage info:', error);
    }

    const usedPercentage = total > 0 ? (used / total) * 100 : 0;

    return {
      used,
      total,
      available,
      usedPercentage,
    };
  }

  /**
   * Calculate the size of a directory recursively
   * @param dirPath - The directory path
   * @returns Total size in bytes
   */
  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          totalSize += await this.calculateDirectorySize(fullPath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        }
      }
    } catch (error) {
      log.warn('[PathManager] Failed to calculate directory size for', dirPath, error);
    }

    return totalSize;
  }

  /**
   * Get platform identifier for current OS
   * @returns Platform identifier
   */
  getCurrentPlatform(): Platform {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'linux') {
      return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
    }
    if (platform === 'win32') return 'win-x64';
    if (platform === 'darwin') {
      return arch === 'arm64' ? 'osx-arm64' : 'osx-x64';
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
   * @param filename - Package filename (e.g., "hagicode-0.1.0-linux-x64-nort.zip")
   * @returns Platform identifier
   */
  extractPlatformFromFilename(filename: string): Platform {
    // New format: hagicode-{version}-{platform}-nort.zip
    const newFormatMatch = filename.match(/^hagicode-([0-9]\.[0-9]\.[0-9](?:-[a-zA-Z0-9\.]+)?)-(linux-x64|linux-arm64|win-x64|osx-x64|osx-arm64)-nort\.zip$/);
    if (newFormatMatch) {
      return newFormatMatch[2] as Platform;
    }

    // Fallback: match old format for backwards compatibility
    const oldFormatMatch = filename.match(/^hagicode-([0-9]\.[0-9]\.[0-9](?:-[a-zA-Z0-9\.]+)?)-([a-zA-Z]+)-x64(-nort)?\.zip$/);
    if (oldFormatMatch) {
      const oldPlatform = oldFormatMatch[2].toLowerCase();
      if (oldPlatform.includes('linux') || oldPlatform.includes('ubuntu')) {
        return 'linux-x64';
      }
      if (oldPlatform.includes('win')) {
        return 'win-x64';
      }
      if (oldPlatform.includes('darwin') || oldPlatform.includes('mac') || oldPlatform.includes('osx')) {
        return 'osx-x64';
      }
    }

    throw new Error(`Cannot extract platform from filename: ${filename}`);
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
   * @returns Path to executable directory
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
