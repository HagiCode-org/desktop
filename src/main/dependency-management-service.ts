import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import log from 'electron-log';
import Store from 'electron-store';
import { PathManager } from './path-manager.js';
import { resolveCommandLaunch } from './toolchain-launch.js';
import { executeCliStreaming } from './utils/cli-executor.js';
import { resolveManagedCliExecutablePath } from './managed-cli-executable-resolver.js';
import { type NodeMajorNpmGlobalPaths } from './portable-toolchain-paths.js';
import {
  managedNpmPackages,
  findManagedNpmPackage,
} from '../shared/npm-managed-packages.js';
import {
  onVendoredRuntimeActivationProgress,
} from './vendored-runtime-activation-state.js';
import type {
  ManagedNpmPackageDefinition,
  ManagedNpmPackageId,
  ManagedNpmPackageStatusSnapshot,
  NpmEnvironmentComponent,
  DependencyManagementEnvironmentStatus,
  NpmMirrorSettings,
  NpmMirrorSettingsInput,
  DependencyManagementSnapshot,
  VendoredRuntimeStatusSnapshot,
} from '../types/dependency-management.js';

interface DependencyManagementServiceOptions {
  pathManager?: PathManager;
  existsSync?: (targetPath: string) => boolean;
  platform?: NodeJS.Platform;
  settingsStore?: Store<DependencyManagementSettingsStoreSchema>;
}

interface DependencyManagementSettingsStoreSchema {
  mirrorSettings?: NpmMirrorSettingsInput;
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface ManagedNpmCommandContext {
  environment: DependencyManagementEnvironmentStatus;
  commandEnv: NodeJS.ProcessEnv;
  executablePath: string | null;
  packageStatus: ManagedNpmPackageStatusSnapshot | null;
}

interface ManagedNpmPackagePaths {
  packageRoot: string;
  executablePath: string;
}

interface InstalledPackageInventoryEntry {
  version: string | null;
  packageRoot: string | null;
}

export const NPM_MIRROR_REGISTRY_URL = 'https://registry.npmmirror.com/';

const DEFAULT_MIRROR_SETTINGS: NpmMirrorSettingsInput = {
  enabled: false,
};

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();
}

function normalizeCommandName(command: string): string {
  const normalized = command.replace(/\//g, '\\');
  const segments = normalized.split('\\');
  return (segments.length > 0 ? segments[segments.length - 1] : normalized).toLowerCase();
}

function getCommandExecutableName(platform: NodeJS.Platform, commandName: string): string {
  return platform === 'win32' ? `${commandName}.cmd` : commandName;
}

function firstMeaningfulLine(input: string): string | null {
  const line = stripAnsi(input)
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0);

  return line ?? null;
}

function normalizeVersionOutput(value: string): string | null {
  const line = firstMeaningfulLine(value);
  return line ? line.replace(/^v/, '') : null;
}

function isSinglePackageGlobalListCommand(command: string, args: readonly string[]): boolean {
  if (normalizeCommandName(command) !== 'npm') {
    return false;
  }

  return args.length >= 8
    && args[0] === 'list'
    && args[1] === '-g'
    && args[2] === '--prefix'
    && args[4] === '--json'
    && args[5] === '--long'
    && args[6] === '--depth=0'
    && typeof args[7] === 'string'
    && args[7].trim().length > 0;
}

function isExpectedMissingPackageInspectionResult(
  command: string,
  args: readonly string[],
  result: CommandResult,
): boolean {
  return result.exitCode === 1 && isSinglePackageGlobalListCommand(command, args);
}

function parseInstalledPackageInventoryEntry(
  rawInventory: string,
  packageName: string,
): InstalledPackageInventoryEntry | null {
  try {
    const parsed = JSON.parse(rawInventory) as {
      dependencies?: Record<string, { version?: unknown; path?: unknown } | undefined>;
    };
    const dependency = parsed.dependencies?.[packageName];
    if (!dependency || typeof dependency !== 'object') {
      return null;
    }

    return {
      version: typeof dependency.version === 'string' ? dependency.version : null,
      packageRoot: typeof dependency.path === 'string' ? dependency.path : null,
    };
  } catch {
    return null;
  }
}

