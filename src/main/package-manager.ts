import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';
import log from 'electron-log';
import AdmZip from 'adm-zip';

export interface PackageInfo {
  version: string;
  platform: string;
  installedPath: string;
  isInstalled: boolean;
}

export interface PackageMeta {
  version: string;
  platform: string;
  installedAt: string;
  checksum?: string;
}

export interface InstallProgress {
  stage: 'downloading' | 'extracting' | 'verifying' | 'completed' | 'error';
  progress: number; // 0-100
  message: string;
}

export class PCodePackageManager {
  private userDataPath: string;
  private packageSourcePath: string;
  private currentPlatform: string;

  constructor() {
    this.userDataPath = app.getPath('userData');
    // Local development path
    this.packageSourcePath = '/home/newbe36524/repos/newbe36524/pcode/Release/release-packages/';
    this.currentPlatform = this.detectPlatform();
  }

  /**
   * Detect the current platform
   */
  private detectPlatform(): string {
    const platform = process.platform;
    const arch = process.arch;

    switch (platform) {
      case 'win32':
        return 'win-x64';
      case 'darwin':
        return 'osx-x64';
      case 'linux':
        return 'linux-x64';
      default:
        throw new Error(`Unsupported platform: ${platform} ${arch}`);
    }
  }

  /**
   * Extract platform from package filename
   * @param packageFilename - Full package filename (e.g., "hagicode-0.1.0-alpha.8-linux-x64.zip")
   * @returns Platform string (e.g., "linux-x64")
   */
  private extractPlatformFromFilename(packageFilename: string): string {
    // Match: hagicode-{version}-{platform}.zip
    // Version can contain: digits, dots, hyphens, letters (e.g., 0.1.0-alpha.8)
    // Platform can contain: letters, hyphens (e.g., linux-x64, osx-x64, win-x64)
    const match = packageFilename.match(/^hagicode-([0-9]\.[0-9]\.[0-9](?:-[a-zA-Z0-9\.]+)?)-([a-zA-Z]+)-x64\.zip$/);
    if (match) {
      return `${match[2]}-x64`;
    }
    return this.currentPlatform;
  }

