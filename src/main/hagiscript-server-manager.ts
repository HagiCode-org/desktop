import path from 'node:path';
import { executeCli, type CliExecutionResult } from './utils/cli-executor.js';
import { resolveCommandLaunch } from './toolchain-launch.js';
import type {
  HagiscriptManagedPm2Service,
  HagiscriptRuntimeContext,
} from './hagiscript-runtime-context.js';

const DEFAULT_HAGISCRIPT_RUNTIME_STATE_TIMEOUT_MS = 15_000;
const DEFAULT_HAGISCRIPT_PM2_LIFECYCLE_TIMEOUT_MS = 30_000;

export type HagiscriptManagedServerStatus = 'online' | 'stopped' | 'errored' | 'missing' | 'unknown';
export type HagiscriptServerLifecycleAction = 'start' | 'stop' | 'restart' | 'status';

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

interface Pm2ProcessMetrics {
  restartCount: number;
  pmUptime: number | null;
}

export class HagiscriptPm2Manager {
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
      runtimeFilesDir: response.runtimeFilesDir ?? null,
      logPaths: this.buildLifecycleLogPaths(context, response),
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
        : DEFAULT_HAGISCRIPT_PM2_LIFECYCLE_TIMEOUT_MS,
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