export class DependencyManagementService {
  private readonly pathManager: PathManager;
  private readonly existsSync: (targetPath: string) => boolean;
  private readonly platform: NodeJS.Platform;
  private readonly settingsStore: Store<DependencyManagementSettingsStoreSchema>;

  constructor(options: DependencyManagementServiceOptions = {}) {
    this.pathManager = options.pathManager ?? PathManager.getInstance();
    this.existsSync = options.existsSync ?? fsSync.existsSync;
    this.platform = options.platform ?? process.platform;
    this.settingsStore = options.settingsStore ?? new Store<DependencyManagementSettingsStoreSchema>({
      name: 'npm-management',
    });
  }

  onVendoredRuntimeActivationProgress(
    listener: (event: import('../types/dependency-management.js').VendoredRuntimeActivationProgress) => void,
  ): () => void {
    return onVendoredRuntimeActivationProgress(listener);
  }

  async getSnapshot(): Promise<DependencyManagementSnapshot> {
    const environment = await this.detectEnvironment();
    const packages = await Promise.all(
      managedNpmPackages.map((definition) => this.detectPackageStatus(definition, environment)),
    );
    const vendoredRuntimes = await this.getVendoredRuntimeSnapshots();
    const mirrorSettings = this.getMirrorSettings();

    return {
      environment,
      packages,
      vendoredRuntimes,
      mirrorSettings,
      activeRuntimeActivation: null,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getVendoredRuntimeSnapshots(): Promise<VendoredRuntimeStatusSnapshot[]> {
    return [];
  }

  getMirrorSettings(): NpmMirrorSettings {
    if (!this.settingsStore.has('mirrorSettings')) {
      return this.getDefaultMirrorSettings();
    }

    return this.normalizeMirrorSettings(this.settingsStore.get('mirrorSettings'));
  }

  async setMirrorSettings(input: NpmMirrorSettingsInput): Promise<DependencyManagementSnapshot> {
    this.settingsStore.set('mirrorSettings', {
      enabled: Boolean(input.enabled),
    });
    return this.getSnapshot();
  }

  async getManagedCommandContext(packageId: ManagedNpmPackageId): Promise<ManagedNpmCommandContext> {
    const environment = await this.detectEnvironment();
    const commandEnv = this.buildCommandEnv(environment.nodeVersion);
    const definition = findManagedNpmPackage(packageId);

    if (!definition) {
      return {
        environment,
        commandEnv,
        executablePath: null,
        packageStatus: null,
      };
    }

    const packageStatus = await this.detectPackageStatus(definition, environment);
    return {
      environment,
      commandEnv,
      executablePath: packageStatus.executablePath,
      packageStatus,
    };
  }


  private getNodeMajorNpmGlobalPaths(
    nodeVersion?: string | null,
  ): NodeMajorNpmGlobalPaths {
    return this.pathManager.getNodeMajorNpmGlobalPaths({
      nodeVersion: nodeVersion ?? process.versions.node,
      platform: this.platform,
    });
  }

  private getNpmGlobalPrefix(nodeVersion?: string | null): string {
    return this.getNodeMajorNpmGlobalPaths(nodeVersion).npmGlobalPrefix;
  }

  private getNpmCacheRoot(nodeVersion?: string | null): string {
    return this.getNodeMajorNpmGlobalPaths(nodeVersion).npmCacheRoot;
  }

  private getNpmGlobalBinRoot(npmGlobalPrefix: string, nodeVersion?: string | null): string {
    return this.getNodeMajorNpmGlobalPaths(nodeVersion).npmGlobalPrefix === npmGlobalPrefix
      ? this.getNodeMajorNpmGlobalPaths(nodeVersion).npmGlobalBinRoot
      : this.platform === 'win32' ? npmGlobalPrefix : path.join(npmGlobalPrefix, 'bin');
  }

  private getNpmGlobalModulesRoot(npmGlobalPrefix: string, nodeVersion?: string | null): string {
    return this.getNodeMajorNpmGlobalPaths(nodeVersion).npmGlobalPrefix === npmGlobalPrefix
      ? this.getNodeMajorNpmGlobalPaths(nodeVersion).npmGlobalModulesRoot
      : this.platform === 'win32'
        ? path.join(npmGlobalPrefix, 'node_modules')
        : path.join(npmGlobalPrefix, 'lib', 'node_modules');
  }

  private getManagedPackageInstallPrefix(
    _definition: ManagedNpmPackageDefinition,
    environment: DependencyManagementEnvironmentStatus,
  ): string {
    return environment.npmGlobalPrefix;
  }

  private getManagedPackageBinRoot(
    definition: ManagedNpmPackageDefinition,
    environment: DependencyManagementEnvironmentStatus,
  ): string {
    const installPrefix = this.getManagedPackageInstallPrefix(definition, environment);
    return this.platform === 'win32' ? installPrefix : path.join(installPrefix, 'bin');
  }

  private async getManagedPackagePaths(
    definition: ManagedNpmPackageDefinition,
    environment: DependencyManagementEnvironmentStatus,
  ): Promise<ManagedNpmPackagePaths> {
    const installPrefix = this.getManagedPackageInstallPrefix(definition, environment);
    const packageRoot = path.join(
      this.getNpmGlobalModulesRoot(installPrefix, environment.nodeVersion),
      ...definition.packageName.split('/').filter(Boolean),
    );
    const executableName = getCommandExecutableName(this.platform, definition.binName);
    const staticExecutablePath = path.join(this.getManagedPackageBinRoot(definition, environment), executableName);

    return {
      packageRoot,
      executablePath: await resolveManagedCliExecutablePath({
        binName: definition.binName,
        platform: this.platform,
        staticExecutablePath,
      }),
    };
  }

  private normalizeMirrorSettings(input?: Partial<NpmMirrorSettingsInput> | null): NpmMirrorSettings {
    const enabled = Boolean(input?.enabled ?? DEFAULT_MIRROR_SETTINGS.enabled);
    return {
      enabled,
      registryUrl: enabled ? NPM_MIRROR_REGISTRY_URL : null,
    };
  }

  private getDefaultMirrorSettings(): NpmMirrorSettings {
    return this.normalizeMirrorSettings(DEFAULT_MIRROR_SETTINGS);
  }


  private buildExternalCommandEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };

    delete env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT;
    delete env.NODE;
    delete env.npm_execpath;
    delete env.npm_node_execpath;
    delete env.npm_config_prefix;
    delete env.NPM_CONFIG_PREFIX;
    delete env.npm_config_global_prefix;
    delete env.NPM_CONFIG_GLOBAL_PREFIX;
    delete env.npm_config_globalconfig;
    delete env.NPM_CONFIG_GLOBALCONFIG;
    delete env.NPM_CONFIG_GLOBAL_CONFIG;

    return env;
  }

