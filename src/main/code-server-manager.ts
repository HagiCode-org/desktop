import fs from 'node:fs/promises';
import path from 'node:path';
import { app, shell } from 'electron';
import {
  inspectVendoredCodeServerRuntime,
  readCodeServerRuntimeConfig,
} from './code-server-runtime.js';
import type DependencyManagementService from './dependency-management-service.js';
import { buildPm2MajorHomePaths } from './portable-toolchain-paths.js';
import {
  injectCodeServerRuntimeEnv,
  injectManagedCliPathEnv,
  resolvePathEnvKey,
} from './portable-toolchain-env.js';
import { resolvePm2LaunchPlan } from './pm2-dotnet-manager.js';
import { resolveCommandLaunch } from './toolchain-launch.js';
import { executeCli } from './utils/cli-executor.js';
import { PathManager } from './path-manager.js';
import type {
  VendoredRuntimeHealthSnapshot,
  VendoredRuntimeLifecycleAction,
  VendoredRuntimeLifecycleResult,
  VendoredRuntimePathOpenResult,
  VendoredRuntimeStatusSnapshot,
} from '../types/dependency-management.js';

const PROCESS_NAME = 'hagicode-code-server';
const OUT_LOG_FILE = 'code-server-out.log';
const ERROR_LOG_FILE = 'code-server-error.log';

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface CodeServerManagedPaths {
  root: string;
  data: string;
  extensions: string;
  logs: string;
  runtime: string;
  ecosystemFile: string;
}

interface Pm2ListEntry {
  name?: string;
  pm2_env?: {
    status?: string;
  };
}

interface Pm2ContextSnapshot {
  executablePath: string | null;
  env: NodeJS.ProcessEnv | null;
  available: boolean;
  error?: string;
}

type Pm2ProcessStatus = 'online' | 'stopped' | 'errored' | 'unknown';

export class CodeServerManager {
  private readonly dependencyManagementService: DependencyManagementService;
  private readonly pathManager: PathManager;
  private readonly userDataPath: string;
  private readonly openPathImpl: (targetPath: string) => Promise<string>;
  private readonly runtimeConfig = readCodeServerRuntimeConfig();

  constructor(options: {
    dependencyManagementService: DependencyManagementService;
    pathManager?: PathManager;
    userDataPath?: string;
    openPath?: (targetPath: string) => Promise<string>;
  }) {
    this.dependencyManagementService = options.dependencyManagementService;
    this.pathManager = options.pathManager ?? PathManager.getInstance();
    this.userDataPath = options.userDataPath ?? app.getPath('userData');
    this.openPathImpl = options.openPath ?? ((targetPath) => shell.openPath(targetPath));
  }

  async getRuntimeSnapshots(): Promise<VendoredRuntimeStatusSnapshot[]> {
    return [await this.getRuntimeSnapshot()];
  }

  async getRuntimeSnapshot(): Promise<VendoredRuntimeStatusSnapshot> {
    await this.ensureLayout();
    const pm2 = await this.resolvePm2Context();
    const pm2ProcessStatus = await this.getPm2ProcessStatus(pm2);
    const health = await this.probeHealth(this.getBaseUrl(), pm2ProcessStatus);
    const snapshot = await inspectVendoredCodeServerRuntime(this.pathManager, { health });
    const diagnostics = [...snapshot.diagnostics];

    if (!pm2.available && pm2.error) {
      diagnostics.push(pm2.error);
    }
    if (pm2ProcessStatus === 'errored') {
      diagnostics.push('PM2 reports the vendored code-server process as errored.');
    }
    if (pm2ProcessStatus === 'online' && !health.reachable) {
      diagnostics.push('PM2 reports code-server online, but the local health probe failed.');
    }

    return {
      ...snapshot,
      diagnostics,
      health: {
        ...health,
        url: this.getBaseUrl(),
      },
      message: diagnostics[0] ?? snapshot.message,
    };
  }

  async start(): Promise<VendoredRuntimeLifecycleResult> {
    return this.runLifecycle('start');
  }

  async stop(): Promise<VendoredRuntimeLifecycleResult> {
    return this.runLifecycle('stop');
  }

  async restart(): Promise<VendoredRuntimeLifecycleResult> {
    return this.runLifecycle('restart');
  }

  async repair(): Promise<VendoredRuntimeLifecycleResult> {
    return this.runLifecycle('repair');
  }

