import path from 'node:path';
import { executeCli, type CliExecutionResult } from './utils/cli-executor.js';
import { resolveCommandLaunch } from './toolchain-launch.js';
import type {
  HagiscriptManagedPm2Service,
  HagiscriptRuntimeContext,
} from './hagiscript-runtime-context.js';

const DEFAULT_HAGISCRIPT_RUNTIME_STATE_TIMEOUT_MS = 15_000;
const DEFAULT_HAGISCRIPT_PM2_LIFECYCLE_TIMEOUT_MS = 60_000;

function resolvePm2LifecycleTimeoutMs(): number {
  const configured = Number.parseInt(process.env.HAGICODE_PM2_LIFECYCLE_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_HAGISCRIPT_PM2_LIFECYCLE_TIMEOUT_MS;
}

export type HagiscriptManagedServerStatus = 'online' | 'stopped' | 'errored' | 'missing' | 'unknown';
export type HagiscriptServerLifecycleAction = 'start' | 'stop' | 'restart' | 'status';
export type HagiscriptBundledRuntimeAction = 'exact';

export interface HagiscriptRuntimeStateReport {
  runtime: {
    name: string;
    version: string;
    manifestPath: string;
  };
  managedRoot: string;
  managedPaths: {
    logs?: string;
  };
  ready: boolean;
  components: Array<{
    name: string;
    type: string;
    status: string;
    runtimeDataHome: string | null;
    pm2Home: string | null;
    details?: Record<string, unknown>;
  }>;
  lastOperation: {
    phase: 'install' | 'remove' | 'update';
    status: 'success' | 'failed';
    logFile: string | null;
    message?: string;
  } | null;
}

export interface HagiscriptRuntimeStateResult {
  success: boolean;
  summary: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  report: HagiscriptRuntimeStateReport | null;
  logPaths: string[];
}

export interface HagiscriptServerLifecycleResult {
  success: boolean;
  action: HagiscriptServerLifecycleAction;
  summary: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  exists: boolean;
  status: HagiscriptManagedServerStatus;
  pid: number | null;
  restartCount: number;
  pmUptime: number | null;
  runtimeHome: string;
  runtimeDataHome: string;
  pm2Home: string;
  pm2BinaryPath: string | null;
  runtimeFilesDir: string | null;
  logPaths: string[];
}

interface HagiscriptPm2Response {
  service: HagiscriptManagedPm2Service;
  action: HagiscriptServerLifecycleAction;
  appName: string;
  cwd: string;
  script: string;
  runtimeHome: string;
  runtimeDataHome: string;
  pm2Home: string;
  pm2Binary: string;
  exists: boolean;
  status: HagiscriptManagedServerStatus;
  pid: number | null;
  stdout: string;
  stderr: string;
  runtimeFilesDir?: string;
}

interface HagiscriptDedicatedComponentStatus {
  service: HagiscriptManagedPm2Service;
  action: HagiscriptServerLifecycleAction;
  baseAppName: string;
  appName: string;
  status: HagiscriptManagedServerStatus;
  exists: boolean;
  pid: number | null;
  stdout: string;
  stderr: string;
  runtimeHome: string;
  runtimeDataHome: string;
  pm2Home: string;
  pm2Binary: string;
  runtimeFilesDir?: string;
}

interface HagiscriptDedicatedLifecycleEnvelope {
  component: 'code_server';
  service: HagiscriptManagedPm2Service;
  action: HagiscriptServerLifecycleAction;
  ok: boolean;
  status: HagiscriptDedicatedComponentStatus;
}

interface HagiscriptDedicatedExactEnvelope {
  component: 'code_server';
  service: HagiscriptManagedPm2Service;
  action: 'exact';
  ok: boolean;
  version: string;
  archivePath: string;
  extractedRuntimeRoot: string;
  currentRoot: string;
}

export interface HagiscriptBundledRuntimeExactResult {
  success: boolean;
  action: HagiscriptBundledRuntimeAction;
  summary: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  version: string | null;
  archivePath: string | null;
  extractedRuntimeRoot: string | null;
  currentRoot: string | null;
  logPaths: string[];
}

interface Pm2ProcessMetrics {
  restartCount: number;
  pmUptime: number | null;
}

export class HagiscriptPm2Manager {
  async exact(context: HagiscriptRuntimeContext): Promise<HagiscriptBundledRuntimeExactResult> {
    if (context.serviceName === 'server') {
      return {
        success: false,
        action: 'exact',
        summary: 'hagiscript exact is only available for bundled runtimes.',
        stdout: '',
        stderr: '',
        exitCode: null,
        version: null,
        archivePath: null,
        extractedRuntimeRoot: null,
        currentRoot: null,
        logPaths: this.buildExactLogPaths(context, null),
      };
    }

    const execution = await this.executeCommand(
      context,
      [this.resolveDedicatedServiceCommand(context.serviceName), 'exact', '--json', '--runtime-root', context.runtimeRoot, '--from-manifest', context.manifestPath],
      `${context.serviceName}-exact`,
    );

    if (!execution.success) {
      return {
        success: false,
        action: 'exact',
        summary: execution.summary,
        stdout: execution.result.stdout,
        stderr: execution.result.stderr,
        exitCode: execution.result.exitCode,
        version: null,
        archivePath: null,
        extractedRuntimeRoot: null,
        currentRoot: null,
        logPaths: this.buildExactLogPaths(context, null),
      };
    }

    const response = this.parseJsonObject<HagiscriptDedicatedExactEnvelope>(execution.result.stdout);
    if (!response || !response.ok) {
      return {
        success: false,
        action: 'exact',
        summary: 'hagiscript dedicated exact command returned invalid JSON output.',
        stdout: execution.result.stdout,
        stderr: execution.result.stderr,
        exitCode: execution.result.exitCode,
        version: null,
        archivePath: null,
        extractedRuntimeRoot: null,
        currentRoot: null,
        logPaths: this.buildExactLogPaths(context, null),
      };
    }

    return {
      success: true,
      action: 'exact',
      summary: `hagiscript ${response.component} exact completed.`,
      stdout: execution.result.stdout,
      stderr: execution.result.stderr,
      exitCode: execution.result.exitCode,
      version: response.version,
      archivePath: response.archivePath,
      extractedRuntimeRoot: response.extractedRuntimeRoot,
      currentRoot: response.currentRoot,
      logPaths: this.buildExactLogPaths(context, response),
    };
  }

  async getRuntimeState(context: HagiscriptRuntimeContext): Promise<HagiscriptRuntimeStateResult> {
    const execution = await this.executeCommand(
      context,
      ['runtime', 'state', '--json', '--runtime-root', context.runtimeRoot, '--from-manifest', context.manifestPath],
      'runtime-state',
    );

    if (!execution.success) {
      return {
        success: false,
        summary: execution.summary,
        stdout: execution.result.stdout,
        stderr: execution.result.stderr,
        exitCode: execution.result.exitCode,
        report: null,
        logPaths: this.buildRuntimeStateLogPaths(context, null),
      };
    }

    const report = this.parseJsonObject<HagiscriptRuntimeStateReport>(execution.result.stdout);
    if (!report) {
      return {
        success: false,
        summary: 'hagiscript runtime state returned invalid JSON output.',
        stdout: execution.result.stdout,
        stderr: execution.result.stderr,
        exitCode: execution.result.exitCode,
        report: null,
        logPaths: this.buildRuntimeStateLogPaths(context, null),
      };
    }

    return {
      success: true,
      summary: 'hagiscript runtime state resolved.',
      stdout: execution.result.stdout,
      stderr: execution.result.stderr,
      exitCode: execution.result.exitCode,
      report,
      logPaths: this.buildRuntimeStateLogPaths(context, report),
    };
  }

  async start(context: HagiscriptRuntimeContext): Promise<HagiscriptServerLifecycleResult> {
    return this.runLifecycleAction(context, 'start');
  }

  async stop(context: HagiscriptRuntimeContext): Promise<HagiscriptServerLifecycleResult> {
    return this.runLifecycleAction(context, 'stop');
  }

  async restart(context: HagiscriptRuntimeContext): Promise<HagiscriptServerLifecycleResult> {
    return this.runLifecycleAction(context, 'restart');
  }

  async status(context: HagiscriptRuntimeContext): Promise<HagiscriptServerLifecycleResult> {
    return this.runLifecycleAction(context, 'status');
  }

  private async runLifecycleAction(
    context: HagiscriptRuntimeContext,
    action: HagiscriptServerLifecycleAction,
  ): Promise<HagiscriptServerLifecycleResult> {
    if (context.serviceName !== 'server') {
      return this.runDedicatedLifecycleAction(context as HagiscriptRuntimeContext & { serviceName: Extract<HagiscriptManagedPm2Service, 'code-server'> }, action);
    }

    const execution = await this.executeCommand(
      context,
      ['pm2', context.serviceName, action, '--json', '--runtime-root', context.runtimeRoot, '--from-manifest', context.manifestPath],
      `pm2-${action}`,
    );

    if (!execution.success) {
      return this.buildLifecycleFailure(context, action, execution);
    }

    const response = this.parseJsonObject<HagiscriptPm2Response>(execution.result.stdout);
    if (!response) {
      return {
        success: false,
        action,
        summary: 'hagiscript PM2 command returned invalid JSON output.',
        stdout: execution.result.stdout,
        stderr: execution.result.stderr,
        exitCode: execution.result.exitCode,
        exists: false,
        status: 'unknown',
        pid: null,
        restartCount: 0,
        pmUptime: null,
        runtimeHome: context.runtimeHome,
        runtimeDataHome: context.serviceDataHome,
        pm2Home: context.pm2Home,
        pm2BinaryPath: null,
        runtimeFilesDir: context.runtimeFilesDir,
        logPaths: this.buildLifecycleLogPaths(context, null),
      };
    }

    const metrics = this.parsePm2ProcessMetrics(response.stdout, response.appName);
    return {
      success: true,
      action,
      summary: `hagiscript pm2 ${response.service} ${action} completed with status ${response.status}.`,
      stdout: execution.result.stdout,
      stderr: execution.result.stderr,
      exitCode: execution.result.exitCode,
      exists: response.exists,
      status: response.status,
      pid: response.pid,
      restartCount: metrics.restartCount,
      pmUptime: metrics.pmUptime,
      runtimeHome: response.runtimeHome,
      runtimeDataHome: response.runtimeDataHome,
      pm2Home: response.pm2Home,
      pm2BinaryPath: response.pm2Binary ?? null,
      runtimeFilesDir: response.runtimeFilesDir ?? null,
      logPaths: this.buildLifecycleLogPaths(context, response),
    };
  }

  private async runDedicatedLifecycleAction(
    context: HagiscriptRuntimeContext & { serviceName: Extract<HagiscriptManagedPm2Service, 'code-server'> },
    action: HagiscriptServerLifecycleAction,
  ): Promise<HagiscriptServerLifecycleResult> {
    const execution = await this.executeCommand(
      context,
      [this.resolveDedicatedServiceCommand(context.serviceName), action, '--json', '--runtime-root', context.runtimeRoot, '--from-manifest', context.manifestPath],
      `${context.serviceName}-${action}`,
    );

    if (!execution.success) {
      return this.buildLifecycleFailure(context, action, execution);
    }

    const response = this.parseJsonObject<HagiscriptDedicatedLifecycleEnvelope>(execution.result.stdout);
    if (!response?.ok) {
      return {
        success: false,
        action,
        summary: 'hagiscript dedicated service command returned invalid JSON output.',
        stdout: execution.result.stdout,
        stderr: execution.result.stderr,
        exitCode: execution.result.exitCode,
        exists: false,
        status: 'unknown',
        pid: null,
        restartCount: 0,
        pmUptime: null,
        runtimeHome: context.runtimeHome,
        runtimeDataHome: context.serviceDataHome,
        pm2Home: context.pm2Home,
        pm2BinaryPath: null,
        runtimeFilesDir: context.runtimeFilesDir,
        logPaths: this.buildLifecycleLogPaths(context, null),
      };
    }

    const metrics = this.parsePm2ProcessMetrics(response.status.stdout, response.status.appName);
    return {
      success: true,
      action,
      summary: `hagiscript ${response.component} ${action} completed with status ${response.status.status}.`,
      stdout: execution.result.stdout,
      stderr: execution.result.stderr,
      exitCode: execution.result.exitCode,
      exists: response.status.exists,
      status: response.status.status,
      pid: response.status.pid,
      restartCount: metrics.restartCount,
      pmUptime: metrics.pmUptime,
      runtimeHome: response.status.runtimeHome,
      runtimeDataHome: response.status.runtimeDataHome,
      pm2Home: response.status.pm2Home,
      pm2BinaryPath: response.status.pm2Binary ?? null,
      runtimeFilesDir: response.status.runtimeFilesDir ?? null,
      logPaths: this.buildLifecycleLogPaths(context, {
        service: response.status.service,
        action,
        appName: response.status.appName,
        cwd: '',
        script: '',
        runtimeHome: response.status.runtimeHome,
        runtimeDataHome: response.status.runtimeDataHome,
        pm2Home: response.status.pm2Home,
        pm2Binary: response.status.pm2Binary,
        exists: response.status.exists,
        status: response.status.status,
        pid: response.status.pid,
        stdout: response.status.stdout,
        stderr: response.status.stderr,
        runtimeFilesDir: response.status.runtimeFilesDir,
      }),
    };
  }

  private async executeCommand(
    context: HagiscriptRuntimeContext,
    args: string[],
    operation: string,
  ): Promise<{
    success: boolean;
    summary: string;
    result: CliExecutionResult;
  }> {
    const launch = resolveCommandLaunch(context.hagiscriptExecutablePath);
    const result = await executeCli({
      command: launch.command,
      args,
      cwd: context.runtimeHome,
      env: context.commandEnv,
      timeoutMs: args[0] === 'runtime'
        ? DEFAULT_HAGISCRIPT_RUNTIME_STATE_TIMEOUT_MS
        : resolvePm2LifecycleTimeoutMs(),
      shell: launch.shell,
      windowsHide: true,
      metadata: {
        component: 'HagiscriptPm2Manager',
        operation,
      },
    });

    return {
      success: result.success,
      summary: result.success
        ? 'ok'
        : this.firstMeaningfulLine(result.stderr)
          ?? this.firstMeaningfulLine(result.stdout)
          ?? result.error?.message
          ?? `hagiscript ${operation} failed.`,
      result,
    };
  }

  private buildLifecycleFailure(
    context: HagiscriptRuntimeContext,
    action: HagiscriptServerLifecycleAction,
    execution: {
      summary: string;
      result: CliExecutionResult;
    },
  ): HagiscriptServerLifecycleResult {
    return {
      success: false,
      action,
      summary: execution.summary,
      stdout: execution.result.stdout,
      stderr: execution.result.stderr,
      exitCode: execution.result.exitCode,
      exists: false,
      status: 'unknown',
      pid: null,
      restartCount: 0,
      pmUptime: null,
      runtimeHome: context.runtimeHome,
      runtimeDataHome: context.serviceDataHome,
      pm2Home: context.pm2Home,
      pm2BinaryPath: null,
      runtimeFilesDir: context.runtimeFilesDir,
      logPaths: this.buildLifecycleLogPaths(context, null),
    };
  }

  private buildRuntimeStateLogPaths(
    context: HagiscriptRuntimeContext,
    report: HagiscriptRuntimeStateReport | null,
  ): string[] {
    return this.uniquePaths([
      report?.lastOperation?.logFile ?? null,
      context.runtimeStateFilePath,
      path.join(context.runtimeFilesDir, 'launch-contract.json'),
    ]);
  }

  private buildLifecycleLogPaths(
    context: HagiscriptRuntimeContext,
    response: HagiscriptPm2Response | null,
  ): string[] {
    const appName = response?.appName ?? context.appName;
    return this.uniquePaths([
      path.join(context.pm2LogsDirectory, `${appName}-error.log`),
      path.join(context.pm2LogsDirectory, `${appName}-out.log`),
      path.join(context.runtimeFilesDir, 'launch-contract.json'),
      response?.runtimeFilesDir ? path.join(response.runtimeFilesDir, 'ecosystem.config.cjs') : null,
      response?.runtimeFilesDir ? path.join(response.runtimeFilesDir, '.env') : null,
      context.runtimeStateFilePath,
    ]);
  }

  private buildExactLogPaths(
    context: HagiscriptRuntimeContext,
    response: HagiscriptDedicatedExactEnvelope | null,
  ): string[] {
    return this.uniquePaths([
      response?.archivePath ?? null,
      response?.currentRoot ?? null,
      response?.extractedRuntimeRoot ?? null,
      context.runtimeStateFilePath,
      context.manifestPath,
    ]);
  }

  private resolveDedicatedServiceCommand(serviceName: Extract<HagiscriptManagedPm2Service, 'code-server'>): 'code_server' {
    return serviceName === 'code-server' ? 'code_server' : 'code_server';
  }

  private parsePm2ProcessMetrics(rawOutput: string, appName: string): Pm2ProcessMetrics {
    const payload = this.parseJsonObject<unknown>(rawOutput) ?? this.extractJsonArray(rawOutput);
    if (!Array.isArray(payload)) {
      return { restartCount: 0, pmUptime: null };
    }

    const entry = payload.find((value) => (
      typeof value === 'object' &&
      value !== null &&
      'name' in value &&
      (value as { name?: unknown }).name === appName
    )) as {
      pm2_env?: {
        restart_time?: unknown;
        pm_uptime?: unknown;
      };
    } | undefined;

    return {
      restartCount: typeof entry?.pm2_env?.restart_time === 'number' ? entry.pm2_env.restart_time : 0,
      pmUptime: typeof entry?.pm2_env?.pm_uptime === 'number' ? entry.pm2_env.pm_uptime : null,
    };
  }

  private parseJsonObject<T>(value: string): T | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return JSON.parse(trimmed) as T;
    } catch {
      for (let index = 0; index < trimmed.length; index += 1) {
        if (trimmed[index] !== '{') {
          continue;
        }

        try {
          return JSON.parse(trimmed.slice(index)) as T;
        } catch {
          continue;
        }
      }

      return null;
    }
  }

  private extractJsonArray(value: string): unknown[] | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const direct = JSON.parse(trimmed);
      return Array.isArray(direct) ? direct : null;
    } catch {
      for (let index = 0; index < trimmed.length; index += 1) {
        if (trimmed[index] !== '[') {
          continue;
        }

        try {
          const parsed = JSON.parse(trimmed.slice(index));
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          continue;
        }
      }

      return null;
    }
  }

  private uniquePaths(values: Array<string | null | undefined>): string[] {
    return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
  }

  private firstMeaningfulLine(value: string): string | null {
    return value
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? null;
  }
}

export class HagiscriptServerManager extends HagiscriptPm2Manager {}