  private buildCommandEnv(
    nodeVersion?: string | null,
  ): NodeJS.ProcessEnv {
    const env = this.buildExternalCommandEnv();
    env.npm_config_cache = this.getNpmCacheRoot(nodeVersion);
    return env;
  }

  private async detectEnvironment(): Promise<DependencyManagementEnvironmentStatus> {
    return this.detectExternalEnvironment();
  }

  private async detectExternalEnvironment(): Promise<DependencyManagementEnvironmentStatus> {
    const commandEnv = this.buildExternalCommandEnv();
    const inheritedNodeExecutable = process.env.npm_node_execpath?.trim() || 'node';
    const node = await this.detectExecutableVersion('node', inheritedNodeExecutable, ['--version'], commandEnv);
    const resolvedNodeExecutablePath = await this.resolveExternalNodeExecutablePath(commandEnv, inheritedNodeExecutable);
    const nodeVersion = node.version;
    const npm = await this.detectNpmVersion(commandEnv);
    const npmGlobalPrefix = await this.resolveExternalNpmGlobalPrefix(commandEnv);
    const npmGlobalModulesRoot = await this.resolveExternalNpmGlobalModulesRoot(
      commandEnv,
      npmGlobalPrefix,
      nodeVersion,
    );
    const npmCacheRoot = await this.resolveExternalNpmCacheRoot(commandEnv, npmGlobalPrefix);
    const npmGlobalBinRoot = npmGlobalPrefix
      ? this.getNpmGlobalBinRoot(npmGlobalPrefix, nodeVersion)
      : '';
    const available = node.status === 'available' && npm.status !== 'unavailable';

    return {
      available,
      source: 'externally-managed',
      toolchainRoot: resolvedNodeExecutablePath ? path.dirname(resolvedNodeExecutablePath) : '',
      nodeRuntimeRoot: resolvedNodeExecutablePath ? path.dirname(resolvedNodeExecutablePath) : '',
      nodeVersion,
      nodeMajorVersion: nodeVersion ? this.getNodeMajorNpmGlobalPaths(nodeVersion).nodeMajorVersion : '',
      npmGlobalPrefix,
      npmGlobalBinRoot,
      npmGlobalModulesRoot,
      npmCacheRoot,
      node: {
        ...node,
        executablePath: resolvedNodeExecutablePath ?? node.executablePath,
      },
      npm,
      error: available
        ? undefined
        : node.message ?? npm.message ?? 'External dependency mode is read-only and no usable global Node/npm environment was found.',
    };
  }

