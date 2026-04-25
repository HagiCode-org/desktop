import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import log from 'electron-log';
import Store from 'electron-store';
import { PathManager } from './path-manager.js';
import { getCommandExecutableName } from './embedded-node-runtime-config.js';
import { shouldUseShellForCommand } from './toolchain-launch.js';
import { injectPortableToolchainEnv, resolvePathEnvKey } from './portable-toolchain-env.js';
import { BundledNodeRuntimeManager } from './bundled-node-runtime-manager.js';
import type { BundledNodeRuntimePolicyDecision } from './bundled-node-runtime-policy.js';
import { DevNodeRuntimeManager, type DevNodeRuntimeStatus } from './dev-node-runtime-manager.js';
import { managedNpmPackages, findManagedNpmPackage } from '../shared/npm-managed-packages.js';
import type {
  ManagedNpmPackageDefinition,
  ManagedNpmPackageId,
  ManagedNpmPackageStatusSnapshot,
  NpmManagementBatchSyncRequest,
  NpmManagementBatchSyncResult,
  NpmEnvironmentComponent,
  NpmManagementEnvironmentStatus,
  NpmMirrorSettings,
  NpmMirrorSettingsInput,
  NpmManagementOperation,
  NpmManagementOperationProgress,
  NpmManagementOperationResult,
  NpmManagementSnapshot,
} from '../types/npm-management.js';

interface NpmManagementServiceOptions {
  pathManager?: PathManager;
  spawnProcess?: typeof spawn;
  existsSync?: (targetPath: string) => boolean;
  platform?: NodeJS.Platform;
  settingsStore?: Store<NpmManagementSettingsStoreSchema>;
}

interface NpmManagementSettingsStoreSchema {
  mirrorSettings: NpmMirrorSettingsInput;
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface ManagedNpmPackagePaths {
  packageRoot: string;
  executablePath: string;
}

type ProgressListener = (event: NpmManagementOperationProgress) => void;

export const NPM_MIRROR_REGISTRY_URL = 'https://registry.npmmirror.com/';
export const NPM_DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org/';

const DEFAULT_MIRROR_SETTINGS: NpmMirrorSettingsInput = {
  enabled: false,
};

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();
}

function firstMeaningfulLine(input: string): string | null {
  const line = stripAnsi(input)
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0);

  return line ?? null;
}

function extractPercent(message: string): number | undefined {
  const match = message.match(/(?:^|\s)(\d{1,3})%(?:\s|$)/);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined;
}

function normalizeVersionOutput(value: string): string | null {
  const line = firstMeaningfulLine(value);
  return line ? line.replace(/^v/, '') : null;
}

export class NpmManagementService {
  private readonly pathManager: PathManager;
  private readonly spawnProcess: typeof spawn;
  private readonly existsSync: (targetPath: string) => boolean;
  private readonly platform: NodeJS.Platform;
  private readonly settingsStore: Store<NpmManagementSettingsStoreSchema>;
  private readonly bundledNodeRuntimeManager: BundledNodeRuntimeManager;
  private readonly devNodeRuntimeManager: DevNodeRuntimeManager;
  private readonly events = new EventEmitter();
  private activeOperation: NpmManagementOperationProgress | null = null;

  constructor(options: NpmManagementServiceOptions = {}) {
    this.pathManager = options.pathManager ?? PathManager.getInstance();
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.existsSync = options.existsSync ?? fsSync.existsSync;
    this.platform = options.platform ?? process.platform;
    this.bundledNodeRuntimeManager = new BundledNodeRuntimeManager(this.pathManager);
    this.devNodeRuntimeManager = new DevNodeRuntimeManager();
    this.settingsStore = options.settingsStore ?? new Store<NpmManagementSettingsStoreSchema>({
      name: 'npm-management',
      defaults: {
        mirrorSettings: DEFAULT_MIRROR_SETTINGS,
      },
    });
  }

  onProgress(listener: ProgressListener): () => void {
    this.events.on('progress', listener);
    return () => this.events.off('progress', listener);
  }

  async getSnapshot(): Promise<NpmManagementSnapshot> {
    const environment = await this.detectEnvironment();
    const packages = await Promise.all(managedNpmPackages.map((definition) => this.detectPackageStatus(definition, environment)));
    const mirrorSettings = this.getMirrorSettings();

    return {
      environment,
      packages,
      mirrorSettings,
      activeOperation: this.activeOperation,
      generatedAt: new Date().toISOString(),
    };
  }

