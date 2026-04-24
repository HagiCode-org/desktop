import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import yaml from 'js-yaml';
import log from 'electron-log';
import {
  buildPortableToolchainPaths,
  resolvePortableToolchainRoot,
  type PortableToolchainPathOptions,
  type PortableToolchainPaths,
} from './portable-toolchain-paths.js';
import type {
  BootstrapDataDirectoryContext,
  DataDirectoryDiagnostic,
  DataDirectorySource,
} from '../types/bootstrap.js';

export {
  buildPortableToolchainPaths,
  resolvePortableToolchainRoot,
  type PortableToolchainPathOptions,
  type PortableToolchainPaths,
} from './portable-toolchain-paths.js';

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
  normalizedPath?: string;
  diagnostic?: DataDirectoryDiagnostic;
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

export interface DataDirectoryPreparationResult {
  isReady: boolean;
  validation: ValidationResult;
  context: BootstrapDataDirectoryContext;
  diagnostic?: DataDirectoryDiagnostic;
}

export interface DirectoryAccessAdapter {
  access: (targetPath: string) => Promise<void>;
  mkdir: (targetPath: string, options: { recursive: true }) => Promise<void>;
  writeFile: (targetPath: string, data: string, options: { flag: 'wx' }) => Promise<void>;
  unlink: (targetPath: string) => Promise<void>;
}

export interface PortablePayloadValidationResult {
  exists: boolean;
  isValid: boolean;
  runtimeRoot: string;
  missingFiles: string[];
}

export interface PortableBundleManifestMember {
  platform: 'osx-x64' | 'osx-arm64';
  relativePath: string;
  requiredPaths: string[];
}

export interface PortableBundleManifest {
  schemaVersion: number;
  kind: 'macos-universal';
  publicationPlatform: 'osx-universal';
  currentLayout: string;
  fallbackRule: string;
  manifestPath: string;
  includedPlatforms: Array<'osx-x64' | 'osx-arm64'>;
  members: PortableBundleManifestMember[];
}

export interface PortableRuntimeSelection {
  bundleRoot: string;
  runtimeRoot: string;
  manifestPath: string | null;
  selectedPlatform: Platform | null;
  selectionSource: 'legacy-current-root' | 'bundle-member';
}

export function mapProcessArchToMacosPlatform(
  runtimePlatform: NodeJS.Platform = process.platform,
  runtimeArch: string = process.arch,
): 'osx-x64' | 'osx-arm64' | null {
  if (runtimePlatform !== 'darwin') {
    return null;
  }

  return runtimeArch === 'arm64' ? 'osx-arm64' : 'osx-x64';
}

export function parsePortableBundleManifest(raw: unknown): PortableBundleManifest | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const manifest = raw as Partial<PortableBundleManifest>;
  if (manifest.kind !== 'macos-universal' || !Array.isArray(manifest.members)) {
    return null;
  }

  const members = manifest.members.filter((member): member is PortableBundleManifestMember => (
    !!member &&
    typeof member === 'object' &&
    (member.platform === 'osx-x64' || member.platform === 'osx-arm64') &&
    typeof member.relativePath === 'string' &&
    Array.isArray(member.requiredPaths)
  ));
  if (members.length === 0) {
    return null;
  }

  const includedPlatforms = Array.isArray(manifest.includedPlatforms)
    ? manifest.includedPlatforms.filter((entry): entry is 'osx-x64' | 'osx-arm64' => (
      entry === 'osx-x64' || entry === 'osx-arm64'
    ))
    : members.map((member) => member.platform);

  return {
    schemaVersion: typeof manifest.schemaVersion === 'number' ? manifest.schemaVersion : 1,
    kind: 'macos-universal',
    publicationPlatform: 'osx-universal',
    currentLayout: typeof manifest.currentLayout === 'string'
      ? manifest.currentLayout
      : 'portable-fixed/current/{osx-x64,osx-arm64}',
    fallbackRule: typeof manifest.fallbackRule === 'string'
      ? manifest.fallbackRule
      : 'When this manifest is absent, Desktop must use portable-fixed/current as the legacy single-root payload.',
    manifestPath: typeof manifest.manifestPath === 'string' ? manifest.manifestPath : 'bundle-manifest.json',
    includedPlatforms,
    members,
  };
}