  private async resolveExternalNodeExecutablePath(
    env: NodeJS.ProcessEnv,
    executablePath: string,
  ): Promise<string | null> {
    if (path.isAbsolute(executablePath)) {
      return executablePath;
    }

    try {
      const result = await this.runCommand(executablePath, ['-p', 'process.execPath'], undefined, env);
      if (result.exitCode !== 0) {
        return null;
      }

      return firstMeaningfulLine(result.stdout);
    } catch {
      return null;
    }
  }

  private async resolveExternalNpmGlobalPrefix(
    env: NodeJS.ProcessEnv,
  ): Promise<string> {
    try {
      const result = await this.runNpmCommand(['prefix', '-g'], undefined, env);
      return firstMeaningfulLine(result.stdout) ?? '';
    } catch {
      return '';
    }
  }

  private async resolveExternalNpmGlobalModulesRoot(
    env: NodeJS.ProcessEnv,
    npmGlobalPrefix: string,
    nodeVersion?: string | null,
  ): Promise<string> {
    try {
      const result = await this.runNpmCommand(['root', '-g'], undefined, env);
      return firstMeaningfulLine(result.stdout) ?? this.getNpmGlobalModulesRoot(npmGlobalPrefix, nodeVersion);
    } catch {
      return npmGlobalPrefix ? this.getNpmGlobalModulesRoot(npmGlobalPrefix, nodeVersion) : '';
    }
  }

  private async resolveExternalNpmCacheRoot(
    env: NodeJS.ProcessEnv,
    npmGlobalPrefix: string,
  ): Promise<string> {
    try {
      const result = await this.runNpmCommand(['config', 'get', 'cache'], undefined, env);
      return firstMeaningfulLine(result.stdout) ?? '';
    } catch {
      return npmGlobalPrefix ? path.join(path.dirname(npmGlobalPrefix), 'npm-cache') : '';
    }
  }

