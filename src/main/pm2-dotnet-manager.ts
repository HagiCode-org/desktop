import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import log from 'electron-log';
import { resolvePathEnvKey } from './portable-toolchain-env.js';
import { executeCli } from './utils/cli-executor.js';
import { resolveCommandLaunch, shouldUseShellForCommand } from './toolchain-launch.js';

export const PM2_DOTNET_PROCESS_NAME = 'hagicode-dotnet-service';
export const PM2_RUNTIME_DIR_NAME = 'pm2-dotnet-service';
export const PM2_ENV_FILE_NAME = '.env';
export const PM2_ECOSYSTEM_FILE_NAME = 'ecosystem.config.js';

export type Pm2DotnetOperation = 'startOrReload' | 'start' | 'restart' | 'stop' | 'delete' | 'status';

export interface Pm2DotnetRuntimeConfig {
  processName?: string;
  dotnetPath: string;
  serviceDllPath: string;
  serviceWorkingDirectory: string;
  runtimeFilesDirectory: string;
  args?: string[];
  env: NodeJS.ProcessEnv;
}

export interface Pm2DotnetRuntimeFiles {
  runtimeDirectory: string;
  envPath: string;
  ecosystemPath: string;
}

export interface Pm2CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface Pm2CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  windowsHide?: boolean;
}

export interface Pm2CommandExecutor {
  run(command: string, args: string[], options: Pm2CommandOptions): Promise<Pm2CommandResult>;
}