  /**
   * Extract version from package filename
   * @param packageFilename - Full package filename (e.g., "hagicode-0.1.0-alpha.8-linux-x64.zip")
   * @returns Version string (e.g., "0.1.0-alpha.8")
   */
  private extractVersionFromFilename(packageFilename: string): string {
    const match = packageFilename.match(/^hagicode-([0-9]\.[0-9]\.[0-9](?:-[a-zA-Z0-9\.]+)?)-[a-zA-Z]+-x64\.zip$/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Get the package name for the current platform (deprecated - not used anymore)
   */
  getPlatformPackageName(version: string, platform?: string): string {
    const targetPlatform = platform || this.currentPlatform;
    return `hagicode-${version}-${targetPlatform}.zip`;
  }

  /**
   * Get the source path for package using the full package filename
   */
  private getPackageSourcePath(packageFilename: string): string {
    return path.join(this.packageSourcePath, packageFilename);
  }

  /**
   * Get paths for package management
   */
  private getPaths() {
    return {
      userData: this.userDataPath,
      pcodeWeb: path.join(this.userDataPath, 'pcode-web'),
      installed: path.join(this.userDataPath, 'pcode-web', 'installed'),
      cache: path.join(this.userDataPath, 'pcode-web', 'cache'),
      meta: path.join(this.userDataPath, 'pcode-web', 'meta.json'),
    };
  }

  /**
   * Initialize package management directories
   */
  private async initializeDirectories(): Promise<void> {
    const paths = this.getPaths();

    try {
      await fs.mkdir(paths.pcodeWeb, { recursive: true });
      await fs.mkdir(paths.installed, { recursive: true });
      await fs.mkdir(paths.cache, { recursive: true });
    } catch (error) {
      log.error('[PackageManager] Failed to create directories:', error);
      throw error;
    }
  }

  /**
   * Check if package is installed
   */
  async checkInstalled(): Promise<PackageInfo> {
    const paths = this.getPaths();
    const installedPath = path.join(paths.installed, this.currentPlatform);

    try {
      // Check if directory exists
      await fs.access(installedPath);

      // Read meta.json
      const metaContent = await fs.readFile(paths.meta, 'utf-8');
      const meta: PackageMeta = JSON.parse(metaContent);

      // Verify platform matches
      if (meta.platform !== this.currentPlatform) {
        log.warn('[PackageManager] Platform mismatch:', meta.platform, 'vs', this.currentPlatform);
      }

      return {
        version: meta.version,
        platform: meta.platform,
        installedPath,
        isInstalled: true,
      };
    } catch (error) {
      log.info('[PackageManager] Package not installed:', error);
      return {
        version: 'none',
        platform: this.currentPlatform,
        installedPath,
        isInstalled: false,
      };
    }
  }

  /**
   * Download (copy) package from source to cache
   */
  private async downloadPackage(packageFilename: string, onProgress?: (progress: InstallProgress) => void): Promise<string> {
    log.info('[PackageManager] Downloading package:', packageFilename);

    onProgress?.({
      stage: 'downloading',
      progress: 0,
      message: 'Preparing to download package...',
    });

    const sourcePath = this.getPackageSourcePath(packageFilename);
    const paths = this.getPaths();
    const cachePath = path.join(paths.cache, packageFilename);

    try {
      // Check if source exists
      await fs.access(sourcePath);

      onProgress?.({
        stage: 'downloading',
        progress: 50,
        message: 'Copying package...',
      });

      // Copy file to cache
      await fs.copyFile(sourcePath, cachePath);

      onProgress?.({
        stage: 'downloading',
        progress: 100,
        message: 'Package downloaded successfully',
      });

      return cachePath;
    } catch (error) {
      log.error('[PackageManager] Failed to download package:', error);
      onProgress?.({
        stage: 'error',
        progress: 0,
        message: `Failed to download package: ${error}`,
      });
      throw new Error(`Package source not found: ${sourcePath}`);
    }
  }

  /**
   * Extract package to installed directory
   */
  private async extractPackage(zipPath: string, platform: string, onProgress?: (progress: InstallProgress) => void): Promise<void> {
    log.info('[PackageManager] Extracting package:', zipPath);

    onProgress?.({
      stage: 'extracting',
      progress: 0,
      message: 'Preparing to extract package...',
    });

    const paths = this.getPaths();
    const targetPath = path.join(paths.installed, platform);

    try {
      // Remove existing installation
      try {
        await fs.rm(targetPath, { recursive: true, force: true });
      } catch {
        // Directory doesn't exist, that's fine
      }

      // Create target directory
      await fs.mkdir(targetPath, { recursive: true });

      onProgress?.({
        stage: 'extracting',
        progress: 20,
        message: 'Extracting files...',
      });

      // Extract zip
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(targetPath, true);

      onProgress?.({
        stage: 'extracting',
        progress: 80,
        message: 'Setting file permissions...',
      });

      // Set executable permissions
      await this.setExecutablePermissions(targetPath, platform);

      onProgress?.({
        stage: 'extracting',
        progress: 100,
        message: 'Package extracted successfully',
      });
    } catch (error) {
      log.error('[PackageManager] Failed to extract package:', error);

      // Rollback: remove partial installation
      try {
        await fs.rm(targetPath, { recursive: true, force: true });
      } catch {
        // Ignore rollback errors
      }

      onProgress?.({
        stage: 'error',
        progress: 0,
        message: `Failed to extract package: ${error}`,
      });
      throw error;
    }
  }

  /**
   * Set executable permissions for platform-specific files
   */
  private async setExecutablePermissions(installPath: string, platform: string): Promise<void> {
    try {
      switch (platform) {
        case 'linux-x64':
          // Make start.sh executable
          const startScript = path.join(installPath, 'start.sh');
          await fs.chmod(startScript, 0o755);
          // Also make the binary executable if it exists
          const binary = path.join(installPath, 'PCode.Web');
          try {
            await fs.chmod(binary, 0o755);
          } catch {
            // Binary might not exist
          }
          break;

        case 'osx-x64':
          // Make PCode.Web executable
          const macBinary = path.join(installPath, 'PCode.Web');
          await fs.chmod(macBinary, 0o755);
          break;

        case 'win-x64':
          // Windows doesn't need executable permissions
          break;
      }
    } catch (error) {
      log.warn('[PackageManager] Failed to set executable permissions:', error);
      // Non-fatal, continue
    }
  }

  /**
   * Verify installation
   */
  private async verifyInstallation(installPath: string, platform: string): Promise<boolean> {
    try {
      switch (platform) {
        case 'linux-x64':
          await fs.access(path.join(installPath, 'start.sh'));
          break;

        case 'osx-x64':
          await fs.access(path.join(installPath, 'PCode.Web'));
          break;

        case 'win-x64':
          await fs.access(path.join(installPath, 'PCode.Web.exe'));
          break;

        default:
          return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update meta.json with installation info
   */
  private async updateMeta(version: string, platform: string): Promise<void> {
    const paths = this.getPaths();
    const meta: PackageMeta = {
      version,
      platform,
      installedAt: new Date().toISOString(),
    };

    await fs.writeFile(paths.meta, JSON.stringify(meta, null, 2));
  }

  /**
   * Get available packages from package source
   * Returns full package filenames (e.g., "hagicode-0.1.0-alpha.8-linux-x64.zip")
   */
  async getAvailableVersions(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.packageSourcePath);
      const packages: string[] = [];

      for (const file of files) {
        // Match pattern: hagicode-{version}-{platform}.zip
        const match = file.match(/^hagicode-[\d\w\.\-]+-[\w\-]+\.zip$/);
        if (match) {
          packages.push(file);
        }
      }

      return packages.sort().reverse();
    } catch (error) {
      log.error('[PackageManager] Failed to get available versions:', error);
      return [];
    }
  }

  /**
   * Check disk space before installation
   */
  private async checkDiskSpace(requiredSpaceMB: number = 500): Promise<boolean> {
    try {
      const stats = await fs.statfs(this.userDataPath);
      const availableSpace = stats.bavail * stats.bsize;
      const requiredSpaceBytes = requiredSpaceMB * 1024 * 1024;

      if (availableSpace < requiredSpaceBytes) {
        log.error('[PackageManager] Insufficient disk space:', {
          available: `${Math.round(availableSpace / 1024 / 1024)}MB`,
          required: `${requiredSpaceMB}MB`,
        });
        return false;
      }

      return true;
    } catch (error) {
      log.error('[PackageManager] Failed to check disk space:', error);
      // Continue anyway, let the installation fail if there's no space
      return true;
    }
  }

  /**
   * Install package (full workflow)
   * @param packageFilename - Full package filename (e.g., "hagicode-0.1.0-alpha.8-linux-x64.zip")
   */
  async installPackage(packageFilename: string, onProgress?: (progress: InstallProgress) => void): Promise<boolean> {
    // Extract platform and version from filename
    const targetPlatform = this.extractPlatformFromFilename(packageFilename);
    const version = this.extractVersionFromFilename(packageFilename);

    log.info('[PackageManager] Installing package:', packageFilename, 'for', targetPlatform);

    try {
      // Initialize directories
      await this.initializeDirectories();

      onProgress?.({
        stage: 'verifying',
        progress: 0,
        message: 'Checking disk space...',
      });

      // Check disk space
      const hasEnoughSpace = await this.checkDiskSpace();
      if (!hasEnoughSpace) {
        throw new Error('Insufficient disk space');
      }

      // Download package
      const zipPath = await this.downloadPackage(packageFilename, onProgress);

      // Extract package
      await this.extractPackage(zipPath, targetPlatform, onProgress);

      onProgress?.({
        stage: 'verifying',
        progress: 90,
        message: 'Verifying installation...',
      });

      // Verify installation
      const paths = this.getPaths();
      const installPath = path.join(paths.installed, targetPlatform);
      const isVerified = await this.verifyInstallation(installPath, targetPlatform);

      if (!isVerified) {
        throw new Error('Installation verification failed');
      }

      // Update meta
      await this.updateMeta(version, targetPlatform);

      onProgress?.({
        stage: 'completed',
        progress: 100,
        message: 'Installation completed successfully',
      });

      log.info('[PackageManager] Package installed successfully');
      return true;
    } catch (error) {
      log.error('[PackageManager] Installation failed:', error);

      onProgress?.({
        stage: 'error',
        progress: 0,
        message: `Installation failed: ${error}`,
      });

      return false;
    }
  }

  /**
   * Get current platform
   */
  getPlatform(): string {
    return this.currentPlatform;
  }

  /**
   * Get installed version from meta
   */
  async getInstalledVersion(): Promise<string> {
    try {
      const paths = this.getPaths();
      const metaContent = await fs.readFile(paths.meta, 'utf-8');
      const meta: PackageMeta = JSON.parse(metaContent);
      return meta.version;
    } catch {
      return 'none';
    }
  }

  /**
   * Clear cached packages
   */
  async clearCache(): Promise<void> {
    const paths = this.getPaths();
    try {
      const files = await fs.readdir(paths.cache);
      for (const file of files) {
        const filePath = path.join(paths.cache, file);
        await fs.unlink(filePath);
      }
      log.info('[PackageManager] Cache cleared');
    } catch (error) {
      log.error('[PackageManager] Failed to clear cache:', error);
    }
  }

  /**
   * Remove installed package
   */
  async removeInstalled(platform?: string): Promise<boolean> {
    const targetPlatform = platform || this.currentPlatform;
    const paths = this.getPaths();
    const installPath = path.join(paths.installed, targetPlatform);

    try {
      await fs.rm(installPath, { recursive: true, force: true });

      // Clear meta if removing current platform
      if (targetPlatform === this.currentPlatform) {
        try {
          await fs.unlink(paths.meta);
        } catch {
          // Meta doesn't exist
        }
      }

      log.info('[PackageManager] Package removed:', targetPlatform);
      return true;
    } catch (error) {
      log.error('[PackageManager] Failed to remove package:', error);
      return false;
    }
  }
}
