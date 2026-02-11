import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';
import log from 'electron-log';
import { manifestReader, type ParsedDependency } from './manifest-reader.js';
import { DependencyManager, type DependencyCheckResult } from './dependency-manager.js';
import { StateManager, type InstalledVersionInfo } from './state-manager.js';
import { PathManager } from './path-manager.js';
import { ConfigManager } from './config-manager.js';
import { PackageSourceConfigManager, type StoredPackageSourceConfig } from './package-source-config-manager.js';
import { createPackageSource, type PackageSource, type PackageSourceConfig, type LocalFolderConfig, type GitHubReleaseConfig, type HttpIndexConfig, type DownloadProgressCallback } from './package-sources/index.js';

/**
 * Version information
 */
export interface Version {
  id: string;
  version: string;
  platform: string;
  packageFilename: string;
  releasedAt?: string;
  size?: number;
  downloadUrl?: string;
  releaseNotes?: string;
}

/**
 * Installed version information
 */
export interface InstalledVersion {
  id: string;
  version: string;
  platform: string;
  packageFilename: string;
  installedPath: string;
  installedAt: string;
  status: 'installed-ready' | 'installed-incomplete';
  dependencies: DependencyCheckResult[];
  isActive: boolean;
}

/**
 * Installation result
 */
export interface InstallResult {
  success: boolean;
  version: Version;
  installedPath?: string;
  error?: string;
  missingDependencies?: DependencyCheckResult[];  // Missing dependencies after installation
}

/**
 * Version Manager handles version lifecycle management
 */
export class VersionManager {
  private dependencyManager: DependencyManager;
  private stateManager: StateManager;
  private pathManager: PathManager;
  private configManager: ConfigManager;
  private packageSourceConfigManager: PackageSourceConfigManager;
  private userDataPath: string;
  private currentPackageSource: PackageSource | null;

  constructor(dependencyManager: DependencyManager, packageSourceConfigManager?: PackageSourceConfigManager) {
    this.dependencyManager = dependencyManager;
    this.stateManager = new StateManager();
    this.pathManager = PathManager.getInstance();
    this.configManager = new ConfigManager();
    // Use Electron's app.getPath('userData') to get the correct user data path
    this.userDataPath = app.getPath('userData');

    // Initialize package source configuration manager
    this.packageSourceConfigManager = packageSourceConfigManager || new PackageSourceConfigManager();

    // Initialize current package source
    this.currentPackageSource = null;
    this.initializePackageSource();
  }

  /**
   * Initialize the current package source from stored configuration
   */
  private async initializePackageSource(): Promise<void> {
    try {
      const activeSource = this.packageSourceConfigManager.getActiveSource();
      if (activeSource) {
        this.currentPackageSource = createPackageSource(this.storedToConfig(activeSource));
        log.info('[VersionManager] Package source initialized:', activeSource.type, 'ID:', activeSource.id);
      } else {
        log.warn('[VersionManager] No active package source found');
      }
    } catch (error) {
      log.error('[VersionManager] Failed to initialize package source:', error);
    }
  }

  /**
   * Convert StoredPackageSourceConfig to PackageSourceConfig
   */
  private storedToConfig(stored: StoredPackageSourceConfig): PackageSourceConfig {
    if (stored.type === 'local-folder') {
      return {
        type: 'local-folder',
        path: stored.path || '',
      } as LocalFolderConfig;
    } else if (stored.type === 'github-release') {
      return {
        type: 'github-release',
        owner: stored.owner || '',
        repo: stored.repo || '',
        token: stored.token,
      } as GitHubReleaseConfig;
    } else if (stored.type === 'http-index') {
      return {
        type: 'http-index',
        indexUrl: stored.indexUrl || '',
      } as HttpIndexConfig;
    }
    throw new Error(`Unknown package source type: ${stored.type}`);
  }

  /**
   * Ensure package source is initialized
   */
  private async ensurePackageSource(): Promise<PackageSource> {
    if (!this.currentPackageSource) {
      await this.initializePackageSource();
    }

    if (!this.currentPackageSource) {
      throw new Error('No package source configured');
    }

    return this.currentPackageSource;
  }