function getPathModuleForPlatform(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix;
}

export function normalizeDataDirectoryPathForPlatform(
  dirPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const trimmed = dirPath.trim();
  const pathModule = getPathModuleForPlatform(platform);
  const slashNormalized = platform === 'win32'
    ? trimmed.replace(/\//g, '\\')
    : trimmed.replace(/\\/g, '/');

  return pathModule.normalize(slashNormalized);
}

export function isAbsoluteDataDirectoryPath(
  dirPath: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const trimmed = dirPath.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return platform === 'win32'
    ? path.win32.isAbsolute(trimmed)
    : path.posix.isAbsolute(trimmed);
}

export function hasInvalidDataDirectoryCharacters(
  dirPath: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== 'win32') {
    return /\0/.test(dirPath);
  }

  const withoutDrive = dirPath.trim().replace(/^[A-Za-z]:/, '');
  return /[<>:"|?*]/.test(withoutDrive);
}

function buildDataDirectoryDiagnostic(input: {
  code: DataDirectoryDiagnostic['code'];
  operation: DataDirectoryDiagnostic['operation'];
  summary: string;
  detail?: string;
  requestedPath: string | null;
  normalizedPath: string;
  fallbackUsed?: boolean;
  fallbackPath?: string;
}): DataDirectoryDiagnostic {
  return {
    code: input.code,
    operation: input.operation,
    summary: input.summary,
    detail: input.detail,
    requestedPath: input.requestedPath,
    normalizedPath: input.normalizedPath,
    fallbackUsed: input.fallbackUsed ?? false,
    fallbackPath: input.fallbackPath,
  };
}

export async function prepareDataDirectoryAccess(
  dirPath: string,
  options?: {
    defaultPath?: string;
    source?: DataDirectorySource;
    requestedPath?: string | null;
    platform?: NodeJS.Platform;
    accessAdapter?: DirectoryAccessAdapter;
  },
): Promise<DataDirectoryPreparationResult> {
  const platform = options?.platform ?? process.platform;
  const normalizedPath = normalizeDataDirectoryPathForPlatform(dirPath, platform);
  const defaultPath = normalizeDataDirectoryPathForPlatform(
    options?.defaultPath ?? normalizedPath,
    platform,
  );
  const accessAdapter = options?.accessAdapter ?? {
    access: (targetPath) => fs.access(targetPath),
    mkdir: (targetPath, mkdirOptions) => fs.mkdir(targetPath, mkdirOptions),
    writeFile: (targetPath, data, writeOptions) => fs.writeFile(targetPath, data, writeOptions),
    unlink: (targetPath) => fs.unlink(targetPath),
  };
  const pathModule = getPathModuleForPlatform(platform);
  const context: BootstrapDataDirectoryContext = {
    source: options?.source ?? 'configured',
    requestedPath: options?.requestedPath ?? dirPath,
    normalizedPath,
    defaultPath,
    existed: false,
    created: false,
    writable: false,
    usingDefault: normalizedPath === defaultPath,
    fallbackUsed: false,
  };

  if (!isAbsoluteDataDirectoryPath(dirPath, platform)) {
    const diagnostic = buildDataDirectoryDiagnostic({
      code: 'invalid-path',
      operation: 'normalize',
      summary: 'data directory must be an absolute path',
      detail: 'Only absolute paths are supported for the Desktop data directory.',
      requestedPath: context.requestedPath,
      normalizedPath,
    });

    return {
      isReady: false,
      validation: {
        isValid: false,
        message: 'Only absolute paths are supported. Please provide a full path starting with / or a drive letter (e.g., C:\\ or /).',
        normalizedPath,
        diagnostic,
      },
      context,
      diagnostic,
    };
  }

  if (hasInvalidDataDirectoryCharacters(dirPath, platform)) {
    const diagnostic = buildDataDirectoryDiagnostic({
      code: 'invalid-path',
      operation: 'normalize',
      summary: 'data directory path contains unsupported characters',
      detail: 'Windows paths cannot contain < > : " | ? * outside the drive prefix.',
      requestedPath: context.requestedPath,
      normalizedPath,
    });

    return {
      isReady: false,
      validation: {
        isValid: false,
        message: 'Path contains invalid characters: < > : " | ? *',
        normalizedPath,
        diagnostic,
      },
      context,
      diagnostic,
    };
  }

  try {
    await accessAdapter.access(normalizedPath);
    context.existed = true;
  } catch {
    try {
      await accessAdapter.mkdir(normalizedPath, { recursive: true });
      context.created = true;
    } catch (error) {
      const diagnostic = buildDataDirectoryDiagnostic({
        code: 'mkdir-failed',
        operation: 'mkdir',
        summary: 'failed to create Desktop data directory',
        detail: error instanceof Error ? error.message : String(error),
        requestedPath: context.requestedPath,
        normalizedPath,
      });

      return {
        isReady: false,
        validation: {
          isValid: false,
          message: `Cannot create directory at ${normalizedPath}: ${diagnostic.detail}`,
          normalizedPath,
          diagnostic,
        },
        context,
        diagnostic,
      };
    }
  }

  const writeTestPath = pathModule.join(
    normalizedPath,
    `.hagicode-write-test-${process.pid}-${Date.now()}`,
  );

  try {
    await accessAdapter.writeFile(writeTestPath, 'ok', { flag: 'wx' });
    await accessAdapter.unlink(writeTestPath);
    context.writable = true;
  } catch (error) {
    const diagnostic = buildDataDirectoryDiagnostic({
      code: 'write-test-failed',
      operation: 'write-test',
      summary: 'data directory is not writable',
      detail: error instanceof Error ? error.message : String(error),
      requestedPath: context.requestedPath,
      normalizedPath,
    });

    return {
      isReady: false,
      validation: {
        isValid: false,
        message: `No write permission for directory ${normalizedPath}: ${diagnostic.detail}`,
        normalizedPath,
        diagnostic,
      },
      context,
      diagnostic,
    };
  }

  return {
    isReady: true,
    validation: {
      isValid: true,
      message: 'Path is valid and writable',
      warnings: ['Note: Full disk space check may not be available on all platforms'],
      normalizedPath,
    },
    context,
  };
}

/**
 * PathManager provides centralized path management for application.
 * All paths should be retrieved from this manager to ensure consistency.
 */
export class PathManager {
  private static instance: PathManager | null = null;
  private static readonly PORTABLE_FIXED_ROOT_SEGMENTS = ['extra', 'portable-fixed', 'current'] as const;
  private static readonly PORTABLE_TOOLCHAIN_ROOT_SEGMENTS = ['extra', 'portable-fixed', 'toolchain'] as const;
  private static readonly EMBEDDED_NODE_RUNTIME_MANIFEST_SEGMENTS = ['resources', 'embedded-node-runtime', 'runtime-manifest.json'] as const;
  private static readonly PORTABLE_BUNDLE_MANIFEST_FILE = 'bundle-manifest.json';
  private static readonly PORTABLE_FIXED_REQUIRED_FILES = [
    'manifest.json',
    path.join('lib', 'PCode.Web.dll'),
    path.join('lib', 'PCode.Web.runtimeconfig.json'),
    path.join('lib', 'PCode.Web.deps.json'),
  ] as const;
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

  getDesktopLogsDirectory(): string {
    return app.getPath('logs');
  }

  getDesktopAppsRoot(): string {
    return path.join(this.userDataPath, 'apps');
  }

  getDesktopConfigDirectory(): string {
    return this.paths.config;
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
    return normalizeDataDirectoryPathForPlatform(
      path.join(this.userDataPath, 'apps', 'data'),
      process.platform,
    );
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
    this.applyDataDirectoryPath(validation.normalizedPath ?? customPath);
    log.info('[PathManager] Data directory updated to:', customPath);
  }

  applyDataDirectoryPath(resolvedPath: string): void {
    this.customDataDirectory = resolvedPath;
    this.paths.appsData = resolvedPath;
  }

  /**
   * Validate a path for use as data directory (synchronous version)
   * @param dirPath - The path to validate
   * @returns Validation result with status and messages
   */
  validatePathSync(dirPath: string): ValidationResult {
    const normalizedPath = normalizeDataDirectoryPathForPlatform(dirPath, process.platform);

    if (!isAbsoluteDataDirectoryPath(dirPath, process.platform)) {
      return {
        isValid: false,
        message: 'Only absolute paths are supported. Please provide a full path starting with / or a drive letter (e.g., C:\\ or /).',
        normalizedPath,
      };
    }

    if (hasInvalidDataDirectoryCharacters(dirPath, process.platform)) {
      return {
        isValid: false,
        message: 'Path contains invalid characters: < > : " | ? *',
        normalizedPath,
      };
    }

    let existed = false;
    try {
      fsSync.accessSync(normalizedPath);
      existed = true;
    } catch {
      try {
        fsSync.mkdirSync(normalizedPath, { recursive: true });
        log.info('[PathManager] Created data directory:', normalizedPath);
      } catch (error) {
        return {
          isValid: false,
          message: `Cannot create directory at ${normalizedPath}: ${error}`,
          normalizedPath,
          diagnostic: buildDataDirectoryDiagnostic({
            code: 'mkdir-failed',
            operation: 'mkdir',
            summary: 'failed to create Desktop data directory',
            detail: error instanceof Error ? error.message : String(error),
            requestedPath: dirPath,
            normalizedPath,
          }),
        };
      }
    }

    const pathModule = getPathModuleForPlatform(process.platform);
    const testFile = pathModule.join(normalizedPath, `.hagicode-write-test-${process.pid}`);

    try {
      fsSync.writeFileSync(testFile, 'test', { flag: 'wx' });
      fsSync.unlinkSync(testFile);
    } catch (error) {
      return {
        isValid: false,
        message: `No write permission for directory ${normalizedPath}: ${error}`,
        normalizedPath,
        diagnostic: buildDataDirectoryDiagnostic({
          code: 'write-test-failed',
          operation: 'write-test',
          summary: 'data directory is not writable',
          detail: error instanceof Error ? error.message : String(error),
          requestedPath: dirPath,
          normalizedPath,
        }),
      };
    }

    const warnings = existed
      ? ['Note: Full disk space check requires async validation']
      : ['Directory was created during validation. Full disk space check requires async validation'];

    return {
      isValid: true,
      message: 'Path is valid and writable',
      warnings,
      normalizedPath,
    };
  }

  /**
   * Validate a path for use as data directory (asynchronous version)
   * @param dirPath - The path to validate
   * @returns Validation result with status and messages
   */
  async validatePath(dirPath: string): Promise<ValidationResult> {
    const preparation = await prepareDataDirectoryAccess(dirPath, {
      source: 'configured',
      defaultPath: this.getDefaultDataDirectory(),
    });

    return preparation.validation;
  }

  async prepareDataDirectoryForBootstrap(
    dirPath: string,
    options?: {
      source?: DataDirectorySource;
      requestedPath?: string | null;
      defaultPath?: string;
    },
  ): Promise<DataDirectoryPreparationResult> {
    return prepareDataDirectoryAccess(dirPath, {
      source: options?.source,
      requestedPath: options?.requestedPath,
      defaultPath: options?.defaultPath ?? this.getDefaultDataDirectory(),
    });
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

  getEmbeddedDotnetExecutableName(): string {
    return process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
  }

  getExpectedPackagedPinnedRuntimeRoot(platform: Platform = this.getCurrentPlatform()): string {
    return path.join(process.resourcesPath, 'dotnet', platform);
  }

  getExpectedPackagedEmbeddedRuntimeRoot(platform: Platform = this.getCurrentPlatform()): string {
    return this.getExpectedPackagedPinnedRuntimeRoot(platform);
  }

  getExpectedPackagedPortableRuntimeRoot(): string {
    return path.join(process.resourcesPath, ...PathManager.PORTABLE_FIXED_ROOT_SEGMENTS);
  }

  getExpectedPackagedPortableToolchainRoot(): string {
    return path.join(process.resourcesPath, ...PathManager.PORTABLE_TOOLCHAIN_ROOT_SEGMENTS);
  }

  getDevelopmentPinnedRuntimeRoot(platform: Platform = this.getCurrentPlatform()): string {
    return path.resolve(process.cwd(), 'build', 'embedded-runtime', 'current', 'dotnet', platform);
  }

  getDevelopmentEmbeddedRuntimeRoot(platform: Platform = this.getCurrentPlatform()): string {
    return this.getDevelopmentPinnedRuntimeRoot(platform);
  }

  getDevelopmentPortableRuntimeRoot(): string {
    return path.resolve(process.cwd(), 'resources', 'portable-fixed', 'current');
  }

  getDevelopmentPortableToolchainRoot(): string {
    return path.resolve(process.cwd(), 'resources', 'portable-fixed', 'toolchain');
  }

  getPinnedRuntimeRoot(platform: Platform = this.getCurrentPlatform()): string {
    if (!app.isPackaged) {
      const override = process.env.HAGICODE_EMBEDDED_DOTNET_ROOT?.trim();
      if (override) {
        const resolvedOverride = path.resolve(override);
        const nestedPlatformRoot = path.join(resolvedOverride, platform);
        if (fsSync.existsSync(path.join(nestedPlatformRoot, this.getEmbeddedDotnetExecutableName()))) {
          return nestedPlatformRoot;
        }

        return resolvedOverride;
      }

      return this.getDevelopmentPinnedRuntimeRoot(platform);
    }

    return this.getExpectedPackagedPinnedRuntimeRoot(platform);
  }

  getEmbeddedRuntimeRoot(platform: Platform = this.getCurrentPlatform()): string {
    return this.getPinnedRuntimeRoot(platform);
  }

  getPortableRuntimeBundleRoot(): string {
    const override = process.env.HAGICODE_PORTABLE_RUNTIME_ROOT?.trim();
    if (override) {
      return path.resolve(override);
    }

    if (!app.isPackaged) {
      return this.getDevelopmentPortableRuntimeRoot();
    }

    return this.getExpectedPackagedPortableRuntimeRoot();
  }

  private readPortableBundleManifest(bundleRoot: string): PortableBundleManifest | null {
    const manifestPath = path.join(bundleRoot, PathManager.PORTABLE_BUNDLE_MANIFEST_FILE);
    if (!fsSync.existsSync(manifestPath)) {
      return null;
    }

    try {
      const manifest = parsePortableBundleManifest(JSON.parse(fsSync.readFileSync(manifestPath, 'utf8')));
      if (!manifest) {
        log.warn('[PathManager] Ignoring invalid portable bundle manifest:', manifestPath);
        return null;
      }

      return manifest;
    } catch (error) {
      log.warn('[PathManager] Failed to read portable bundle manifest:', manifestPath, error);
      return null;
    }
  }

  getPortableRuntimeSelection(): PortableRuntimeSelection {
    const bundleRoot = this.getPortableRuntimeBundleRoot();
    const manifestPath = path.join(bundleRoot, PathManager.PORTABLE_BUNDLE_MANIFEST_FILE);
    const bundleManifest = this.readPortableBundleManifest(bundleRoot);
    if (!bundleManifest) {
      return {
        bundleRoot,
        runtimeRoot: bundleRoot,
        manifestPath: fsSync.existsSync(manifestPath) ? manifestPath : null,
        selectedPlatform: null,
        selectionSource: 'legacy-current-root',
      };
    }

    const selectedPlatform = mapProcessArchToMacosPlatform();
    if (!selectedPlatform) {
      log.warn('[PathManager] Portable bundle manifest is present but current platform is not a supported macOS member:', {
        manifestPath,
        currentPlatform: process.platform,
        currentArch: process.arch,
      });
      return {
        bundleRoot,
        runtimeRoot: bundleRoot,
        manifestPath,
        selectedPlatform: null,
        selectionSource: 'legacy-current-root',
      };
    }

    const selectedMember = bundleManifest.members.find((member) => member.platform === selectedPlatform);
    if (!selectedMember) {
      log.warn('[PathManager] Portable bundle manifest does not contain the selected macOS architecture member:', {
        manifestPath,
        selectedPlatform,
        includedPlatforms: bundleManifest.includedPlatforms,
      });
    }

    return {
      bundleRoot,
      runtimeRoot: path.join(bundleRoot, selectedMember?.relativePath ?? selectedPlatform),
      manifestPath,
      selectedPlatform,
      selectionSource: 'bundle-member',
    };
  }

  getPortableRuntimeRoot(): string {
    return this.getPortableRuntimeSelection().runtimeRoot;
  }

  getPortableToolchainRoot(): string {
    return resolvePortableToolchainRoot({
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
      overrideRoot: process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT,
    });
  }

  getPortableNodeRoot(): string {
    return buildPortableToolchainPaths({
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
      overrideRoot: process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT,
    }).nodeRoot;
  }

  getPortableToolchainBinRoot(): string {
    return buildPortableToolchainPaths({
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
      overrideRoot: process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT,
    }).toolchainBinRoot;
  }

  getPortableNodeBinRoot(): string {
    return buildPortableToolchainPaths({
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
      overrideRoot: process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT,
    }).nodeBinRoot;
  }

  getPortableNpmGlobalBinRoot(): string {
    return buildPortableToolchainPaths({
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
      overrideRoot: process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT,
    }).npmGlobalBinRoot;
  }

  getPortableNodeExecutablePath(): string {
    return buildPortableToolchainPaths({
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
      overrideRoot: process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT,
    }).nodeExecutablePath;
  }

  getPortableNpmExecutablePath(): string {
    return buildPortableToolchainPaths({
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
      overrideRoot: process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT,
    }).npmExecutablePath;
  }

  getPortableOpenspecExecutablePath(): string {
    return buildPortableToolchainPaths({
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
      overrideRoot: process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT,
    }).openspecExecutablePath;
  }

  getPortableToolchainManifestPath(): string {
    return buildPortableToolchainPaths({
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
      overrideRoot: process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT,
    }).toolchainManifestPath;
  }

  getPortableSkillsExecutablePath(): string {
    return buildPortableToolchainPaths({
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
      overrideRoot: process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT,
    }).skillsExecutablePath;
  }

  getPortableOmnirouteExecutablePath(): string {
    return buildPortableToolchainPaths({
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
      overrideRoot: process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT,
    }).omnirouteExecutablePath;
  }

  getEmbeddedNodeRuntimeManifestPath(): string {
    return path.resolve(process.cwd(), ...PathManager.EMBEDDED_NODE_RUNTIME_MANIFEST_SEGMENTS);
  }

  getPortableRuntimeConfigDir(): string {
    return path.join(this.getPortableRuntimeRoot(), 'config');
  }

  getPortableRuntimeLogsPath(): string {
    return path.join(this.getPortableRuntimeRoot(), 'lib', 'logs');
  }

  getPortableRuntimeRequiredFiles(): string[] {
    return [...PathManager.PORTABLE_FIXED_REQUIRED_FILES];
  }

  async validatePortableRuntimePayload(runtimeRoot: string = this.getPortableRuntimeRoot()): Promise<PortablePayloadValidationResult> {
    try {
      const stats = await fs.stat(runtimeRoot);
      if (!stats.isDirectory()) {
        return {
          exists: true,
          isValid: false,
          runtimeRoot,
          missingFiles: ['<runtime root is not a directory>'],
        };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          exists: false,
          isValid: false,
          runtimeRoot,
          missingFiles: [],
        };
      }

      throw error;
    }

    const missingFiles: string[] = [];
    for (const relativePath of PathManager.PORTABLE_FIXED_REQUIRED_FILES) {
      try {
        await fs.access(path.join(runtimeRoot, relativePath));
      } catch {
        missingFiles.push(relativePath);
      }
    }

    return {
      exists: true,
      isValid: missingFiles.length === 0,
      runtimeRoot,
      missingFiles,
    };
  }

  getPinnedDotnetPath(platform: Platform = this.getCurrentPlatform()): string {
    return path.join(this.getPinnedRuntimeRoot(platform), this.getEmbeddedDotnetExecutableName());
  }

  getEmbeddedDotnetPath(platform: Platform = this.getCurrentPlatform()): string {
    return this.getPinnedDotnetPath(platform);
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