export interface Pm2DotnetManagerOptions {
  pm2Command?: string;
  processName?: string;
  commandExecutor?: Pm2CommandExecutor;
  platform?: NodeJS.Platform;
  statusRetryDelayMs?: number;
  statusRetryMaxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface Pm2LaunchPlan {
  command: string;
  argsPrefix: string[];
  shell: boolean;
}

export interface Pm2ProcessStatus {
  exists: boolean;
  online: boolean;
  pid: number | null;
  status: string | null;
  restartCount: number;
  uptime: number;
}

export type Pm2LifecycleResult =
  | {
      success: true;
      operation: Pm2DotnetOperation;
      status?: Pm2ProcessStatus;
      stdout: string;
      stderr: string;
    }
  | {
      success: false;
      operation: Pm2DotnetOperation;
      errorCode: 'pm2-unavailable' | 'pm2-command-failed' | 'pm2-malformed-output';
      message: string;
      stdout: string;
      stderr: string;
    };

const DEFAULT_PM2_STATUS_RETRY_DELAY_MS = 500;
const DEFAULT_PM2_STATUS_MAX_RETRIES = 3;

type Pm2StatusNormalizationResult =
  | {
      kind: 'status';
      status: Pm2ProcessStatus;
    }
  | {
      kind: 'bootstrap';
      summary: string;
    }
  | {
      kind: 'failure';
      failure: Pm2LifecycleResult;
    };

class DefaultPm2CommandExecutor implements Pm2CommandExecutor {
  async run(command: string, args: string[], options: Pm2CommandOptions): Promise<Pm2CommandResult> {
    const launch = options.shell ? resolveCommandLaunch(command) : { command, shell: false };
    const result = await executeCli({
      command: launch.command,
      args,
      cwd: options.cwd,
      env: options.env,
      shell: launch.shell,
      windowsHide: options.windowsHide ?? true,
      metadata: { component: 'Pm2DotnetManager', command },
    });

    if (result.error?.kind === 'spawn') {
      const error = new Error(result.error.message) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }

    return {
      code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
}

function quoteJs(value: string): string {
  return JSON.stringify(value);
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^"(.*)"$/, '$1');
}

function isAbsolutePathLike(value: string): boolean {
  return path.isAbsolute(value) || path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
}

function buildPathCandidates(basePath: string, ...segments: string[]): string[] {
  const candidates = new Set<string>();
  candidates.add(path.join(basePath, ...segments));
  candidates.add(path.posix.join(basePath, ...segments));
  candidates.add(path.win32.join(basePath, ...segments));
  return [...candidates];
}

function buildDirectoryCandidates(filePath: string): string[] {
  const candidates = new Set<string>();
  candidates.add(path.dirname(filePath));
  candidates.add(path.posix.dirname(filePath));
  candidates.add(path.win32.dirname(filePath));
  return [...candidates];
}

function resolveExistingPath(
  candidates: Iterable<string>,
  existsSync: (targetPath: string) => boolean,
): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveWindowsNodeExecutableFromPortableToolchainRoots(
  portableToolchainRoots: readonly string[],
  existsSync: (targetPath: string) => boolean,
): string | null {
  for (const toolchainRoot of portableToolchainRoots) {
    const trimmedRoot = toolchainRoot.trim();
    if (!trimmedRoot) {
      continue;
    }

    const nodeExecutablePath = resolveExistingPath(
      buildPathCandidates(trimmedRoot, 'node', 'node.exe'),
      existsSync,
    );
    if (nodeExecutablePath) {
      return nodeExecutablePath;
    }
  }

  return null;
}

function quotePm2Argument(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function quotePm2Arguments(values: string[]): string {
  return values.map(quotePm2Argument).join(' ');
}

function normalizeEnvValue(value: string | undefined): string {
  return value ?? '';
}

function collectPersistedPm2InlineEnv(env: NodeJS.ProcessEnv): Array<[string, string]> {
  const pathKey = resolvePathEnvKey(env);
  const pathValue = env[pathKey] ?? env.PATH ?? env.Path;
  const entries: Array<[string, string | undefined]> = [
    [pathKey, pathValue],
    ['DOTNET_ROOT', env.DOTNET_ROOT],
    ['DOTNET_MULTILEVEL_LOOKUP', env.DOTNET_MULTILEVEL_LOOKUP],
    ['HAGICODE_DOTNET_EXE', env.HAGICODE_DOTNET_EXE],
    ['HAGICODE_AGENT_CLI_PATH', env.HAGICODE_AGENT_CLI_PATH],
    ['HAGICODE_NPM_GLOBAL_PATH', env.HAGICODE_NPM_GLOBAL_PATH],
    ['PM2_HOME', env.PM2_HOME],
  ];

  return entries.filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0);
}

function isWindowsPm2Command(pm2Command: string): boolean {
  const baseName = path.win32.basename(stripWrappingQuotes(pm2Command)).toLowerCase();
  return baseName === 'pm2' || baseName === 'pm2.cmd';
}

function resolveWindowsPm2LaunchFromNodeExecutable(
  nodeExecutablePath: string,
  existsSync: (targetPath: string) => boolean,
): { command: string; argsPrefix: string[] } | null {
  if (!isAbsolutePathLike(nodeExecutablePath) || !existsSync(nodeExecutablePath)) {
    return null;
  }

  const pm2CliPath = resolveExistingPath(
    buildDirectoryCandidates(nodeExecutablePath).flatMap((nodeDirectory) =>
      buildPathCandidates(nodeDirectory, 'node_modules', 'pm2', 'bin', 'pm2'),
    ),
    existsSync,
  );
  if (!pm2CliPath) {
    return null;
  }

  return {
    command: nodeExecutablePath,
    argsPrefix: [pm2CliPath],
  };
}

function resolveWindowsPm2LaunchFromEnvironment(
  pm2Command: string,
  env: NodeJS.ProcessEnv | undefined,
  existsSync: (targetPath: string) => boolean,
  portableToolchainRoots: readonly string[] = [],
): { command: string; argsPrefix: string[] } | null {
  if (!env || !isWindowsPm2Command(pm2Command)) {
    return null;
  }

  const mergedPortableToolchainRoots = new Set<string>();
  const envPortableToolchainRoot = env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT?.trim();
  if (envPortableToolchainRoot) {
    mergedPortableToolchainRoots.add(envPortableToolchainRoot);
  }
  for (const toolchainRoot of portableToolchainRoots) {
    const trimmedRoot = toolchainRoot.trim();
    if (trimmedRoot) {
      mergedPortableToolchainRoots.add(trimmedRoot);
    }
  }

  const preferredNodeExecutable = [env.npm_node_execpath, env.NODE]
    .map(value => value?.trim())
    .find((value): value is string => Boolean(value));
  const managedNpmGlobalPath = env.HAGICODE_NPM_GLOBAL_PATH?.trim();
  if (managedNpmGlobalPath) {
    const pm2CliPath = resolveExistingPath(
      buildPathCandidates(managedNpmGlobalPath, 'node_modules', 'pm2', 'bin', 'pm2'),
      existsSync,
    );
    if (pm2CliPath) {
      if (preferredNodeExecutable && isAbsolutePathLike(preferredNodeExecutable) && existsSync(preferredNodeExecutable)) {
        return {
          command: preferredNodeExecutable,
          argsPrefix: [pm2CliPath],
        };
      }

      const bundledNodeExecutable = resolveWindowsNodeExecutableFromPortableToolchainRoots(
        [...mergedPortableToolchainRoots],
        existsSync,
      );
      if (bundledNodeExecutable) {
        return {
          command: bundledNodeExecutable,
          argsPrefix: [pm2CliPath],
        };
      }
    }
  }

  if (preferredNodeExecutable) {
    const resolved = resolveWindowsPm2LaunchFromNodeExecutable(preferredNodeExecutable, existsSync);
    if (resolved) {
      return resolved;
    }
  }

  const portableToolchainRoot = envPortableToolchainRoot;
  if (!portableToolchainRoot) {
    return null;
  }

  const nodeExecutablePath = resolveExistingPath(
    buildPathCandidates(portableToolchainRoot, 'node', 'node.exe'),
    existsSync,
  );
  return nodeExecutablePath
    ? resolveWindowsPm2LaunchFromNodeExecutable(nodeExecutablePath, existsSync)
    : null;
}

function resolveWindowsPm2LaunchFromPortableToolchainRoots(
  pm2Command: string,
  portableToolchainRoots: readonly string[],
  existsSync: (targetPath: string) => boolean,
): { command: string; argsPrefix: string[] } | null {
  if (!isWindowsPm2Command(pm2Command)) {
    return null;
  }

  for (const toolchainRoot of portableToolchainRoots) {
    const trimmedRoot = toolchainRoot.trim();
    if (!trimmedRoot) {
      continue;
    }

    const nodeExecutablePath = resolveExistingPath(
      buildPathCandidates(trimmedRoot, 'node', 'node.exe'),
      existsSync,
    );
    const resolved = nodeExecutablePath
      ? resolveWindowsPm2LaunchFromNodeExecutable(nodeExecutablePath, existsSync)
      : null;
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function resolveDefaultPortableToolchainRoots(): string[] {
  const roots = new Set<string>();
  const envRoot = process.env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT?.trim();
  if (envRoot) {
    roots.add(envRoot);
  }

  roots.add(path.resolve(process.cwd(), 'resources', 'toolchain'));

  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath.trim() : '';
  if (resourcesPath) {
    roots.add(path.join(resourcesPath, 'extra', 'toolchain'));
  }

  return [...roots];
}

function resolveWindowsPm2NodeLaunch(
  pm2Command: string,
  existsSync: (targetPath: string) => boolean,
): { command: string; argsPrefix: string[] } | null {
  const normalizedCommand = stripWrappingQuotes(pm2Command);
  if (!isAbsolutePathLike(normalizedCommand) || !isWindowsPm2Command(normalizedCommand)) {
    return null;
  }

  for (const commandDirectory of buildDirectoryCandidates(normalizedCommand)) {
    const nodeExecutablePath = resolveExistingPath(
      buildPathCandidates(commandDirectory, 'node.exe'),
      existsSync,
    );
    if (!nodeExecutablePath) {
      continue;
    }

    const resolved = resolveWindowsPm2LaunchFromNodeExecutable(nodeExecutablePath, existsSync);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export function buildPm2EnvFile(env: NodeJS.ProcessEnv): string {
  return Object.entries(env)
    .filter(([key, value]) => key.trim().length > 0 && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${normalizeEnvValue(value).replace(/\r?\n/g, '\\n')}`)
    .join('\n') + '\n';
}

export function buildPm2EcosystemConfig(config: Pm2DotnetRuntimeConfig): string {
  if (!isAbsolutePathLike(config.dotnetPath)) {
    throw new Error(`PM2-managed .NET services require an absolute dotnetPath. Received: ${config.dotnetPath}`);
  }

  const processName = config.processName ?? PM2_DOTNET_PROCESS_NAME;
  const args = [config.serviceDllPath, ...(config.args ?? [])];
  const envPath = path.join(config.runtimeFilesDirectory, PM2_ENV_FILE_NAME);
  const inlineEnvEntries: Array<[string, string]> = [
    ['HAGICODE_PM2_ENV_FILE', envPath],
    ...collectPersistedPm2InlineEnv(config.env),
  ];
  const inlineEnvLines = inlineEnvEntries.map(([key, value], index) => (
    `        ${quoteJs(key)}: ${quoteJs(value)}${index === inlineEnvEntries.length - 1 ? '' : ','}`
  ));

  return [
    'module.exports = {',
    '  apps: [',
    '    {',
    `      name: ${quoteJs(processName)},`,
    `      script: ${quoteJs(config.dotnetPath)},`,
    `      args: ${quoteJs(quotePm2Arguments(args))},`,
    `      cwd: ${quoteJs(config.serviceWorkingDirectory)},`,
    '      interpreter: "none",',
    '      exec_mode: "fork",',
    '      autorestart: true,',
    '      watch: false,',
    `      env_file: ${quoteJs(envPath)},`,
    '      env: {',
    ...inlineEnvLines,
    '      }',
    '    }',
    '  ]',
    '};',
    '',
  ].join('\n');
}

function buildSpawnOptions(
  cwd: string,
  env: NodeJS.ProcessEnv,
  command: string,
  shellOverride?: boolean,
): Pm2CommandOptions {
  return {
    cwd,
    env,
    shell: shellOverride ?? shouldUseShellForCommand(command),
    windowsHide: true,
  };
}

export function resolvePm2LaunchPlan(
  pm2Command: string,
  options: {
    platform?: NodeJS.Platform;
    existsSync?: (targetPath: string) => boolean;
    env?: NodeJS.ProcessEnv;
    portableToolchainRoots?: string[];
  } = {},
): Pm2LaunchPlan {
  const platform = options.platform ?? process.platform;
  const existsSync = options.existsSync ?? fsSync.existsSync;
  const normalizedCommand = stripWrappingQuotes(pm2Command);

  if (platform === 'win32') {
    const candidatePortableToolchainRoots = options.portableToolchainRoots ?? resolveDefaultPortableToolchainRoots();
    const envLaunch = resolveWindowsPm2LaunchFromEnvironment(
      normalizedCommand,
      options.env,
      existsSync,
      candidatePortableToolchainRoots,
    );
    if (envLaunch) {
      return {
        command: envLaunch.command,
        argsPrefix: envLaunch.argsPrefix,
        shell: false,
      };
    }
    const nodeLaunch = resolveWindowsPm2NodeLaunch(normalizedCommand, existsSync);
    if (nodeLaunch) {
      return {
        command: nodeLaunch.command,
        argsPrefix: nodeLaunch.argsPrefix,
        shell: false,
      };
    }
    const portableLaunch = resolveWindowsPm2LaunchFromPortableToolchainRoots(
      normalizedCommand,
      candidatePortableToolchainRoots,
      existsSync,
    );
    if (portableLaunch) {
      return {
        command: portableLaunch.command,
        argsPrefix: portableLaunch.argsPrefix,
        shell: false,
      };
    }
  }

  return {
    command: normalizedCommand,
    argsPrefix: [],
    shell: shouldUseShellForCommand(normalizedCommand, platform),
  };
}

function summarizeOutput(primary: string, secondary = '', fallback = 'PM2 command failed without output.'): string {
  return [primary, secondary]
    .flatMap(value => value.trim().split(/\r?\n/))
    .map(line => line.trim())
    .find(Boolean)
    ?? fallback;
}

function summarizeFailure(operation: Pm2DotnetOperation, result: Pm2CommandResult): string {
  const detail = summarizeOutput(result.stderr, result.stdout);
  if (operation === 'status') {
    return `PM2 status failed while querying the PM2 process list: ${detail}`;
  }
  return `PM2 ${operation} failed: ${detail}`;
}

function normalizeMissingExecutable(operation: Pm2DotnetOperation, error: unknown): Pm2LifecycleResult {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const message = code === 'ENOENT'
    ? 'PM2 is unavailable. Install PM2 or ensure the bundled desktop toolchain exposes the pm2 executable.'
    : `PM2 ${operation} could not be executed: ${error instanceof Error ? error.message : String(error)}`;

  return {
    success: false,
    operation,
    errorCode: 'pm2-unavailable',
    message,
    stdout: '',
    stderr: error instanceof Error ? error.message : String(error),
  };
}

function buildPm2MalformedStatusResult(message: string, stdout: string, stderr: string): Pm2LifecycleResult {
  return {
    success: false,
    operation: 'status',
    errorCode: 'pm2-malformed-output',
    message,
    stdout,
    stderr,
  };
}

function isRetryablePm2BootstrapOutput(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`.trim().toLowerCase();
  if (!combined) {
    return false;
  }

  return [
    '[pm2] spawning',
    '[pm2] launching',
    '[pm2] starting',
    '[pm2] pm2 successfully daemonized',
    'spawning pm2 daemon',
    'pm2 home',
    'rpc socket',
    'pub socket',
    'daemon launched',
  ].some(marker => combined.includes(marker));
}

function parsePm2Jlist(stdout: string, stderr: string, processName: string): Pm2StatusNormalizationResult {
  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();

  if (!trimmedStdout) {
    if (!trimmedStderr) {
      return {
        kind: 'status',
        status: {
          exists: false,
          online: false,
          pid: null,
          status: null,
          restartCount: 0,
          uptime: 0,
        },
      };
    }

    if (isRetryablePm2BootstrapOutput(stdout, stderr)) {
      return {
        kind: 'bootstrap',
        summary: summarizeOutput(stdout, stderr, 'PM2 reported bootstrap output before JSON status was available.'),
      };
    }

    return {
      kind: 'failure',
      failure: buildPm2MalformedStatusResult(
        'PM2 status output was empty on stdout and could not be normalized from stderr.',
        stdout,
        stderr,
      ),
    };
  }

  try {
    const parsed = JSON.parse(trimmedStdout);
    if (!Array.isArray(parsed)) {
      return {
        kind: 'failure',
        failure: buildPm2MalformedStatusResult(
          'PM2 status output was not a JSON array.',
          stdout,
          stderr,
        ),
      };
    }

    const entry = parsed.find(item => item?.name === processName);
    if (!entry) {
      return {
        kind: 'status',
        status: {
          exists: false,
          online: false,
          pid: null,
          status: null,
          restartCount: 0,
          uptime: 0,
        },
      };
    }

    const pm2Env = entry.pm2_env ?? {};
    const status = typeof pm2Env.status === 'string' ? pm2Env.status : null;
    const pid = Number.isInteger(entry.pid) && entry.pid > 0 ? entry.pid : null;
    const restartCount = Number.isInteger(pm2Env.restart_time) ? pm2Env.restart_time : 0;
    const createdAt = typeof pm2Env.pm_uptime === 'number' ? pm2Env.pm_uptime : 0;
    const uptime = createdAt > 0 ? Math.max(0, Date.now() - createdAt) : 0;

    return {
      kind: 'status',
      status: {
        exists: true,
        online: status === 'online',
        pid,
        status,
        restartCount,
        uptime,
      },
    };
  } catch (error) {
    if (isRetryablePm2BootstrapOutput(stdout, stderr)) {
      return {
        kind: 'bootstrap',
        summary: summarizeOutput(stdout, stderr, 'PM2 reported bootstrap output before JSON status was available.'),
      };
    }

    return {
      kind: 'failure',
      failure: buildPm2MalformedStatusResult(
        `PM2 status output could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
        stdout,
        stderr,
      ),
    };
  }
}

export function buildPm2CommandArgs(operation: Pm2DotnetOperation, input: { ecosystemPath?: string; processName: string }): string[] {
  if (operation === 'startOrReload') {
    if (!input.ecosystemPath) {
      throw new Error('ecosystemPath is required for startOrReload');
    }
    return ['startOrReload', input.ecosystemPath, '--update-env'];
  }
  if (operation === 'start') {
    if (!input.ecosystemPath) {
      throw new Error('ecosystemPath is required for start');
    }
    return ['start', input.ecosystemPath, '--only', input.processName, '--update-env'];
  }
  if (operation === 'restart') {
    if (!input.ecosystemPath) {
      throw new Error('ecosystemPath is required for restart');
    }
    return ['reload', input.ecosystemPath, '--update-env'];
  }
  if (operation === 'stop') {
    return ['stop', input.processName];
  }
  if (operation === 'delete') {
    return ['delete', input.processName];
  }
  return ['jlist'];
}

export function resolveDefaultPm2Command(options: { cwd?: string; platform?: NodeJS.Platform; existsSync?: (targetPath: string) => boolean } = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const exists = options.existsSync ?? fsSync.existsSync;
  const executableName = platform === 'win32' ? 'pm2.cmd' : 'pm2';
  const localBin = resolveExistingPath(
    buildPathCandidates(cwd, 'node_modules', '.bin', executableName),
    exists,
  );

  return localBin ?? executableName;
}

export class Pm2DotnetManager {
  private readonly pm2Command: string;
  private readonly processName: string;
  private readonly commandExecutor: Pm2CommandExecutor;
  private readonly platform: NodeJS.Platform;
  private readonly statusRetryDelayMs: number;
  private readonly statusRetryMaxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private lastLifecycleEnv: NodeJS.ProcessEnv | null = null;

  constructor(options: Pm2DotnetManagerOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.pm2Command = options.pm2Command ?? resolveDefaultPm2Command({ platform: this.platform });
    this.processName = options.processName ?? PM2_DOTNET_PROCESS_NAME;
    this.commandExecutor = options.commandExecutor ?? new DefaultPm2CommandExecutor();
    this.statusRetryDelayMs = options.statusRetryDelayMs ?? DEFAULT_PM2_STATUS_RETRY_DELAY_MS;
    this.statusRetryMaxRetries = options.statusRetryMaxRetries ?? DEFAULT_PM2_STATUS_MAX_RETRIES;
    this.sleep = options.sleep ?? (async (ms: number) => { await new Promise(resolve => setTimeout(resolve, ms)); });
  }

  resolveRuntimeFiles(runtimeFilesDirectory: string): Pm2DotnetRuntimeFiles {
    return {
      runtimeDirectory: runtimeFilesDirectory,
      envPath: path.join(runtimeFilesDirectory, PM2_ENV_FILE_NAME),
      ecosystemPath: path.join(runtimeFilesDirectory, PM2_ECOSYSTEM_FILE_NAME),
    };
  }

  async writeRuntimeFiles(config: Pm2DotnetRuntimeConfig): Promise<Pm2DotnetRuntimeFiles> {
    const files = this.resolveRuntimeFiles(config.runtimeFilesDirectory);
    const runtimeConfig = { ...config, processName: config.processName ?? this.processName };

    await fs.mkdir(files.runtimeDirectory, { recursive: true });
    await fs.writeFile(files.envPath, buildPm2EnvFile(runtimeConfig.env), 'utf-8');
    await fs.writeFile(files.ecosystemPath, buildPm2EcosystemConfig(runtimeConfig), 'utf-8');

    log.info('[Pm2Dotnet] Runtime files generated:', {
      runtimeDirectory: files.runtimeDirectory,
      envPath: files.envPath,
      ecosystemPath: files.ecosystemPath,
      envKeyCount: Object.keys(runtimeConfig.env).length,
    });

    return files;
  }

  private getLifecycleCwd(config: Pm2DotnetRuntimeConfig): string {
    return config.serviceWorkingDirectory || config.runtimeFilesDirectory;
  }

  private rememberLifecycleEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    this.lastLifecycleEnv = env;
    return env;
  }

  private resolveLifecycleEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    if (env) {
      return this.rememberLifecycleEnv(env);
    }

    return this.lastLifecycleEnv ?? process.env;
  }

  private async runPm2(operation: Pm2DotnetOperation, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<Pm2LifecycleResult> {
    const pm2LaunchPlan = resolvePm2LaunchPlan(this.pm2Command, {
      env,
      platform: this.platform,
    });
    const spawnArgs = [...pm2LaunchPlan.argsPrefix, ...args];
    try {
      const result = await this.commandExecutor.run(
        pm2LaunchPlan.command,
        spawnArgs,
        buildSpawnOptions(cwd, env, pm2LaunchPlan.command, pm2LaunchPlan.shell),
      );
      if (result.code !== 0) {
        return {
          success: false,
          operation,
          errorCode: 'pm2-command-failed',
          message: summarizeFailure(operation, result),
          stdout: result.stdout,
          stderr: result.stderr,
        };
      }

      return {
        success: true,
        operation,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      return normalizeMissingExecutable(operation, error);
    }
  }

  async startOrReload(config: Pm2DotnetRuntimeConfig): Promise<Pm2LifecycleResult> {
    const files = await this.writeRuntimeFiles(config);
    const cwd = this.getLifecycleCwd(config);
    const env = this.rememberLifecycleEnv(config.env);
    const result = await this.runPm2(
      'startOrReload',
      buildPm2CommandArgs('startOrReload', { ecosystemPath: files.ecosystemPath, processName: this.processName }),
      cwd,
      env,
    );
    if (!result.success) {
      return result;
    }
    return await this.status(cwd, env);
  }

  async startFresh(config: Pm2DotnetRuntimeConfig): Promise<Pm2LifecycleResult> {
    const files = await this.writeRuntimeFiles(config);
    const cwd = this.getLifecycleCwd(config);
    const env = this.rememberLifecycleEnv(config.env);
    const currentStatus = await this.status(cwd, env);

    if (!currentStatus.success) {
      return currentStatus;
    }

    if (currentStatus.status?.exists) {
      log.info('[Pm2Dotnet] Existing PM2 dotnet service found; deleting before current-version start:', {
        processName: this.processName,
        status: currentStatus.status.status,
        cwd,
      });

      const deleteResult = await this.delete(cwd, env);
      if (!deleteResult.success) {
        return deleteResult;
      }
    }

    const result = await this.runPm2(
      'start',
      buildPm2CommandArgs('start', { ecosystemPath: files.ecosystemPath, processName: this.processName }),
      cwd,
      env,
    );
    if (!result.success) {
      return result;
    }
    return await this.status(cwd, env);
  }

  async restart(config: Pm2DotnetRuntimeConfig): Promise<Pm2LifecycleResult> {
    const files = await this.writeRuntimeFiles(config);
    const cwd = this.getLifecycleCwd(config);
    const env = this.rememberLifecycleEnv(config.env);
    const result = await this.runPm2(
      'restart',
      buildPm2CommandArgs('restart', { ecosystemPath: files.ecosystemPath, processName: this.processName }),
      cwd,
      env,
    );
    if (!result.success) {
      return result;
    }
    return await this.status(cwd, env);
  }

  async stop(cwd: string, env?: NodeJS.ProcessEnv): Promise<Pm2LifecycleResult> {
    const resolvedEnv = this.resolveLifecycleEnv(env);
    const result = await this.runPm2('stop', buildPm2CommandArgs('stop', { processName: this.processName }), cwd, resolvedEnv);
    if (!result.success && result.errorCode === 'pm2-command-failed' && /not found|doesn't exist|process or namespace/i.test(`${result.stderr}\n${result.stdout}`)) {
      return { success: true, operation: 'stop', stdout: result.stdout, stderr: result.stderr };
    }
    return result;
  }

  async delete(cwd: string, env?: NodeJS.ProcessEnv): Promise<Pm2LifecycleResult> {
    const resolvedEnv = this.resolveLifecycleEnv(env);
    const result = await this.runPm2('delete', buildPm2CommandArgs('delete', { processName: this.processName }), cwd, resolvedEnv);
    if (!result.success && result.errorCode === 'pm2-command-failed' && /not found|doesn't exist|process or namespace/i.test(`${result.stderr}\n${result.stdout}`)) {
      return { success: true, operation: 'delete', stdout: result.stdout, stderr: result.stderr };
    }
    return result;
  }

  async status(cwd: string, env?: NodeJS.ProcessEnv): Promise<Pm2LifecycleResult> {
    const resolvedEnv = this.resolveLifecycleEnv(env);
    const statusArgs = buildPm2CommandArgs('status', { processName: this.processName });

    for (let attempt = 0; attempt <= this.statusRetryMaxRetries; attempt++) {
      const result = await this.runPm2('status', statusArgs, cwd, resolvedEnv);
      if (!result.success) {
        return result;
      }

      const parsed = parsePm2Jlist(result.stdout, result.stderr, this.processName);
      if (parsed.kind === 'status') {
        return {
          ...result,
          status: parsed.status,
        };
      }

      if (parsed.kind === 'failure') {
        return parsed.failure;
      }

      const retriesRemaining = this.statusRetryMaxRetries - attempt;
      if (retriesRemaining <= 0) {
        return buildPm2MalformedStatusResult(
          `PM2 status output could not be normalized after ${attempt + 1} attempt${attempt === 0 ? '' : 's'} during PM2 bootstrap. Last PM2 output: ${parsed.summary}`,
          result.stdout,
          result.stderr,
        );
      }

      log.info('[Pm2Dotnet] PM2 status returned bootstrap output; retrying status query:', {
        processName: this.processName,
        cwd,
        attempt: attempt + 1,
        retriesRemaining,
        delayMs: this.statusRetryDelayMs,
        summary: parsed.summary,
      });
      await this.sleep(this.statusRetryDelayMs);
    }

    return buildPm2MalformedStatusResult(
      'PM2 status output could not be normalized after exhausting retries.',
      '',
      '',
    );
  }
}