  /**
   * Get the current package source configuration
   */
  getCurrentSourceConfig(): StoredPackageSourceConfig | null {
    return this.packageSourceConfigManager.getActiveSource();
  }

  /**
   * Set a new package source configuration
   */
  async setSourceConfig(config: PackageSourceConfig & { name?: string }): Promise<boolean> {
    try {
      // Check if a source of this type already exists
      const sources = this.packageSourceConfigManager.getAllSources();
      const existingSource = sources.find(s => s.type === config.type);

      let newSource: StoredPackageSourceConfig;

      if (existingSource) {
        // Update existing source
        const updates: Partial<Omit<StoredPackageSourceConfig, 'id' | 'createdAt'>> = {
          type: config.type,
          name: config.name,
        };

        if (config.type === 'local-folder') {
          updates.path = (config as any).path;
        } else if (config.type === 'github-release') {
          updates.owner = (config as any).owner;
          updates.repo = (config as any).repo;
          updates.token = (config as any).token;
        } else if (config.type === 'http-index') {
          updates.indexUrl = (config as any).indexUrl;
        }

        this.packageSourceConfigManager.updateSource(existingSource.id, updates);
        newSource = { ...existingSource, ...updates } as StoredPackageSourceConfig;
        log.info('[VersionManager] Package source updated:', newSource.type, 'ID:', newSource.id);
      } else {
        // Create new source
        const storedConfig: Omit<StoredPackageSourceConfig, 'id' | 'createdAt'> = {
          type: config.type,
          name: config.name,
          ...(config.type === 'local-folder' ? { path: (config as any).path } : {}),
          ...(config.type === 'github-release' ? {
            owner: (config as any).owner,
            repo: (config as any).repo,
            token: (config as any).token
          } : {}),
          ...(config.type === 'http-index' ? {
            indexUrl: (config as any).indexUrl
          } : {}),
        };
        newSource = this.packageSourceConfigManager.addSource(storedConfig);
        log.info('[VersionManager] Package source created:', newSource.type, 'ID:', newSource.id);
      }

      this.currentPackageSource = createPackageSource(this.storedToConfig(newSource));
      this.packageSourceConfigManager.setActiveSource(newSource.id);
      return true;
    } catch (error) {
      log.error('[VersionManager] Failed to set package source:', error);
      return false;
    }
  }

  /**
   * Switch to an existing package source by ID
   */
  async switchSource(sourceId: string): Promise<boolean> {
    try {
      const source = this.packageSourceConfigManager.getSourceById(sourceId);
      if (!source) {
        log.warn('[VersionManager] Source not found:', sourceId);
        return false;
      }

      this.currentPackageSource = createPackageSource(this.storedToConfig(source));
      this.packageSourceConfigManager.setActiveSource(sourceId);
      log.info('[VersionManager] Switched to package source:', sourceId);
      return true;
    } catch (error) {
      log.error('[VersionManager] Failed to switch package source:', error);
      return false;
    }
  }

  /**
   * Get all available package source configurations
   */
  getAllSourceConfigs(): StoredPackageSourceConfig[] {
    return this.packageSourceConfigManager.getAllSources();
  }