  private async detectExecutableVersion(
    label: 'node' | 'npm',
    executablePath: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ): Promise<NpmEnvironmentComponent> {
    if (path.isAbsolute(executablePath) && !this.existsSync(executablePath)) {
      return {
        status: 'unavailable',
        executablePath,
        version: null,
        message: `${label} executable not found`,
      };
    }

    try {
      const result = await this.runCommand(executablePath, args, undefined, env);
      if (result.exitCode !== 0) {
        return {
          status: 'error',
          executablePath,
          version: null,
          message: firstMeaningfulLine(result.stderr || result.stdout) ?? `${label} exited with code ${result.exitCode}`,
        };
      }

      return {
        status: 'available',
        executablePath,
        version: normalizeVersionOutput(result.stdout || result.stderr),
      };
    } catch (error) {
      return {
        status: 'error',
        executablePath,
        version: null,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildNpmExecution(
    args: string[],
  ): { command: string; args: string[]; executablePath: string } {
    const executablePath = 'npm';
    return {
      command: executablePath,
      args: [...args],
      executablePath,
    };
  }

  private async detectNpmVersion(
    env: NodeJS.ProcessEnv,
  ): Promise<NpmEnvironmentComponent> {
    const execution = this.buildNpmExecution(['--version']);

    if (path.isAbsolute(execution.executablePath) && !this.existsSync(execution.executablePath)) {
      return {
        status: 'unavailable',
        executablePath: execution.executablePath,
        version: null,
        message: 'npm executable not found',
      };
    }

    try {
      const result = await this.runCommand(execution.command, execution.args, undefined, env);
      if (result.exitCode !== 0) {
        return {
          status: 'error',
          executablePath: execution.executablePath,
          version: null,
          message: firstMeaningfulLine(result.stderr || result.stdout) ?? `npm exited with code ${result.exitCode}`,
        };
      }

      return {
        status: 'available',
        executablePath: execution.executablePath,
        version: normalizeVersionOutput(result.stdout || result.stderr),
      };
    } catch (error) {
      return {
        status: 'error',
        executablePath: execution.executablePath,
        version: null,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private runNpmCommand(
    args: string[],
    onOutput?: (chunk: string) => void,
    env: NodeJS.ProcessEnv = this.buildCommandEnv(),
  ): Promise<CommandResult> {
    const execution = this.buildNpmExecution(args);
    return this.runCommand(execution.command, execution.args, onOutput, env);
  }

  private async detectPackageStatus(
    definition: ManagedNpmPackageDefinition,
    environment: DependencyManagementEnvironmentStatus,
  ): Promise<ManagedNpmPackageStatusSnapshot> {
    if (definition.externalCli) {
      return this.detectExternalCliStatus(definition, environment);
    }

    const { packageRoot, executablePath } = await this.getManagedPackagePaths(definition, environment);

    try {
      const raw = await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8');
      const packageJson = JSON.parse(raw) as { version?: unknown };
      const version = typeof packageJson.version === 'string' ? packageJson.version : null;

      return {
        id: definition.id,
        definition,
        status: 'installed',
        version,
        packageRoot,
        executablePath: this.existsSync(executablePath) ? executablePath : null,
        message: !version
          ? 'Installed package has no package.json version'
          : this.existsSync(executablePath)
            ? undefined
            : `Installed package executable is missing at ${executablePath}`,
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        const inventoryEntry = await this.detectInstalledPackageFromInventory(definition, environment);
        if (inventoryEntry) {
          return {
            id: definition.id,
            definition,
            status: 'installed',
            version: inventoryEntry.version,
            packageRoot: inventoryEntry.packageRoot ?? packageRoot,
            executablePath: this.existsSync(executablePath) ? executablePath : null,
            message: inventoryEntry.packageRoot
              ? `Installed package was resolved from npm inventory at ${inventoryEntry.packageRoot}`
              : 'Installed package was resolved from npm inventory',
          };
        }

        return {
          id: definition.id,
          definition,
          status: 'not-installed',
          version: null,
          packageRoot,
          executablePath: null,
        };
      }

      return {
        id: definition.id,
        definition,
        status: 'unknown',
        version: null,
        packageRoot,
        executablePath: this.existsSync(executablePath) ? executablePath : null,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async detectExternalCliStatus(
    definition: ManagedNpmPackageDefinition,
    environment: DependencyManagementEnvironmentStatus,
  ): Promise<ManagedNpmPackageStatusSnapshot> {
    const commandEnv = this.buildExternalCommandEnv();
    const executablePath = await this.findExecutableOnPath(definition.binName, commandEnv);
    if (!executablePath) {
      return {
        id: definition.id,
        definition,
        status: 'not-installed',
        version: null,
        packageRoot: '',
        executablePath: null,
        message: `${definition.displayName} executable '${definition.binName}' was not found on PATH.`,
      };
    }

    try {
      const result = await this.runCommand(executablePath, definition.externalCli?.versionProbe ?? ['--version'], undefined, commandEnv);
      if (result.exitCode !== 0) {
        return {
          id: definition.id,
          definition,
          status: 'unknown',
          version: null,
          packageRoot: '',
          executablePath,
          message: firstMeaningfulLine(result.stderr || result.stdout)
            ?? `${definition.displayName} version probe exited with code ${result.exitCode}.`,
        };
      }
      return {
        id: definition.id,
        definition,
        status: 'installed',
        version: normalizeVersionOutput(result.stdout || result.stderr),
        packageRoot: '',
        executablePath,
      };
    } catch (error) {
      return {
        id: definition.id,
        definition,
        status: 'unknown',
        version: null,
        packageRoot: '',
        executablePath,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async findExecutableOnPath(binName: string, env: NodeJS.ProcessEnv): Promise<string | null> {
    try {
      const command = this.platform === 'win32' ? 'where.exe' : 'which';
      const result = await this.runCommand(command, [binName], undefined, env);
      return result.exitCode === 0 ? firstMeaningfulLine(result.stdout) : null;
    } catch {
      return null;
    }
  }

  private async detectInstalledPackageFromInventory(
    definition: ManagedNpmPackageDefinition,
    environment: DependencyManagementEnvironmentStatus,
  ): Promise<InstalledPackageInventoryEntry | null> {
    if (!environment.npmGlobalPrefix || !this.existsSync(environment.npmGlobalPrefix)) {
      return null;
    }

    try {
      const result = await this.runNpmCommand(
        [
          'list',
          '-g',
          '--prefix',
          environment.npmGlobalPrefix,
          '--json',
          '--long',
          '--depth=0',
          definition.packageName,
        ],
        undefined,
        this.buildCommandEnv(environment.nodeVersion),
      );
      const inventoryEntry = parseInstalledPackageInventoryEntry(result.stdout, definition.packageName);
      return inventoryEntry && (inventoryEntry.version || inventoryEntry.packageRoot)
        ? inventoryEntry
        : null;
    } catch {
      return null;
    }
  }

  private runCommand(
    command: string,
    args: string[],
    onOutput?: (chunk: string) => void,
    env: NodeJS.ProcessEnv = this.buildCommandEnv(),
    options: {
      shell?: boolean;
      timeoutMs?: number;
    } = {},
  ): Promise<CommandResult> {
    const launch = resolveCommandLaunch(command, this.platform);
    return executeCliStreaming({
      command: launch.command,
      args,
      env,
      shell: options.shell ?? launch.shell,
      timeoutMs: options.timeoutMs,
      windowsHide: true,
      metadata: { component: 'DependencyManagementService', command },
      onOutput: (_type, chunk) => {
        onOutput?.(chunk);
      },
    }).then((result) => {
      if (result.error?.kind === 'spawn') {
        log.warn('[DependencyManagementService] npm command failed to launch:', result.error.message);
      }

      if (result.exitCode !== 0 && !isExpectedMissingPackageInspectionResult(command, args, result)) {
        log.warn('[DependencyManagementService] npm command exited with code %d: %s %s', result.exitCode, command, args[0] ?? '');
      }

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    });
  }
}

export default DependencyManagementService;
