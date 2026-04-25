import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import log from 'electron-log';
import Store from 'electron-store';
import { PathManager } from './path-manager.js';
import { getCommandExecutableName, getNpmGlobalModulesRelativePath } from './embedded-node-runtime-config.js';
import { shouldUseShellForCommand } from './toolchain-launch.js';
import { injectPortableToolchainEnv, resolvePathEnvKey } from './portable-toolchain-env.js';
import { managedNpmPackages, findManagedNpmPackage } from '../shared/npm-managed-packages.js';
import type {
  ManagedNpmPackageDefinition,
  ManagedNpmPackageId,
  ManagedNpmPackageStatusSnapshot,
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

type ProgressListener = (event: NpmManagementOperationProgress) => void;

export const NPM_MIRROR_REGISTRY_URL = 'https://registry.npmmirror.com/';

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
  private readonly events = new EventEmitter();
  private activeOperation: NpmManagementOperationProgress | null = null;

  constructor(options: NpmManagementServiceOptions = {}) {
    this.pathManager = options.pathManager ?? PathManager.getInstance();
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.existsSync = options.existsSync ?? fsSync.existsSync;
    this.platform = options.platform ?? process.platform;
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
    const packages = await Promise.all(managedNpmPackages.map((definition) => this.detectPackageStatus(definition)));
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

  private getNpmGlobalPrefix(): string {
    return path.join(this.pathManager.getPortableToolchainRoot(), 'npm-global');
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
    mirrorSettings: NpmMirrorSettings,
  ): string[] {
    if (operation === 'install') {
      const registryArgs = mirrorSettings.enabled && mirrorSettings.registryUrl
        ? ['--registry', mirrorSettings.registryUrl]
        : [];
      return ['install', '-g', '--prefix', environment.npmGlobalPrefix, ...registryArgs, definition.installSpec];
    }

    return ['uninstall', '-g', '--prefix', environment.npmGlobalPrefix, definition.packageName];
  }

  private buildCommandEnv(): NodeJS.ProcessEnv {
    const npmGlobalPrefix = this.getNpmGlobalPrefix();
    const envResult = injectPortableToolchainEnv(process.env, this.pathManager, {
      platform: this.platform,
      existsSync: this.existsSync,
    });
    const pathKey = resolvePathEnvKey(envResult.env, this.platform);

    // npm must see Desktop-owned global prefix/cache paths even when the user's PATH contains another Node/npm.
    return {
      ...envResult.env,
      [pathKey]: envResult.env[pathKey],
      npm_config_prefix: npmGlobalPrefix,
      NPM_CONFIG_PREFIX: npmGlobalPrefix,
      npm_config_globalconfig: path.join(npmGlobalPrefix, 'etc', 'npmrc'),
      npm_config_cache: path.join(this.pathManager.getPortableToolchainRoot(), 'npm-cache'),
      HAGICODE_PORTABLE_TOOLCHAIN_ROOT: this.pathManager.getPortableToolchainRoot(),
    };
  }

  private async detectEnvironment(): Promise<NpmManagementEnvironmentStatus> {
    const toolchainRoot = this.pathManager.getPortableToolchainRoot();
    const node = await this.detectExecutableVersion('node', this.pathManager.getPortableNodeExecutablePath(), ['--version']);
    const npm = await this.detectExecutableVersion('npm', this.pathManager.getPortableNpmExecutablePath(), ['--version']);
    const available = node.status === 'available' && npm.status === 'available';

    return {
      available,
      toolchainRoot,
      npmGlobalPrefix: this.getNpmGlobalPrefix(),
      npmGlobalBinRoot: this.pathManager.getPortableNpmGlobalBinRoot(),
      node,
      npm,
      error: available ? undefined : [node.message, npm.message].filter(Boolean).join('; '),
    };
  }

  private async detectExecutableVersion(
    label: 'node' | 'npm',
    executablePath: string,
    args: string[],
  ): Promise<NpmEnvironmentComponent> {
    if (!this.existsSync(executablePath)) {
      return {
        status: 'unavailable',
        executablePath,
        version: null,
        message: `${label} executable not found`,
      };
    }

    try {
      const result = await this.runCommand(executablePath, args);
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

  private async detectPackageStatus(definition: ManagedNpmPackageDefinition): Promise<ManagedNpmPackageStatusSnapshot> {
    const packageRoot = path.join(
      this.pathManager.getPortableToolchainRoot(),
      getNpmGlobalModulesRelativePath(this.platform),
      ...definition.packageName.split('/').filter(Boolean),
    );
    const executableName = getCommandExecutableName(this.platform, definition.binName);
    const executablePath = path.join(this.pathManager.getPortableNpmGlobalBinRoot(), executableName);

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

    const environment = await this.detectEnvironment();
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
    const args = this.buildNpmOperationArgs(operation, environment, definition, mirrorSettings);

    const mirrorSuffix = operation === 'install' && mirrorSettings.enabled && mirrorSettings.registryUrl
      ? ` using registry mirror ${mirrorSettings.registryUrl}`
      : '';
    this.emitProgress(definition.id, operation, 'started', `${operation} ${definition.displayName} started${mirrorSuffix}`, 0);

    let success = false;
    let errorMessage: string | undefined;
    try {
      const result = await this.runCommand(environment.npm.executablePath, args, (chunk) => {
        const message = firstMeaningfulLine(chunk);
        if (message) {
          this.emitProgress(definition.id, operation, 'output', message, extractPercent(message));
        }
      });

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
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = this.spawnProcess(command, args, {
          env: this.buildCommandEnv(),
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