  /**
   * Validate a package source configuration
   */
  async validateSourceConfig(config: PackageSourceConfig): Promise<{ valid: boolean; error?: string }> {
    try {
      const source = createPackageSource(config);
      if (source.validateConfig) {
        return await source.validateConfig();
      }
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get list of available versions from package sources
   * Filters versions based on the current operating system
   */
  async listVersions(): Promise<Version[]> {
    try {
      log.info('[VersionManager] Listing available versions...');

      const packageSource = await this.ensurePackageSource();
      const versions = await packageSource.listAvailableVersions();

      log.info('[VersionManager] Found', versions.length, 'available versions');
      return versions;
    } catch (error) {
      log.error('[VersionManager] Failed to list versions:', error);
      return [];
    }
  }

  /**
   * @deprecated Use listVersions() instead. This method is kept for backward compatibility.
   */
  private async getAvailableVersions(): Promise<string[]> {
    const versions = await this.listVersions();
    return versions.map(v => v.packageFilename);
  }

  /**
   * Get all installed versions
   */
  async getInstalledVersions(): Promise<InstalledVersion[]> {
    try {
      log.info('[VersionManager] Getting installed versions...');

      const versionsData = await this.stateManager.getInstalledVersions();
      const activeVersionData = await this.stateManager.getActiveVersion();

      const versions: InstalledVersion[] = [];

      for (const data of versionsData) {
        // Verify installation still exists
        try {
          await fs.access(data.installedPath);
        } catch {
          log.warn('[VersionManager] Installation not found:', data.id, '- removing from state');
          await this.stateManager.removeInstalledVersion(data.id);
          continue;
        }

        versions.push({
          ...data,
          isActive: data.id === activeVersionData?.versionId,
        });
      }

      // Sort by install date (newest first)
      versions.sort((a, b) => {
        return new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime();
      });

      log.info('[VersionManager] Found', versions.length, 'installed versions');
      return versions;
    } catch (error) {
      log.error('[VersionManager] Failed to get installed versions:', error);
      return [];
    }
  }

  /**
   * Install a version
   */
  async installVersion(
    versionId: string,
    onProgress?: (progress: {
      current: number;
      total: number;
      percentage: number;
    }) => void
  ): Promise<InstallResult> {
    try {
      log.info('[VersionManager] Installing version:', versionId);

      // Ensure required directories exist
      await this.pathManager.ensureDirectories();

      // Get available versions to find the target
      const versions = await this.listVersions();
      const targetVersion = versions.find((v) => v.id === versionId);

      if (!targetVersion) {
        throw new Error(`Version not found: ${versionId}`);
      }

      // Check if already installed
      const installedVersions = await this.getInstalledVersions();
      const alreadyInstalled = installedVersions.find((v) => v.id === versionId);

      if (alreadyInstalled) {
        log.info('[VersionManager] Version already installed:', versionId);
        return {
          success: true,
          version: targetVersion,
          installedPath: alreadyInstalled.installedPath,
        };
      }

      // Create installation directory using version ID
      const installPath = path.join(
        this.userDataPath,
        'apps',
        'installed',
        targetVersion.id
      );

      log.info('[VersionManager] Installing to:', installPath);

      // Create installation directory
      await fs.mkdir(installPath, { recursive: true });

      // Get package from current source
      const packageSource = await this.ensurePackageSource();
      const cachePath = this.pathManager.getCachePath(targetVersion.packageFilename);

      log.info('[VersionManager] Downloading package to cache...');
      await packageSource.downloadPackage(targetVersion, cachePath, onProgress);

      // Extract package
      log.info('[VersionManager] Extracting package...');
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(cachePath);
      zip.extractAllTo(installPath, true);

      log.info('[VersionManager] Package extracted to:', installPath);

      // Set executable permissions
      await this.setExecutablePermissions(installPath);

      // Check dependencies from manifest
      const manifest = await manifestReader.readManifest(installPath);
      let dependencies: DependencyCheckResult[] = [];
      let status: 'installed-ready' | 'installed-incomplete' = 'installed-incomplete';

      if (manifest) {
        const parsedDeps = manifestReader.parseDependencies(manifest);
        dependencies = await this.dependencyManager.checkFromManifest(parsedDeps);

        // Check if all dependencies are satisfied
        const allDepsSatisfied = dependencies.every(
          (dep) => dep.installed && !dep.versionMismatch
        );

        status = allDepsSatisfied ? 'installed-ready' : 'installed-incomplete';
      }

      // Configure data directory
      log.info('[VersionManager] Configuring data directory...');
      const dataDir = this.pathManager.getDataDirPath();

      // Ensure data directory exists
      try {
        await fs.access(dataDir);
      } catch {
        await fs.mkdir(dataDir, { recursive: true });
        log.info('[VersionManager] Created data directory:', dataDir);
      }

      // Update configuration file with data directory path
      try {
        await this.configManager.updateDataDir(versionId, dataDir);
        log.info('[VersionManager] DataDir configured:', dataDir);
      } catch (error) {
        log.warn('[VersionManager] Failed to configure DataDir:', error);
        // Configuration failure doesn't block installation
      }

      // Store installation info
      const versionInfo: InstalledVersionInfo = {
        id: versionId,
        version: targetVersion.version,
        platform: targetVersion.platform,
        packageFilename: targetVersion.packageFilename,
        installedPath: installPath,
        installedAt: new Date().toISOString(),
        status,
        dependencies,
        isActive: false, // Will be set below if first installation
      };

      await this.stateManager.setInstalledVersion(versionInfo);

      // If this is the first installation, make it active
      const currentActive = await this.stateManager.getActiveVersion();
      if (!currentActive) {
        await this.stateManager.setActiveVersion(versionId);
      }

      log.info('[VersionManager] Version installed successfully:', versionId, 'status:', status);

      // Calculate missing dependencies for the result
      const missingDependencies = dependencies.filter(
        (dep) => !dep.installed || dep.versionMismatch
      );

      return {
        success: true,
        version: targetVersion,
        installedPath: installPath,
        missingDependencies: status === 'installed-incomplete' ? missingDependencies : undefined,
      };
    } catch (error) {
      log.error('[VersionManager] Failed to install version:', error);
      return {
        success: false,
        version: { id: versionId, version: '', platform: '', packageFilename: versionId },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Uninstall a version
   */
  async uninstallVersion(versionId: string): Promise<boolean> {
    try {
      log.info('[VersionManager] Uninstalling version:', versionId);

      const installedVersions = await this.getInstalledVersions();
      const targetVersion = installedVersions.find((v) => v.id === versionId);

      if (!targetVersion) {
        log.warn('[VersionManager] Version not installed:', versionId);
        return false;
      }

      // Check if it's the active version
      if (targetVersion.isActive) {
        log.warn('[VersionManager] Cannot uninstall active version:', versionId);
        return false;
      }

      // Remove installed directory
      await fs.rm(targetVersion.installedPath, { recursive: true, force: true });

      // Remove from state
      await this.stateManager.removeInstalledVersion(versionId);

      log.info('[VersionManager] Version uninstalled:', versionId);
      return true;
    } catch (error) {
      log.error('[VersionManager] Failed to uninstall version:', error);
      return false;
    }
  }

  /**
   * Switch active version
   * Allows switching to any installed version regardless of dependency status
   */
  async switchVersion(versionId: string): Promise<{ success: boolean; warning?: { missing: DependencyCheckResult[] } }> {
    try {
      log.info('[VersionManager] Switching to version:', versionId);

      const installedVersions = await this.getInstalledVersions();
      const targetVersion = installedVersions.find((v) => v.id === versionId);

      if (!targetVersion) {
        log.warn('[VersionManager] Version not installed:', versionId);
        return { success: false };
      }

      // Log dependency status for audit
      if (targetVersion.status !== 'installed-ready') {
        const missingDependencies = targetVersion.dependencies.filter(
          (dep) => !dep.installed || dep.versionMismatch
        );
        log.info('[VersionManager] Switching to version with missing dependencies:', {
          version: versionId,
          missingCount: missingDependencies.length,
          dependencies: missingDependencies.map(d => ({ name: d.name, type: d.type, installed: d.installed }))
        });
      }

      // Update active version (allow switching to any installed version)
      await this.stateManager.setActiveVersion(versionId);

      log.info('[VersionManager] Switched to version:', versionId, 'status:', targetVersion.status);

      // Notify renderer of active version change
      const activeVersion = await this.getActiveVersion();
      if ((global as any).mainWindow && !(global as any).mainWindow.isDestroyed()) {
        (global as any).mainWindow.webContents.send('version:activeVersionChanged', activeVersion);
        log.info('[VersionManager] Sent activeVersionChanged event');
      }

      // Return success with warning if dependencies are missing
      if (targetVersion.status !== 'installed-ready') {
        const missingDependencies = targetVersion.dependencies.filter(
          (dep) => !dep.installed || dep.versionMismatch
        );
        return {
          success: true,
          warning: {
            missing: missingDependencies
          }
        };
      }

      return { success: true };
    } catch (error) {
      log.error('[VersionManager] Failed to switch version:', error);
      return { success: false };
    }
  }

  /**
   * Get active version
   */
  async getActiveVersion(): Promise<InstalledVersion | null> {
    try {
      const activeVersionData = await this.stateManager.getActiveVersion();

      if (!activeVersionData) {
        return null;
      }

      const installedVersions = await this.getInstalledVersions();
      return installedVersions.find((v) => v.id === activeVersionData.versionId) || null;
    } catch (error) {
      log.error('[VersionManager] Failed to get active version:', error);
      return null;
    }
  }

  /**
   * Reinstall a version (works even for active versions)
   * This will clear the active status, remove the version, and reinstall it
   */
  async reinstallVersion(versionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      log.info('[VersionManager] Reinstalling version:', versionId);

      const installedVersions = await this.getInstalledVersions();
      const targetVersion = installedVersions.find((v) => v.id === versionId);

      if (!targetVersion) {
        log.warn('[VersionManager] Version not installed:', versionId);
        return { success: false, error: 'Version not installed' };
      }

      // Check if this is the active version
      const activeVersion = await this.getActiveVersion();
      const wasActive = activeVersion?.id === versionId;

      // If active, clear the active status first
      if (wasActive) {
        await this.stateManager.clearActiveVersion();
        log.info('[VersionManager] Cleared active version for reinstallation');
      }

      // Remove the installed directory
      await fs.rm(targetVersion.installedPath, { recursive: true, force: true });

      // Remove from state
      await this.stateManager.removeInstalledVersion(versionId);

      log.info('[VersionManager] Version removed for reinstallation:', versionId);

      // Now reinstall using installVersion
      const result = await this.installVersion(versionId);

      if (result.success && wasActive) {
        // Set it as active again if it was active before
        await this.switchVersion(versionId);
        log.info('[VersionManager] Re-activated version after reinstallation:', versionId);
      }

      return result;
    } catch (error) {
      log.error('[VersionManager] Failed to reinstall version:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Check dependencies for a specific version
   */
  async checkVersionDependencies(versionId: string): Promise<DependencyCheckResult[]> {
    try {
      log.info('[VersionManager] Checking dependencies for version:', versionId);

      const installedVersions = await this.getInstalledVersions();
      const targetVersion = installedVersions.find((v) => v.id === versionId);

      if (!targetVersion) {
        log.warn('[VersionManager] Version not installed:', versionId);
        return [];
      }

      const installPath = targetVersion.installedPath;
      const manifest = await manifestReader.readManifest(installPath);

      if (!manifest) {
        log.warn('[VersionManager] No manifest found for version:', versionId);
        return [];
      }

      // Set manifest in dependency manager for NPM mirror configuration
      this.dependencyManager.setManifest(manifest);

      const parsedDeps = manifestReader.parseDependencies(manifest);
      const dependencies = await this.dependencyManager.checkFromManifest(parsedDeps);

      // Update version info in state
      const versionInfo = await this.stateManager.getInstalledVersion(versionId);

      if (versionInfo) {
        const allDepsSatisfied = dependencies.every(
          (dep) => dep.installed && !dep.versionMismatch
        );

        versionInfo.dependencies = dependencies;
        versionInfo.status = allDepsSatisfied
          ? 'installed-ready'
          : 'installed-incomplete';

        await this.stateManager.setInstalledVersion(versionInfo);
      }

      return dependencies;
    } catch (error) {
      log.error('[VersionManager] Failed to check dependencies:', error);
      return [];
    }
  }

  /**
   * Get logs directory path for an installed version
   * @param versionId - Version ID (e.g., "hagicode-0.1.0-alpha.9-linux-x64-nort")
   * @returns Path to the version's logs directory
   */
  getLogsPath(versionId: string): string {
    return this.pathManager.getLogsPath(versionId);
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

  /**
   * Set executable permissions for binaries in the installation directory
   */
  private async setExecutablePermissions(installPath: string): Promise<void> {
    try {
      const files = await fs.readdir(installPath);

      for (const file of files) {
        const filePath = path.join(installPath, file);
        const stat = await fs.stat(filePath);

        if (stat.isDirectory()) {
          await this.setExecutablePermissions(filePath);
        } else if (stat.isFile()) {
          // Make common executable names executable
          const executableNames = ['hagicode', 'hagicode.exe', 'pcode', 'pcode.exe', 'node', 'node.exe'];
          if (executableNames.includes(file) || file.endsWith('.sh')) {
            await fs.chmod(filePath, 0o755);
          }
        }
      }
    } catch (error) {
      log.warn('[VersionManager] Failed to set executable permissions:', error);
    }
  }
}
