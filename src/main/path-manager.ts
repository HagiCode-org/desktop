import { electron } from '../electron-api.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import yaml from 'js-yaml';
import log from 'electron-log';
import {
  buildNodeMajorNpmGlobalPaths,
  buildPm2MajorHomePaths,
  buildPortableToolchainPaths,
  type NodeMajorNpmGlobalPathOptions,
  type NodeMajorNpmGlobalPaths,
  type Pm2MajorHomePathOptions,
  type Pm2MajorHomePaths,
  type PortableToolchainPathOptions,
  type PortableToolchainPaths,
} from './portable-toolchain-paths.js';
import {
  buildPortableRuntimeSelection,
  resolvePackagedPortableRuntimeSelection,
  resolvePackagedPortableToolchainRoot,
  type PackagedPortableToolchainResolution,
  type PortableBundleManifest,
  type PortableBundleManifestMember,
  type PortableRuntimeSelection,
  type PortableRuntimeMacosPlatform,
} from './portable-runtime-layout.js';
import { getCommandExecutableName, getPinnedNodeRuntimeConfigPath } from './embedded-node-runtime-config.js';
import { getCodeServerRuntimeConfigPath as resolveCodeServerRuntimeConfigPath } from './code-server-runtime-config-path.js';
import {
  getDesktopRuntimeManifestPath,
  readDesktopRuntimeManifest,
  resolveDesktopRuntimeComponentContainerRoot,
  resolveDesktopRuntimeComponentProgramRoot,
  resolveDesktopRuntimeDataHome,
  resolveDesktopRuntimeProgramHome,
  resolveDesktopRuntimeServiceDataHome,
  resolveDesktopRuntimeSharedDataPaths,
  type DesktopRuntimeServiceId,
} from './desktop-runtime-paths.js';
import {
  registerRuntimeManifestUserDataPath,
  resolveRuntimeManifestDataScopePath,
} from './runtime-manifest-store.js';
import type {
  BootstrapDataDirectoryContext,
  DataDirectoryDiagnostic,
  DataDirectorySource,
} from '../types/bootstrap.js';

const { app } = electron;

function resolveVendoredRuntimeOverrideRoot(overrideRoot: string): string {
  const resolvedOverride = path.resolve(overrideRoot);
  return path.basename(resolvedOverride) === 'current'
    ? resolvedOverride
    : path.join(resolvedOverride, 'current');
}

interface VendoredExtractedRuntimeState {
  version?: unknown;
  versionedRoot?: unknown;
  currentRoot?: unknown;
}

function resolveVendoredRuntimeDirectoryName(serviceId: DesktopRuntimeServiceId): string {
  return 'code_server';
}

