import fs from 'node:fs/promises';
import path from 'node:path';
import log from 'electron-log';
import type { Version } from '../version-manager.js';
import type {
  PackageSource,
  LocalFolderConfig,
  PackageSourceValidationResult,
  DownloadProgressCallback,
} from './package-source.js';

/**
 * Local folder package source implementation
 * Scans a local directory for package files
 */
export class LocalFolderPackageSource implements PackageSource {
  readonly type = 'local-folder' as const;
  private config: LocalFolderConfig;

  constructor(config: LocalFolderConfig) {
    this.config = config;
  }

  /**
   * List all available versions from the local folder
   */
  async listAvailableVersions(): Promise<Version[]> {
    try {
      log.info('[LocalFolderSource] Scanning folder:', this.config.path);

      // Check if folder exists
      try {
        await fs.access(this.config.path);
      } catch {
        log.warn('[LocalFolderSource] Folder not accessible:', this.config.path);
        return [];
      }

      // Read directory contents
      const files = await fs.readdir(this.config.path);
      const packageFiles = files.filter(file => file.endsWith('.zip'));

      log.info('[LocalFolderSource] Found', packageFiles.length, 'package files');

      // Get current platform for filtering
      const currentPlatform = this.getCurrentPlatform();
      log.info('[LocalFolderSource] Current platform:', currentPlatform);

      // Parse version information from filenames
      const versions: Version[] = packageFiles
        .map((filename) => {
          const version = this.extractVersionFromFilename(filename);
          const platform = this.extractPlatformFromFilename(filename);
          const id = filename.replace(/\.zip$/, '');

          return {
            id,
            version,
            platform,
            packageFilename: filename,
          };
        })
        .filter((v) => {
          // Only show versions compatible with current platform
          return v.platform === currentPlatform;
        });

      // Sort by version (newest first)
      versions.sort((a, b) => this.compareVersions(b.version, a.version));

      log.info('[LocalFolderSource] Found', versions.length, 'versions for platform:', currentPlatform);
      return versions;
    } catch (error) {
      log.error('[LocalFolderSource] Failed to list versions:', error);
      return [];
    }
  }

  /**
   * Copy package file from local folder to cache
   */
  async downloadPackage(
    version: Version,
    cachePath: string,
    onProgress?: DownloadProgressCallback
  ): Promise<void> {
    try {
      log.info('[LocalFolderSource] Copying package to cache:', version.id);

      const sourcePath = path.join(this.config.path, version.packageFilename);

      // Verify source exists
      try {
        await fs.access(sourcePath);
      } catch {
        throw new Error(`Package file not found: ${sourcePath}`);
      }

      // Get file size for progress reporting
      if (onProgress) {
        const stats = await fs.stat(sourcePath);
        const totalSize = stats.size;

        // Report progress in chunks for large files
        onProgress({ current: 0, total: totalSize, percentage: 0 });
      }

      // Copy file to cache
      await fs.copyFile(sourcePath, cachePath);

      // Report completion
      if (onProgress) {
        const stats = await fs.stat(cachePath);
        onProgress({
          current: stats.size,
          total: stats.size,
          percentage: 100,
        });
      }

      log.info('[LocalFolderSource] Package copied successfully');
    } catch (error) {
      log.error('[LocalFolderSource] Failed to copy package:', error);
      throw error;
    }
  }