  getMirrorSettings(): NpmMirrorSettings {
    return this.normalizeMirrorSettings(this.settingsStore.get('mirrorSettings', DEFAULT_MIRROR_SETTINGS));
  }

  async setMirrorSettings(input: NpmMirrorSettingsInput): Promise<NpmManagementSnapshot> {
    this.settingsStore.set('mirrorSettings', {
      enabled: Boolean(input.enabled),
    });
    return this.getSnapshot();
  }

  async install(packageId: string): Promise<NpmManagementOperationResult> {
    return this.runPackageOperation(packageId, 'install');
  }

  async syncPackages(request: NpmManagementBatchSyncRequest): Promise<NpmManagementBatchSyncResult> {
    const validation = this.resolvePackageDefinitions(request.packageIds, 'sync');
    if (!validation.success) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageIds: request.packageIds,
        operation: 'sync',
        statuses: [],
        error: validation.error,
        snapshot,
      };
    }

    const definitions = validation.definitions.filter((definition) => definition.id !== 'hagiscript');
    if (definitions.length === 0) {
      const snapshot = await this.getSnapshot();
      return {
        success: true,
        packageIds: [],
        operation: 'sync',
        statuses: [],
        snapshot,
      };
    }

    return this.runHagiscriptSync(definitions);
  }

  async uninstall(packageId: string): Promise<NpmManagementOperationResult> {
    const definition = findManagedNpmPackage(packageId);
    if (definition?.required) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageId: definition.id,
        operation: 'uninstall',
        error: `${definition.displayName} is a required managed tool and cannot be removed.`,
        snapshot,
      };
    }

    return this.runPackageOperation(packageId, 'uninstall');
  }

  private resolvePackageDefinitions(
    packageIds: readonly string[],
    operation: NpmManagementOperation,
  ): { success: true; definitions: ManagedNpmPackageDefinition[] } | { success: false; error: string } {
    const definitions: ManagedNpmPackageDefinition[] = [];
    const seen = new Set<ManagedNpmPackageId>();

    for (const packageId of packageIds) {
      const definition = findManagedNpmPackage(packageId);
      if (!definition) {
        return { success: false, error: `Unknown managed npm package: ${packageId}` };
      }

      if (operation === 'sync' && definition.installMode !== 'hagiscript-sync') {
        return { success: false, error: `${definition.displayName} cannot be synchronized through hagiscript npm--sync.` };
      }

      if (!seen.has(definition.id)) {
        definitions.push(definition);
        seen.add(definition.id);
      }
    }

    return { success: true, definitions };
  }

  private getNpmGlobalPrefix(
    activationPolicy?: BundledNodeRuntimePolicyDecision,
    devStatus?: DevNodeRuntimeStatus,
  ): string {
    if (!activationPolicy?.enabled && devStatus?.available) {
      return path.join(devStatus.runtimeRoot, 'npm-global');
    }

    return path.join(this.pathManager.getPortableToolchainRoot(), 'npm-global');
  }

  private getNpmCacheRoot(
    activationPolicy?: BundledNodeRuntimePolicyDecision,
    devStatus?: DevNodeRuntimeStatus,
  ): string {
    if (!activationPolicy?.enabled && devStatus?.available) {
      return path.join(devStatus.runtimeRoot, 'npm-cache');
    }

    return path.join(this.pathManager.getPortableToolchainRoot(), 'npm-cache');
  }

  private getNpmGlobalBinRoot(npmGlobalPrefix: string): string {
    return this.platform === 'win32' ? npmGlobalPrefix : path.join(npmGlobalPrefix, 'bin');
  }

  private getNpmGlobalModulesRoot(npmGlobalPrefix: string): string {
    return this.platform === 'win32'
      ? path.join(npmGlobalPrefix, 'node_modules')
      : path.join(npmGlobalPrefix, 'lib', 'node_modules');
  }

  private getManagedPackagePaths(
    definition: ManagedNpmPackageDefinition,
    environment: NpmManagementEnvironmentStatus,
  ): ManagedNpmPackagePaths {
    const packageRoot = path.join(
      this.getNpmGlobalModulesRoot(environment.npmGlobalPrefix),
      ...definition.packageName.split('/').filter(Boolean),
    );
    const executableName = getCommandExecutableName(this.platform, definition.binName);

    return {
      packageRoot,
      executablePath: path.join(environment.npmGlobalBinRoot, executableName),
    };
  }

  private async removeManagedPackageInstallTarget(
    definition: ManagedNpmPackageDefinition,
    environment: NpmManagementEnvironmentStatus,
  ): Promise<void> {
    const paths = this.getManagedPackagePaths(definition, environment);
    await fs.rm(paths.packageRoot, { recursive: true, force: true });
    await fs.rm(paths.executablePath, { force: true });
  }

  private normalizeMirrorSettings(input?: Partial<NpmMirrorSettingsInput> | null): NpmMirrorSettings {
    const enabled = Boolean(input?.enabled ?? DEFAULT_MIRROR_SETTINGS.enabled);
    return {
      enabled,
      registryUrl: enabled ? NPM_MIRROR_REGISTRY_URL : null,
    };
  }

  private buildNpmOperationArgs(
    operation: NpmManagementOperation,
    environment: NpmManagementEnvironmentStatus,
    definition: ManagedNpmPackageDefinition,
    registryUrl?: string | null,
  ): string[] {
    if (operation === 'install') {
      const registryArgs = registryUrl
        ? ['--registry', registryUrl]
        : [];
      return ['install', '-g', '--prefix', environment.npmGlobalPrefix, ...registryArgs, definition.installSpec];
    }

    return ['uninstall', '-g', '--prefix', environment.npmGlobalPrefix, definition.packageName];
  }

  private buildHagiscriptSyncArgs(
    environment: NpmManagementEnvironmentStatus,
    definitions: readonly ManagedNpmPackageDefinition[],
    registryUrl?: string | null,
  ): string[] {
    const args = [
      'npm--sync',
      '--npm',
      environment.npm.executablePath,
      '--prefix',
      environment.npmGlobalPrefix,
    ];

    if (registryUrl) {
      args.push('--registry', registryUrl);
    }

    for (const definition of definitions) {
      args.push('--package', definition.installSpec);
    }

    return args;
  }

  private shouldRetryWithoutMirror(result: CommandResult, operation: NpmManagementOperation, mirrorSettings: NpmMirrorSettings): boolean {
    return operation === 'install' && Boolean(mirrorSettings.enabled && mirrorSettings.registryUrl) && result.exitCode !== 0;
  }

  private buildOfficialRegistryRetryEnv(environment: NpmManagementEnvironmentStatus, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const retryCacheRoot = path.join(path.dirname(environment.npmGlobalPrefix), 'npm-cache-official');

    return {
      ...baseEnv,
      npm_config_cache: retryCacheRoot,
      npm_config_prefer_online: 'true',
      npm_config_prefer_offline: 'false',
      npm_config_offline: 'false',
    };
  }

  private buildCommandEnv(
    activationPolicy?: BundledNodeRuntimePolicyDecision,
    devStatus?: DevNodeRuntimeStatus,
  ): NodeJS.ProcessEnv {
    const npmGlobalPrefix = this.getNpmGlobalPrefix(activationPolicy, devStatus);
    const envResult = injectPortableToolchainEnv(process.env, this.pathManager, {
      platform: this.platform,
      existsSync: this.existsSync,
      activationPolicy,
    });
    const pathKey = resolvePathEnvKey(envResult.env, this.platform);
    const devNodeBinRoot = !activationPolicy?.enabled && devStatus?.available && devStatus.nodeExecutablePath
      ? path.dirname(devStatus.nodeExecutablePath)
      : null;
    const pathValue = devNodeBinRoot
      ? [devNodeBinRoot, envResult.env[pathKey]].filter(Boolean).join(this.platform === 'win32' ? ';' : ':')
      : envResult.env[pathKey];
    const env: NodeJS.ProcessEnv = {
      ...envResult.env,
      [pathKey]: pathValue,
      npm_config_prefix: npmGlobalPrefix,
      NPM_CONFIG_PREFIX: npmGlobalPrefix,
      npm_config_globalconfig: path.join(npmGlobalPrefix, 'etc', 'npmrc'),
      npm_config_cache: this.getNpmCacheRoot(activationPolicy, devStatus),
    };

    // npm must see Desktop-owned global prefix/cache paths even when the user's PATH contains another Node/npm.
    if (envResult.markerInjected) {
      env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT = this.pathManager.getPortableToolchainRoot();
    } else {
      delete env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT;
    }

    return env;
  }

  private async getDesktopActivationPolicy(): Promise<BundledNodeRuntimePolicyDecision> {
    return this.bundledNodeRuntimeManager.getDesktopActivationPolicy();
  }

  private getNodeExecutablePath(
    activationPolicy: BundledNodeRuntimePolicyDecision,
    devStatus?: DevNodeRuntimeStatus,
  ): string {
    if (activationPolicy.enabled) {
      return this.pathManager.getPortableNodeExecutablePath();
    }

    if (devStatus?.available && devStatus.nodeExecutablePath) {
      return devStatus.nodeExecutablePath;
    }

    return process.env.npm_node_execpath?.trim() || 'node';
  }

  private getNpmExecutablePath(
    activationPolicy: BundledNodeRuntimePolicyDecision,
    devStatus?: DevNodeRuntimeStatus,
  ): string {
    if (activationPolicy.enabled) {
      return this.pathManager.getPortableNpmExecutablePath();
    }

    if (devStatus?.available && devStatus.npmExecutablePath) {
      return devStatus.npmExecutablePath;
    }

    return 'npm';
  }

  private async detectEnvironment(
    activationPolicy?: BundledNodeRuntimePolicyDecision,
  ): Promise<NpmManagementEnvironmentStatus> {
    const effectivePolicy = activationPolicy ?? await this.getDesktopActivationPolicy();
    const devStatus = effectivePolicy.enabled ? undefined : await this.devNodeRuntimeManager.verify();
    const toolchainRoot = this.pathManager.getPortableToolchainRoot();
    const npmGlobalPrefix = this.getNpmGlobalPrefix(effectivePolicy, devStatus);
    const commandEnv = this.buildCommandEnv(effectivePolicy, devStatus);
    const node = await this.detectExecutableVersion('node', this.getNodeExecutablePath(effectivePolicy, devStatus), ['--version'], commandEnv);
    const npm = await this.detectExecutableVersion('npm', this.getNpmExecutablePath(effectivePolicy, devStatus), ['--version'], commandEnv);
    const available = node.status === 'available' && npm.status === 'available';

    return {
      available,
      toolchainRoot,
      npmGlobalPrefix,
      npmGlobalBinRoot: this.getNpmGlobalBinRoot(npmGlobalPrefix),
      node,
      npm,
      error: available ? undefined : [node.message, npm.message].filter(Boolean).join('; '),
    };
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

  private async detectPackageStatus(
    definition: ManagedNpmPackageDefinition,
    environment: NpmManagementEnvironmentStatus,
  ): Promise<ManagedNpmPackageStatusSnapshot> {
    const { packageRoot, executablePath } = this.getManagedPackagePaths(definition, environment);

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
        message: version ? undefined : 'Installed package has no package.json version',
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
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

  private findPackageStatus(
    snapshot: NpmManagementSnapshot,
    packageId: ManagedNpmPackageId,
  ): ManagedNpmPackageStatusSnapshot | undefined {
    return snapshot.packages.find((item) => item.id === packageId);
  }

  private getHagiscriptStatus(snapshot: NpmManagementSnapshot): ManagedNpmPackageStatusSnapshot | undefined {
    return this.findPackageStatus(snapshot, 'hagiscript');
  }

  private validateHagiscriptDependency(snapshot: NpmManagementSnapshot): string | null {
    const hagiscriptStatus = this.getHagiscriptStatus(snapshot);
    if (!hagiscriptStatus || hagiscriptStatus.status === 'unknown') {
      return 'hagiscript status is unknown. Install or refresh hagiscript before managing other npm packages.';
    }

    if (hagiscriptStatus.status !== 'installed' || !hagiscriptStatus.executablePath) {
      return 'Install hagiscript before managing other npm packages.';
    }

    return null;
  }

  private async runPackageOperation(
    packageId: string,
    operation: NpmManagementOperation,
  ): Promise<NpmManagementOperationResult> {
    const definition = findManagedNpmPackage(packageId);
    if (!definition) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageId: packageId as ManagedNpmPackageId,
        operation,
        error: `Unknown managed npm package: ${packageId}`,
        snapshot,
      };
    }

    if (this.activeOperation) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageId: definition.id,
        operation,
        error: `Another npm operation is already active for ${this.activeOperation.packageId}`,
        snapshot,
      };
    }

    // Only hagiscript bootstraps through npm directly; every other install is delegated to hagiscript npm--sync.
    if (operation === 'install' && definition.installMode === 'hagiscript-sync') {
      const result = await this.runHagiscriptSync([definition]);
      return {
        success: result.success,
        packageId: definition.id,
        operation: 'install',
        status: this.findPackageStatus(result.snapshot, definition.id),
        error: result.error,
        snapshot: result.snapshot,
      };
    }

    const activationPolicy = await this.getDesktopActivationPolicy();
    const environment = await this.detectEnvironment(activationPolicy);
    if (!environment.available) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageId: definition.id,
        operation,
        error: environment.error ?? 'Embedded Node/npm environment is unavailable',
        snapshot,
      };
    }

    const mirrorSettings = this.getMirrorSettings();
    const args = this.buildNpmOperationArgs(operation, environment, definition, mirrorSettings.registryUrl);

    const mirrorSuffix = operation === 'install' && mirrorSettings.enabled && mirrorSettings.registryUrl
      ? ` using registry mirror ${mirrorSettings.registryUrl}`
      : '';
    this.emitProgress(definition.id, operation, 'started', `${operation} ${definition.displayName} started${mirrorSuffix}`, 0);

    let success = false;
    let errorMessage: string | undefined;
    try {
      const commandEnv = this.buildCommandEnv(activationPolicy, activationPolicy.enabled ? undefined : await this.devNodeRuntimeManager.verify());
      if (operation === 'install') {
        await this.removeManagedPackageInstallTarget(definition, environment);
      }
      let result = await this.runCommand(environment.npm.executablePath, args, (chunk) => {
        const message = firstMeaningfulLine(chunk);
        if (message) {
          this.emitProgress(definition.id, operation, 'output', message, extractPercent(message));
        }
      }, commandEnv);

      if (this.shouldRetryWithoutMirror(result, operation, mirrorSettings)) {
        this.emitProgress(definition.id, operation, 'output', `Registry mirror failed for ${definition.installSpec}; retrying with ${NPM_DEFAULT_REGISTRY_URL}`, undefined);
        await this.removeManagedPackageInstallTarget(definition, environment);
        result = await this.runCommand(
          environment.npm.executablePath,
          this.buildNpmOperationArgs(operation, environment, definition, NPM_DEFAULT_REGISTRY_URL),
          (chunk) => {
            const message = firstMeaningfulLine(chunk);
            if (message) {
              this.emitProgress(definition.id, operation, 'output', message, extractPercent(message));
            }
          },
          this.buildOfficialRegistryRetryEnv(environment, commandEnv),
        );
      }

      success = result.exitCode === 0;
      if (!success) {
        errorMessage = firstMeaningfulLine(result.stderr || result.stdout) ?? `npm exited with code ${result.exitCode}`;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    this.emitProgress(
      definition.id,
      operation,
      success ? 'completed' : 'failed',
      success ? `${operation} ${definition.displayName} completed` : (errorMessage ?? `${operation} ${definition.displayName} failed`),
      success ? 100 : undefined,
    );

    const snapshot = await this.getSnapshot();
    const status = snapshot.packages.find((item) => item.id === definition.id);
    return {
      success,
      packageId: definition.id,
      operation,
      status,
      error: errorMessage,
      snapshot,
    };
  }

  private async runHagiscriptSync(
    definitions: readonly ManagedNpmPackageDefinition[],
  ): Promise<NpmManagementBatchSyncResult> {
    const packageIds = definitions.map((definition) => definition.id);

    if (this.activeOperation) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageIds,
        operation: 'sync',
        statuses: [],
        error: `Another npm operation is already active for ${this.activeOperation.packageId}`,
        snapshot,
      };
    }

    const activationPolicy = await this.getDesktopActivationPolicy();
    const environment = await this.detectEnvironment(activationPolicy);
    if (!environment.available) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageIds,
        operation: 'sync',
        statuses: [],
        error: environment.error ?? 'Embedded Node/npm environment is unavailable',
        snapshot,
      };
    }

    const dependencySnapshot = await this.getSnapshot();
    const dependencyError = this.validateHagiscriptDependency(dependencySnapshot);
    if (dependencyError) {
      return {
        success: false,
        packageIds,
        operation: 'sync',
        statuses: [],
        error: dependencyError,
        snapshot: dependencySnapshot,
      };
    }

    const hagiscriptStatus = this.getHagiscriptStatus(dependencySnapshot);
    const hagiscriptExecutablePath = hagiscriptStatus?.executablePath;
    if (!hagiscriptExecutablePath) {
      return {
        success: false,
        packageIds,
        operation: 'sync',
        statuses: [],
        error: 'hagiscript executable path is unavailable. Refresh npm management status and retry.',
        snapshot: dependencySnapshot,
      };
    }

    const mirrorSettings = this.getMirrorSettings();
    const syncLabel = definitions.map((definition) => definition.displayName).join(', ');
    const mirrorSuffix = mirrorSettings.enabled && mirrorSettings.registryUrl
      ? ` using registry mirror ${mirrorSettings.registryUrl}`
      : '';
    for (const definition of definitions) {
      this.emitProgress(definition.id, 'sync', 'started', `sync ${definition.displayName} started${mirrorSuffix}`, 0);
    }

    let success = false;
    let errorMessage: string | undefined;
    try {
      const commandEnv = this.buildCommandEnv(activationPolicy, activationPolicy.enabled ? undefined : await this.devNodeRuntimeManager.verify());
      const result = await this.runCommand(
        hagiscriptExecutablePath,
        this.buildHagiscriptSyncArgs(environment, definitions, mirrorSettings.registryUrl),
        (chunk) => {
          const message = firstMeaningfulLine(chunk);
          if (message) {
            for (const definition of definitions) {
              this.emitProgress(definition.id, 'sync', 'output', message, extractPercent(message));
            }
          }
        },
        commandEnv,
      );

      success = result.exitCode === 0;
      if (!success) {
        errorMessage = firstMeaningfulLine(result.stderr || result.stdout) ?? `hagiscript npm--sync exited with code ${result.exitCode}`;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    for (const definition of definitions) {
      this.emitProgress(
        definition.id,
        'sync',
        success ? 'completed' : 'failed',
        success ? `sync ${definition.displayName} completed` : (errorMessage ?? `sync ${definition.displayName} failed`),
        success ? 100 : undefined,
      );
    }

    const snapshot = await this.getSnapshot();
    return {
      success,
      packageIds,
      operation: 'sync',
      statuses: snapshot.packages.filter((item) => packageIds.includes(item.id)),
      error: errorMessage,
      snapshot,
    };
  }

  private emitProgress(
    packageId: ManagedNpmPackageId,
    operation: NpmManagementOperation,
    stage: NpmManagementOperationProgress['stage'],
    message: string,
    percentage?: number,
  ): void {
    const event: NpmManagementOperationProgress = {
      packageId,
      operation,
      stage,
      message,
      percentage,
      timestamp: new Date().toISOString(),
    };

    this.activeOperation = stage === 'completed' || stage === 'failed' ? null : event;
    this.events.emit('progress', event);
  }

  private runCommand(
    command: string,
    args: string[],
    onOutput?: (chunk: string) => void,
    env: NodeJS.ProcessEnv = this.buildCommandEnv(),
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = this.spawnProcess(command, args, {
          env,
          shell: shouldUseShellForCommand(command, this.platform),
          windowsHide: true,
        });
      } catch (error) {
        reject(error);
        return;
      }

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString('utf8');
        stdout += chunk;
        onOutput?.(chunk);
      });

      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString('utf8');
        stderr += chunk;
        onOutput?.(chunk);
      });

      child.on('error', (error) => {
        log.warn('[NpmManagementService] npm command failed to launch:', error);
        reject(error);
      });

      child.on('close', (exitCode) => {
        resolve({ exitCode, stdout, stderr });
      });
    });
  }
}

export default NpmManagementService;