function readVendoredExtractedRuntimeState(
  serviceDataHome: string,
): VendoredExtractedRuntimeState | null {
  const statePath = path.join(serviceDataHome, 'extracted-runtime.json');

  try {
    return JSON.parse(fsSync.readFileSync(statePath, 'utf8')) as VendoredExtractedRuntimeState;
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === 'ENOENT') {
      return null;
    }

    log.warn('[PathManager] failed to read vendored extracted runtime state', {
      serviceDataHome,
      statePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function readVendoredPackagedRuntimeVersion(packagedRoot: string): string | null {
  const markerPath = path.join(packagedRoot, '.hagicode-runtime.json');

  try {
    const marker = JSON.parse(fsSync.readFileSync(markerPath, 'utf8')) as { version?: unknown };
    return typeof marker.version === 'string' && marker.version.trim().length > 0
      ? marker.version.trim()
      : null;
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === 'ENOENT') {
      return null;
    }

    log.warn('[PathManager] failed to read vendored packaged runtime marker', {
      packagedRoot,
      markerPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function resolveVendoredRuntimeVersionOverride(serviceId: DesktopRuntimeServiceId): string | null {
  const envKey = 'HAGICODE_CODE_SERVER_RUNTIME_VERSION';
  const override = process.env[envKey]?.trim();
  return override && override.length > 0 ? override : null;
}

function normalizeStoredRuntimePath(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? path.resolve(value)
    : null;
}

function buildVendoredRuntimeVersionedRoot(
  runtimeDataHome: string,
  serviceId: DesktopRuntimeServiceId,
  version: string,
): string {
  return path.join(
    runtimeDataHome,
    'runtimeComponents',
    resolveVendoredRuntimeDirectoryName(serviceId),
    version,
  );
}

export function resolveVendoredRuntimeVersionRootPath(input: {
  runtimeDataHome: string;
  serviceDataHome: string;
  packagedRoot: string;
  serviceId: DesktopRuntimeServiceId;
}): string {
  const extractedState = readVendoredExtractedRuntimeState(input.serviceDataHome);
  const expectedVersion = resolveVendoredRuntimeVersionOverride(input.serviceId)
    ?? readVendoredPackagedRuntimeVersion(input.packagedRoot);
  const storedVersion = typeof extractedState?.version === 'string' && extractedState.version.trim().length > 0
    ? extractedState.version.trim()
    : null;
  const storedVersionedRoot = normalizeStoredRuntimePath(extractedState?.versionedRoot);

  if (storedVersion && storedVersionedRoot && (!expectedVersion || storedVersion === expectedVersion)) {
    return storedVersionedRoot;
  }

  if (expectedVersion) {
    return buildVendoredRuntimeVersionedRoot(input.runtimeDataHome, input.serviceId, expectedVersion);
  }

  if (storedVersionedRoot) {
    return storedVersionedRoot;
  }

  const unresolvedVersionRoot = buildVendoredRuntimeVersionedRoot(
    input.runtimeDataHome,
    input.serviceId,
    'unresolved',
  );
  log.warn('[PathManager] vendored runtime version is unresolved; using placeholder extracted runtime root', {
    serviceId: input.serviceId,
    serviceDataHome: input.serviceDataHome,
    packagedRoot: input.packagedRoot,
    unresolvedVersionRoot,
  });
  return unresolvedVersionRoot;
}

export function resolveVendoredRuntimeCurrentRootPath(input: {
  runtimeDataHome: string;
  serviceDataHome: string;
  packagedRoot: string;
  serviceId: DesktopRuntimeServiceId;
}): string {
  const extractedState = readVendoredExtractedRuntimeState(input.serviceDataHome);
  const storedCurrentRoot = normalizeStoredRuntimePath(extractedState?.currentRoot);
  const storedVersion = typeof extractedState?.version === 'string' && extractedState.version.trim().length > 0
    ? extractedState.version.trim()
    : null;
  const expectedVersion = resolveVendoredRuntimeVersionOverride(input.serviceId)
    ?? readVendoredPackagedRuntimeVersion(input.packagedRoot);

  if (storedCurrentRoot && (!expectedVersion || (storedVersion && storedVersion === expectedVersion))) {
    return storedCurrentRoot;
  }

  return path.join(resolveVendoredRuntimeVersionRootPath(input), 'current');
}

export {
  buildNodeMajorNpmGlobalPaths,
  buildPm2MajorHomePaths,
  buildPortableToolchainPaths,
  type NodeMajorNpmGlobalPathOptions,
  type NodeMajorNpmGlobalPaths,
  type Pm2MajorHomePathOptions,
  type Pm2MajorHomePaths,
  type PortableToolchainPathOptions,
  type PortableToolchainPaths,
} from './portable-toolchain-paths.js';
export {
  buildPortableRuntimeSelection,
  resolvePackagedPortableRuntimeSelection,
  resolvePackagedPortableToolchainRoot,
  type PackagedPortableToolchainResolution,
  type PortableBundleManifest,
  type PortableBundleManifestMember,
  type PortableRuntimeMacosPlatform,
  type PortableRuntimeSelection,
} from './portable-runtime-layout.js';

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
    source: options?.source ?? 'default',
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
  private static readonly PORTABLE_FIXED_REQUIRED_FILES = [
    'manifest.json',
    path.join('lib', 'PCode.Web.dll'),
    path.join('lib', 'PCode.Web.runtimeconfig.json'),
    path.join('lib', 'PCode.Web.deps.json'),
  ] as const;
  private paths: AppPaths;
  private userDataPath: string;
  private runtimeDataScopePath: string;

  private constructor() {
    this.userDataPath = app.getPath('userData');
    this.runtimeDataScopePath = resolveRuntimeManifestDataScopePath(this.userDataPath);
    registerRuntimeManifestUserDataPath(this.userDataPath);
    this.paths = this.buildPaths();
    log.info(
      '[PathManager] Initialized. Dev scope:',
      process.env.HAGICODE_DESKTOP_INSTANCE_NAME === 'hagicode_dev',
      '| runtimeDataScope:', this.runtimeDataScopePath,
      '| appsInstalled:', this.paths.appsInstalled,
    );
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
    const runtimeDataScopePath = this.runtimeDataScopePath;
    const configDir = path.join(userData, 'config');

    return {
      // Base paths
      userData,

      // Apps/versions paths (new structure)
      appsInstalled: path.join(runtimeDataScopePath, 'apps', 'installed'),
      appsData: path.join(runtimeDataScopePath, 'apps', 'data'),

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

  getUserDataPath(): string {
    return this.userDataPath;
  }

  getDesktopRuntimeManifestPath(): string {
    return getDesktopRuntimeManifestPath();
  }

  getRuntimeProgramHome(): string {
    return resolveDesktopRuntimeProgramHome({
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      overrideRoot: process.env.HAGICODE_RUNTIME_HOME,
    });
  }

  getRuntimeDataHome(): string {
    return resolveDesktopRuntimeDataHome({
      userDataPath: this.runtimeDataScopePath,
      overrideRoot: process.env.HAGICODE_RUNTIME_DATA_HOME,
    });
  }

  getRuntimeSharedPaths(): ReturnType<typeof resolveDesktopRuntimeSharedDataPaths> {
    return resolveDesktopRuntimeSharedDataPaths(this.getRuntimeDataHome(), readDesktopRuntimeManifest());
  }

  getCodeServerRuntimeDataHome(): string {
    return resolveDesktopRuntimeServiceDataHome('code-server', this.getRuntimeDataHome(), readDesktopRuntimeManifest());
  }

  getVendoredRuntimeDataHome(serviceId: DesktopRuntimeServiceId): string {
    return resolveDesktopRuntimeServiceDataHome(serviceId, this.getRuntimeDataHome(), readDesktopRuntimeManifest());
  }

  getVendoredRuntimePackagedRoot(serviceId: DesktopRuntimeServiceId): string {
    return resolveDesktopRuntimeComponentContainerRoot(serviceId, this.getRuntimeProgramHome(), this.getCurrentPlatform(), readDesktopRuntimeManifest());
  }

  getVendoredRuntimePackagedMarkerPath(serviceId: DesktopRuntimeServiceId): string {
    return path.join(this.getVendoredRuntimePackagedRoot(serviceId), '.hagicode-runtime.json');
  }

  getVendoredRuntimePackagedArchivePath(serviceId: DesktopRuntimeServiceId): string {
    const archiveFileName = 'code-server.7z';
    return path.join(this.getVendoredRuntimePackagedRoot(serviceId), 'archives', archiveFileName);
  }

  private getVendoredRuntimeVersionRoot(serviceId: DesktopRuntimeServiceId): string {
    return resolveVendoredRuntimeVersionRootPath({
      runtimeDataHome: this.getRuntimeDataHome(),
      serviceDataHome: this.getVendoredRuntimeDataHome(serviceId),
      packagedRoot: this.getVendoredRuntimePackagedRoot(serviceId),
      serviceId,
    });
  }

  getVendoredRuntimeHome(serviceId: DesktopRuntimeServiceId): string {
    return this.getVendoredRuntimeVersionRoot(serviceId);
  }

  getVendoredRuntimeRoot(serviceId: DesktopRuntimeServiceId): string {
    return resolveVendoredRuntimeCurrentRootPath({
      runtimeDataHome: this.getRuntimeDataHome(),
      serviceDataHome: this.getVendoredRuntimeDataHome(serviceId),
      packagedRoot: this.getVendoredRuntimePackagedRoot(serviceId),
      serviceId,
    });
  }

  getVendoredRuntimeStagingRoot(serviceId: DesktopRuntimeServiceId): string {
    return path.join(this.getVendoredRuntimeVersionRoot(serviceId), 'staging');
  }

  getNodeMajorNpmGlobalPaths(
    input: Omit<NodeMajorNpmGlobalPathOptions, 'userDataPath'> = {},
  ): NodeMajorNpmGlobalPaths {
    return buildNodeMajorNpmGlobalPaths({
      ...input,
      userDataPath: this.runtimeDataScopePath,
    });
  }

  getPm2MajorHomePaths(
    input: Omit<Pm2MajorHomePathOptions, 'userDataPath'> = {},
  ): Pm2MajorHomePaths {
    return buildPm2MajorHomePaths({
      ...input,
      userDataPath: this.runtimeDataScopePath,
    });
  }

  async ensurePm2MajorHomeDirectory(
    input: Omit<Pm2MajorHomePathOptions, 'userDataPath'> = {},
  ): Promise<Pm2MajorHomePaths> {
    const pm2HomePaths = this.getPm2MajorHomePaths(input);
    await fs.mkdir(pm2HomePaths.pm2Home, { recursive: true });
    return pm2HomePaths;
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
    return path.join(this.runtimeDataScopePath, 'apps');
  }

  getManagedServerProgramHome(): string {
    return this.paths.appsInstalled;
  }

  getManagedServerDataHome(): string {
    return this.paths.appsData;
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
   * Get the internally managed default data directory path.
   */
  getDataDirectory(): string {
    return this.paths.appsData;
  }

  /**
   * Get the default data directory path
   * @returns The default absolute path to the data directory
   */
  getDefaultDataDirectory(): string {
    return normalizeDataDirectoryPathForPlatform(
      path.join(this.runtimeDataScopePath, 'apps', 'data'),
      process.platform,
    );
  }

  applyDataDirectoryPath(resolvedPath: string): void {
    this.paths.appsData = resolvedPath;
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

  getEmbeddedDotnetExecutableName(): string {
    return process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
  }

  getExpectedPackagedPinnedRuntimeRoot(platform: Platform = this.getCurrentPlatform()): string {
    return resolveDesktopRuntimeComponentProgramRoot('dotnet', this.getRuntimeProgramHome(), platform);
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
    return resolveDesktopRuntimeComponentProgramRoot('dotnet', this.getRuntimeProgramHome(), platform);
  }

  getDevelopmentEmbeddedRuntimeRoot(platform: Platform = this.getCurrentPlatform()): string {
    return this.getDevelopmentPinnedRuntimeRoot(platform);
  }

  getDevelopmentPortableRuntimeRoot(): string {
    return path.resolve(process.cwd(), 'resources', 'portable-fixed', 'current');
  }

  getDevelopmentPortableToolchainRoot(): string {
    return resolveDesktopRuntimeComponentProgramRoot('node', this.getRuntimeProgramHome(), this.getCurrentPlatform());
  }

  private buildPortableToolchainRuntimePaths(): PortableToolchainPaths {
    return buildPortableToolchainPaths({
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
      overrideRoot: process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT,
    });
  }

  getPinnedRuntimeRoot(platform: Platform = this.getCurrentPlatform()): string {
    if (!app.isPackaged) {
      const override = process.env.HAGICODE_EMBEDDED_DOTNET_ROOT?.trim();
      if (override) {
        const resolvedOverride = path.resolve(override);
        const nestedPlatformRoot = path.join(resolvedOverride, platform);
        const nestedPlatformCurrentRoot = path.join(nestedPlatformRoot, 'current');
        if (fsSync.existsSync(path.join(nestedPlatformCurrentRoot, this.getEmbeddedDotnetExecutableName()))) {
          return nestedPlatformCurrentRoot;
        }
        if (fsSync.existsSync(path.join(nestedPlatformRoot, this.getEmbeddedDotnetExecutableName()))) {
          return nestedPlatformRoot;
        }
        if (fsSync.existsSync(path.join(resolvedOverride, 'current', this.getEmbeddedDotnetExecutableName()))) {
          return path.join(resolvedOverride, 'current');
        }

        return resolvedOverride;
      }

      return resolveDesktopRuntimeComponentProgramRoot('dotnet', this.getRuntimeProgramHome(), platform);
    }

    return resolveDesktopRuntimeComponentProgramRoot('dotnet', this.getRuntimeProgramHome(), platform);
  }

  getEmbeddedRuntimeRoot(platform: Platform = this.getCurrentPlatform()): string {
    return this.getPinnedRuntimeRoot(platform);
  }

  getEmbeddedRuntimeContainerRoot(platform: Platform = this.getCurrentPlatform()): string {
    const override = process.env.HAGICODE_EMBEDDED_DOTNET_ROOT?.trim();
    if (override) {
      const resolvedOverride = path.resolve(override);
      const nestedPlatformRoot = path.join(resolvedOverride, platform);
      const nestedPlatformCurrentRoot = path.join(nestedPlatformRoot, 'current');
      if (fsSync.existsSync(path.join(nestedPlatformCurrentRoot, this.getEmbeddedDotnetExecutableName()))) {
        return nestedPlatformRoot;
      }
      if (fsSync.existsSync(path.join(nestedPlatformRoot, this.getEmbeddedDotnetExecutableName()))) {
        return nestedPlatformRoot;
      }
      if (fsSync.existsSync(path.join(resolvedOverride, 'current', this.getEmbeddedDotnetExecutableName()))) {
        return resolvedOverride;
      }
    }

    return resolveDesktopRuntimeComponentContainerRoot('dotnet', this.getRuntimeProgramHome(), platform);
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

  getPortableRuntimeSelection(): PortableRuntimeSelection {
    if (app.isPackaged && !process.env.HAGICODE_PORTABLE_RUNTIME_ROOT?.trim()) {
      const selection = resolvePackagedPortableRuntimeSelection(
        process.resourcesPath,
        PathManager.PORTABLE_FIXED_REQUIRED_FILES,
      );

      if (selection.selectionSource === 'compatibility-flat-extra-root') {
        log.warn('[PathManager] Falling back to compatibility Steam runtime layout under extra/current:', {
          bundleRoot: selection.bundleRoot,
          runtimeRoot: selection.runtimeRoot,
        });
      }

      return selection;
    }

    return buildPortableRuntimeSelection(this.getPortableRuntimeBundleRoot());
  }

  getPortableRuntimeRoot(): string {
    return this.getPortableRuntimeSelection().runtimeRoot;
  }

  getPortableToolchainRoot(): string {
    const overrideRoot = process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT?.trim();
    if (overrideRoot) {
      return path.resolve(overrideRoot);
    }

    return resolveDesktopRuntimeComponentProgramRoot('node', this.getRuntimeProgramHome(), this.getCurrentPlatform());
  }

  getCodeServerPackagedRuntimeRoot(): string {
    return this.getVendoredRuntimePackagedRoot('code-server');
  }

  getCodeServerPackagedArchivePath(): string {
    return this.getVendoredRuntimePackagedArchivePath('code-server');
  }

  getCodeServerRuntimeHome(): string {
    return this.getVendoredRuntimeHome('code-server');
  }

  getCodeServerRuntimeRoot(): string {
    const overrideRoot = process.env.HAGICODE_CODE_SERVER_RUNTIME_ROOT?.trim();
    if (overrideRoot) {
      return resolveVendoredRuntimeOverrideRoot(overrideRoot);
    }

    return this.getVendoredRuntimeRoot('code-server');
  }

  getCodeServerRuntimeStagingRoot(): string {
    return this.getVendoredRuntimeStagingRoot('code-server');
  }

  getCodeServerRuntimeConfigPath(): string {
    return resolveCodeServerRuntimeConfigPath();
  }

  getPortableNodeRoot(): string {
    return this.buildPortableToolchainRuntimePaths().nodeRoot;
  }

  getPortableToolchainBinRoot(): string {
    return this.buildPortableToolchainRuntimePaths().toolchainBinRoot;
  }

  getPortableNodeBinRoot(): string {
    return this.buildPortableToolchainRuntimePaths().nodeBinRoot;
  }

  getPortableNpmGlobalBinRoot(): string {
    return this.getNodeMajorNpmGlobalPaths().npmGlobalBinRoot;
  }

  getPortableNodeExecutablePath(): string {
    return this.buildPortableToolchainRuntimePaths().nodeExecutablePath;
  }

  getPortableNpmExecutablePath(): string {
    return this.buildPortableToolchainRuntimePaths().npmExecutablePath;
  }

  getPortableManagedCliExecutablePath(commandName: 'openspec' | 'skills'): string | null {
    const paths = this.buildPortableToolchainRuntimePaths();
    const executableName = getCommandExecutableName(process.platform, commandName);
    const npmGlobalCandidate = path.join(this.getNodeMajorNpmGlobalPaths().npmGlobalBinRoot, executableName);
    if (fsSync.existsSync(npmGlobalCandidate)) {
      return npmGlobalCandidate;
    }

    const legacyToolchainBinCandidate = path.join(paths.toolchainBinRoot, executableName);
    if (fsSync.existsSync(legacyToolchainBinCandidate)) {
      return legacyToolchainBinCandidate;
    }

    return null;
  }

  getPortableOpenspecExecutablePath(): string | null {
    return this.getPortableManagedCliExecutablePath('openspec');
  }

  getPortableToolchainManifestPath(): string {
    return this.buildPortableToolchainRuntimePaths().toolchainManifestPath;
  }

  getPortableSkillsExecutablePath(): string | null {
    return this.getPortableManagedCliExecutablePath('skills');
  }

  getEmbeddedNodeRuntimeManifestPath(): string {
    return getPinnedNodeRuntimeConfigPath();
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