  /**
   * Validate the local folder configuration
   */
  async validateConfig(): Promise<PackageSourceValidationResult> {
    try {
      // Check if path is provided
      if (!this.config.path || this.config.path.trim() === '') {
        return {
          valid: false,
          error: 'Folder path is required',
        };
      }

      // Check if folder exists and is accessible
      try {
        const stats = await fs.stat(this.config.path);
        if (!stats.isDirectory()) {
          return {
            valid: false,
            error: 'Path is not a directory',
          };
        }
      } catch {
        return {
          valid: false,
          error: 'Folder does not exist or is not accessible',
        };
      }

      // Check if folder is readable
      try {
        await fs.access(this.config.path, fs.constants.R_OK);
      } catch {
        return {
          valid: false,
          error: 'Folder is not readable',
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Extract version from package filename
   */
  private extractVersionFromFilename(filename: string): string {
    // Match simplified format: hagicode-{version}-{platform}.zip
    const match = filename.match(/^hagicode-([0-9]\.[0-9]\.[0-9](?:-[a-zA-Z0-9\.]+)?)-(linux|windows|osx)\.zip$/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Extract platform from package filename
   */
  private extractPlatformFromFilename(filename: string): string {
    // Try to match simplified format: hagicode-{version}-{platform}.zip
    let match = filename.match(/^hagicode-([0-9]\.[0-9]\.[0-9](?:-[a-zA-Z0-9\.]+)?)-(linux|windows|osx)\.zip$/);
    if (match) {
      return match[2];
    }

    // Fallback: try to match old format for backwards compatibility
    match = filename.match(/^hagicode-([0-9]\.[0-9]\.[0-9](?:-[a-zA-Z0-9\.]+)?)-([a-zA-Z]+)-x64\.zip$/);
    if (match) {
      const oldPlatform = match[2].toLowerCase();
      // Map old platform names to new simplified names
      if (oldPlatform.includes('linux') || oldPlatform.includes('ubuntu')) {
        return 'linux';
      }
      if (oldPlatform.includes('win')) {
        return 'windows';
      }
      if (oldPlatform.includes('darwin') || oldPlatform.includes('mac') || oldPlatform.includes('osx')) {
        return 'osx';
      }
      return oldPlatform;
    }

    // Try to match format without architecture: hagicode-{version}-{platform}.zip
    match = filename.match(/^hagicode-([0-9]\.[0-9]\.[0-9](?:-[a-zA-Z0-9\.]+)?)-([a-zA-Z0-9\-]+)\.zip$/);
    if (match) {
      const rawPlatform = match[2].toLowerCase();
      // Map various platform names to simplified names
      if (rawPlatform.includes('linux') || rawPlatform.includes('ubuntu')) {
        return 'linux';
      }
      if (rawPlatform.includes('win')) {
        return 'windows';
      }
      if (rawPlatform.includes('darwin') || rawPlatform.includes('mac') || rawPlatform.includes('osx')) {
        return 'osx';
      }
      return rawPlatform;
    }

    // If no match, try to extract platform from filename structure
    const parts = filename.replace(/^hagicode-/, '').replace(/\.zip$/, '').split('-');
    if (parts.length >= 2) {
      // Last part is likely the platform
      const rawPlatform = parts[parts.length - 1].toLowerCase();
      if (rawPlatform.includes('linux') || rawPlatform.includes('ubuntu')) {
        return 'linux';
      }
      if (rawPlatform.includes('win')) {
        return 'windows';
      }
      if (rawPlatform.includes('darwin') || rawPlatform.includes('mac') || rawPlatform.includes('osx')) {
        return 'osx';
      }
      return rawPlatform;
    }

    return 'unknown';
  }

  /**
   * Get the current platform name for filtering
   */
  private getCurrentPlatform(): string {
    const currentPlatform = process.platform;
    switch (currentPlatform) {
      case 'win32':
        return 'windows';
      case 'darwin':
        return 'osx';
      case 'linux':
        return 'linux';
      default:
        return 'unknown';
    }
  }

  /**
   * Compare two version strings
   * Returns positive if v1 > v2, negative if v1 < v2, 0 if equal
   */
  private compareVersions(v1: string, v2: string): number {
    const parseVersion = (v: string) => {
      const parts = v.split('-')[0].split('.').map(Number);
      return parts;
    };

    const p1 = parseVersion(v1);
    const p2 = parseVersion(v2);

    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;

      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }

    return 0;
  }
}