  async openPath(target: 'logs' | 'runtime-root'): Promise<VendoredRuntimePathOpenResult> {
    const paths = await this.ensureLayout();
    const resolvedPath = target === 'logs' ? paths.logs : this.pathManager.getCodeServerRuntimeRoot();
    const result = await this.openPathImpl(resolvedPath);

    return {
      success: result.length === 0,
      runtimeId: 'code-server',
      target,
      path: resolvedPath,
      error: result.length > 0 ? result : undefined,
    };
  }

  private async runLifecycle(action: VendoredRuntimeLifecycleAction): Promise<VendoredRuntimeLifecycleResult> {
    try {
      if (action === 'repair') {
        return await this.runRepair();
      }

      const snapshot = await this.getRuntimeSnapshot();
      if (!snapshot.wrapperPath) {
        throw new Error(snapshot.message ?? 'Vendored code-server runtime is not ready.');
      }

      const paths = await this.ensureLayout();
      const pm2 = await this.resolvePm2Context();
      if (!pm2.available || !pm2.executablePath || !pm2.env) {
        throw new Error(pm2.error ?? 'Desktop-managed PM2 is unavailable.');
      }

      const runtimeEnv = injectCodeServerRuntimeEnv(pm2.env, this.pathManager, {
        platform: process.platform,
      });
      await this.renderEcosystem(paths, snapshot.wrapperPath, runtimeEnv.env);

      if (action === 'start') {
        await this.deletePm2Process(pm2.executablePath, pm2.env);
        await this.runPm2(pm2.executablePath, ['start', paths.ecosystemFile, '--only', PROCESS_NAME, '--update-env'], pm2.env);
      } else if (action === 'stop') {
        await this.stopPm2Process(pm2.executablePath, pm2.env);
      } else {
        const processStatus = await this.getPm2ProcessStatus(pm2);
        if (processStatus === 'online') {
          const restartResult = await this.runPm2(pm2.executablePath, ['restart', PROCESS_NAME, '--update-env'], pm2.env, true);
          if (restartResult.exitCode !== 0) {
            await this.deletePm2Process(pm2.executablePath, pm2.env);
            await this.runPm2(pm2.executablePath, ['start', paths.ecosystemFile, '--only', PROCESS_NAME, '--update-env'], pm2.env);
          }
        } else {
          await this.deletePm2Process(pm2.executablePath, pm2.env);
          await this.runPm2(pm2.executablePath, ['start', paths.ecosystemFile, '--only', PROCESS_NAME, '--update-env'], pm2.env);
        }
      }

      return {
        success: true,
        runtimeId: 'code-server',
        action,
        status: await this.getRuntimeSnapshot(),
      };
    } catch (error) {
      return {
        success: false,
        runtimeId: 'code-server',
        action,
        status: await this.fallbackSnapshot(error),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async runRepair(): Promise<VendoredRuntimeLifecycleResult> {
    if (app.isPackaged) {
      return {
        success: false,
        runtimeId: 'code-server',
        action: 'repair',
        status: await this.getRuntimeSnapshot(),
        error: 'Vendored code-server repair is only available in development builds. Reinstall Desktop to restore the packaged runtime.',
      };
    }

    const prepareScriptPath = path.resolve(process.cwd(), 'scripts', 'prepare-code-server-runtime.js');
    const result = await executeCli({
      command: process.execPath,
      args: [prepareScriptPath],
      env: {
        ...process.env,
      },
      shell: false,
      windowsHide: true,
      metadata: { component: 'CodeServerManager', command: 'prepare-code-server-runtime' },
    });

    if (result.exitCode !== 0) {
      return {
        success: false,
        runtimeId: 'code-server',
        action: 'repair',
        status: await this.getRuntimeSnapshot(),
        error: (result.stderr || result.stdout || 'Vendored code-server repair failed.').trim(),
      };
    }

    return {
      success: true,
      runtimeId: 'code-server',
      action: 'repair',
      status: await this.getRuntimeSnapshot(),
    };
  }

  private async fallbackSnapshot(error: unknown): Promise<VendoredRuntimeStatusSnapshot> {
    const health: VendoredRuntimeHealthSnapshot = {
      reachable: false,
      url: this.getBaseUrl(),
      lastCheckedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
    return inspectVendoredCodeServerRuntime(this.pathManager, { health });
  }

  private getBaseUrl(): string {
    const port = Number.parseInt(process.env.HAGICODE_CODE_SERVER_PORT ?? String(this.runtimeConfig.defaultPort), 10);
    return `http://127.0.0.1:${port}`;
  }

  private getPort(): string {
    return new URL(this.getBaseUrl()).port;
  }

  private async probeHealth(baseUrl: string, pm2Status: Pm2ProcessStatus): Promise<VendoredRuntimeHealthSnapshot> {
    try {
      const response = await fetch(baseUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(2000),
      });
      return {
        reachable: response.status < 500,
        url: baseUrl,
        lastCheckedAt: new Date().toISOString(),
        message: response.status < 500 ? undefined : `Health probe returned HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        reachable: false,
        url: baseUrl,
        lastCheckedAt: new Date().toISOString(),
        message: pm2Status === 'online'
          ? `PM2 reports code-server online, but the health probe failed: ${error instanceof Error ? error.message : String(error)}`
          : pm2Status === 'errored'
            ? 'PM2 reports code-server as errored.'
            : 'code-server is not running.',
      };
    }
  }

  private getPaths(): CodeServerManagedPaths {
    const root = path.join(this.userDataPath, 'CodeServer');
    const runtime = path.join(root, 'runtime');
    return {
      root,
      data: path.join(root, 'data'),
      extensions: path.join(root, 'extensions'),
      logs: path.join(root, 'logs'),
      runtime,
      ecosystemFile: path.join(runtime, 'ecosystem.config.cjs'),
    };
  }

  private async ensureLayout(): Promise<CodeServerManagedPaths> {
    const paths = this.getPaths();
    await Promise.all([
      fs.mkdir(paths.data, { recursive: true }),
      fs.mkdir(paths.extensions, { recursive: true }),
      fs.mkdir(paths.logs, { recursive: true }),
      fs.mkdir(paths.runtime, { recursive: true }),
    ]);
    return paths;
  }

  private async resolvePm2Context(): Promise<Pm2ContextSnapshot> {
    try {
      const pm2Context = await this.dependencyManagementService.getManagedCommandContext('pm2');
      if (!pm2Context.executablePath || pm2Context.packageStatus?.status !== 'installed') {
        return {
          executablePath: pm2Context.executablePath,
          env: null,
          available: false,
          error: 'Desktop-managed PM2 is unavailable. Install PM2 from Dependency Management first.',
        };
      }

      const env = await this.buildManagedPm2CommandEnv(pm2Context.commandEnv, pm2Context.environment);
      return {
        executablePath: pm2Context.executablePath,
        env,
        available: true,
      };
    } catch (error) {
      return {
        executablePath: null,
        env: null,
        available: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async buildManagedPm2CommandEnv(
    baseEnv: NodeJS.ProcessEnv,
    environment: {
      nodeVersion: string | null;
      nodeMajorVersion: string;
      npmGlobalPrefix: string;
      npmGlobalBinRoot: string;
      npmGlobalModulesRoot: string;
      npmCacheRoot: string;
    },
  ): Promise<NodeJS.ProcessEnv> {
    const managedCliEnv = injectManagedCliPathEnv(baseEnv, {
      platform: process.platform,
      npmGlobalPaths: {
        nodeVersion: environment.nodeVersion ?? process.versions.node,
        nodeMajorVersion: environment.nodeMajorVersion,
        npmGlobalPrefix: environment.npmGlobalPrefix,
        npmGlobalBinRoot: environment.npmGlobalBinRoot,
        npmGlobalModulesRoot: environment.npmGlobalModulesRoot,
        npmCacheRoot: environment.npmCacheRoot,
      },
    }).env;

    const pm2Version = await this.resolveManagedPm2Version(environment.npmGlobalModulesRoot);
    const pm2HomePaths = buildPm2MajorHomePaths({
      userDataPath: this.userDataPath,
      pm2Version,
      platform: process.platform,
    });
    await fs.mkdir(pm2HomePaths.pm2Home, { recursive: true });

    return {
      ...managedCliEnv,
      PM2_HOME: pm2HomePaths.pm2Home,
    };
  }

  private async resolveManagedPm2Version(npmGlobalModulesRoot: string): Promise<string | null> {
    const packageJsonPath = path.join(npmGlobalModulesRoot, 'pm2', 'package.json');
    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonContent) as { version?: unknown };
      return typeof packageJson.version === 'string' ? packageJson.version : null;
    } catch {
      return null;
    }
  }

  private async renderEcosystem(paths: CodeServerManagedPaths, wrapperPath: string, runtimeEnv: NodeJS.ProcessEnv): Promise<void> {
    const pathKey = resolvePathEnvKey(runtimeEnv, process.platform);
    const pathValue = runtimeEnv[pathKey] ?? runtimeEnv.PATH ?? runtimeEnv.Path ?? '';
    const port = this.getPort();
    const outLog = path.join(paths.logs, OUT_LOG_FILE);
    const errorLog = path.join(paths.logs, ERROR_LOG_FILE);
    const args = [
      '--bind-addr',
      `127.0.0.1:${port}`,
      '--auth',
      'none',
      '--user-data-dir',
      paths.data,
      '--extensions-dir',
      paths.extensions,
      '--disable-telemetry',
    ];

    const contents = `module.exports = {\n  apps: [\n    {\n      name: ${JSON.stringify(PROCESS_NAME)},\n      script: ${JSON.stringify(wrapperPath)},\n      args: ${JSON.stringify(args)},\n      interpreter: 'none',\n      exec_mode: 'fork',\n      instances: 1,\n      autorestart: true,\n      restart_delay: 3000,\n      max_restarts: 10,\n      cwd: ${JSON.stringify(this.pathManager.getCodeServerRuntimeRoot())},\n      out_file: ${JSON.stringify(outLog)},\n      error_file: ${JSON.stringify(errorLog)},\n      env: {\n        ${JSON.stringify(pathKey)}: ${JSON.stringify(pathValue)},\n        HAGICODE_CODE_SERVER_RUNTIME_ROOT: ${JSON.stringify(this.pathManager.getCodeServerRuntimeRoot())},\n        HAGICODE_PORTABLE_TOOLCHAIN_ROOT: ${JSON.stringify(runtimeEnv.HAGICODE_PORTABLE_TOOLCHAIN_ROOT ?? '')},\n        HAGICODE_CODE_SERVER_DESKTOP_MANAGED: 'true',\n        PORT: ${JSON.stringify(port)}\n      }\n    }\n  ]\n};\n`;
    await fs.writeFile(paths.ecosystemFile, contents, 'utf8');
  }

  private async getPm2ProcessStatus(pm2: Pm2ContextSnapshot): Promise<Pm2ProcessStatus> {
    if (!pm2.available || !pm2.executablePath || !pm2.env) {
      return 'stopped';
    }

    const result = await this.runPm2(pm2.executablePath, ['jlist'], pm2.env, true);
    if (result.exitCode !== 0) {
      return 'unknown';
    }

    try {
      const entries = JSON.parse(result.stdout || '[]') as Pm2ListEntry[];
      const entry = entries.find((item) => item.name === PROCESS_NAME);
      if (!entry) {
        return 'stopped';
      }

      const status = entry.pm2_env?.status;
      if (status === 'online') {
        return 'online';
      }
      if (status === 'errored') {
        return 'errored';
      }
      if (status === 'stopped' || status === 'stopping' || status === 'launching') {
        return 'stopped';
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private async deletePm2Process(command: string, env: NodeJS.ProcessEnv): Promise<void> {
    const result = await this.runPm2(command, ['delete', PROCESS_NAME], env, true);
    if (result.exitCode === 0 || /not found/i.test(`${result.stdout}\n${result.stderr}`)) {
      return;
    }
    throw new Error((result.stderr || result.stdout || 'PM2 delete failed').trim());
  }

  private async stopPm2Process(command: string, env: NodeJS.ProcessEnv): Promise<void> {
    const result = await this.runPm2(command, ['stop', PROCESS_NAME], env, true);
    if (result.exitCode === 0 || /not found/i.test(`${result.stdout}\n${result.stderr}`)) {
      return;
    }
    throw new Error((result.stderr || result.stdout || 'PM2 stop failed').trim());
  }

  private async runPm2(command: string, args: string[], env: NodeJS.ProcessEnv, allowFailure = false): Promise<CommandResult> {
    const pm2LaunchPlan = resolvePm2LaunchPlan(command, {
      env,
      platform: process.platform,
    });
    const launch = pm2LaunchPlan.shell
      ? resolveCommandLaunch(pm2LaunchPlan.command)
      : { command: pm2LaunchPlan.command, shell: false };

    const result = await executeCli({
      command: launch.command,
      args: [...pm2LaunchPlan.argsPrefix, ...args],
      env,
      windowsHide: true,
      shell: launch.shell,
      metadata: { component: 'CodeServerManager', command },
    });
    const normalized = {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
    if (!allowFailure && result.exitCode !== 0) {
      throw new Error((result.stderr || result.stdout || `PM2 exited with code ${result.exitCode}`).trim());
    }
    return normalized;
  }
}
