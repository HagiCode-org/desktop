import path from 'node:path';
import {
  executeComponentServiceAction,
  getManagedServerStatus,
  queryRuntimeState,
  restartManagedServer,
  startManagedServer,
  stopManagedServer,
  type ComponentServiceResult,
  type ManagedPm2CommandResult,
  type RuntimeStateReport,
} from '@hagicode/hagiscript-sdk';
import type {
  HagiscriptManagedPm2Service,
  HagiscriptRuntimeContext,
} from './hagiscript-runtime-context.js';

export type HagiscriptManagedServerStatus = 'online' | 'stopped' | 'errored' | 'missing' | 'unknown';
export type HagiscriptServerLifecycleAction = 'start' | 'stop' | 'restart' | 'status';
export type HagiscriptBundledRuntimeAction = 'exact';

export interface HagiscriptRuntimeStateReport {
  runtime: RuntimeStateReport['runtime'];
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
        summary: 'Desktop SDK exact is only available for bundled runtimes.',
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

    try {
      const result = await executeComponentServiceAction('code_server', 'exact', {
        manifestPath: context.manifestPath,
        runtimeRoot: context.runtimeRoot,
      });

      if (result.action !== 'exact') {
        return {
          success: false,
          action: 'exact',
          summary: 'Desktop SDK exact returned an unexpected response.',
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

      return {
        success: true,
        action: 'exact',
        summary: `Desktop SDK ${result.component} exact completed.`,
        stdout: '',
        stderr: '',
        exitCode: 0,
        version: result.version,
        archivePath: result.archivePath,
        extractedRuntimeRoot: result.extractedRuntimeRoot,
        currentRoot: result.currentRoot,
        logPaths: this.buildExactLogPaths(context, result),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        action: 'exact',
        summary: message,
        stdout: '',
        stderr: message,
        exitCode: null,
        version: null,
        archivePath: null,
        extractedRuntimeRoot: null,
        currentRoot: null,
        logPaths: this.buildExactLogPaths(context, null),
      };
    }
  }

  async getRuntimeState(context: HagiscriptRuntimeContext): Promise<HagiscriptRuntimeStateResult> {
    try {
      const report = await queryRuntimeState({
        manifestPath: context.manifestPath,
        runtimeRoot: context.runtimeRoot,
      });

      return {
        success: true,
        summary: 'Desktop SDK runtime state resolved.',
        stdout: '',
        stderr: '',
        exitCode: 0,
        report: {
          runtime: report.runtime,
          managedRoot: report.managedRoot,
          managedPaths: {
            logs: report.managedPaths.logs,
          },
          ready: report.ready,
          components: report.components.map((component) => ({
            name: component.name,
            type: component.type,
            status: component.status,
            runtimeDataHome: component.runtimeDataHome,
            pm2Home: component.pm2Home,
            details: component.details,
          })),
          lastOperation: report.lastOperation,
        },
        logPaths: this.buildRuntimeStateLogPaths(context, {
          runtime: report.runtime,
          managedRoot: report.managedRoot,
          managedPaths: {
            logs: report.managedPaths.logs,
          },
          ready: report.ready,
          components: report.components.map((component) => ({
            name: component.name,
            type: component.type,
            status: component.status,
            runtimeDataHome: component.runtimeDataHome,
            pm2Home: component.pm2Home,
            details: component.details,
          })),
          lastOperation: report.lastOperation,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        summary: message,
        stdout: '',
        stderr: message,
        exitCode: null,
        report: null,
        logPaths: this.buildRuntimeStateLogPaths(context, null),
      };
    }
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
    try {
      if (context.serviceName === 'server') {
        const result = await this.runManagedServerAction(context, action);
        return this.mapManagedPm2Result(context, action, result, `Desktop SDK server ${action}`);
      }

      const result = await executeComponentServiceAction('code_server', action, {
        manifestPath: context.manifestPath,
        runtimeRoot: context.runtimeRoot,
      });

      if (!this.isLifecycleComponentResult(result)) {
        return this.buildLifecycleFailure(context, action, 'Desktop SDK returned an unexpected component lifecycle response.');
      }

      return this.mapManagedPm2Result(context, action, result.status, `Desktop SDK ${result.component} ${action}`);
    } catch (error) {
      return this.buildLifecycleFailure(context, action, error instanceof Error ? error.message : String(error));
    }
  }

  private async runManagedServerAction(
    context: HagiscriptRuntimeContext,
    action: HagiscriptServerLifecycleAction,
  ): Promise<ManagedPm2CommandResult> {
    const options = {
      manifestPath: context.manifestPath,
      runtimeRoot: context.runtimeRoot,
    };

    switch (action) {
      case 'start':
        return startManagedServer(options);
      case 'stop':
        return stopManagedServer(options);
      case 'restart':
        return restartManagedServer(options);
      case 'status':
        return getManagedServerStatus(options);
    }
  }

  private isLifecycleComponentResult(
    result: ComponentServiceResult,
  ): result is Extract<ComponentServiceResult, { action: 'start' | 'stop' | 'restart' | 'status' }> {
    return result.action === 'start'
      || result.action === 'stop'
      || result.action === 'restart'
      || result.action === 'status';
  }

  private mapManagedPm2Result(
    context: HagiscriptRuntimeContext,
    action: HagiscriptServerLifecycleAction,
    result: ManagedPm2CommandResult,
    summaryPrefix: string,
  ): HagiscriptServerLifecycleResult {
    const metrics = this.parsePm2ProcessMetrics(result.stdout, result.appName);
    return {
      success: true,
      action,
      summary: `${summaryPrefix} completed with status ${result.status}.`,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
      exists: result.exists,
      status: result.status,
      pid: result.pid,
      restartCount: metrics.restartCount,
      pmUptime: metrics.pmUptime,
      runtimeHome: result.runtimeHome,
      runtimeDataHome: result.runtimeDataHome,
      pm2Home: result.pm2Home,
      pm2BinaryPath: result.pm2Binary ?? null,
      runtimeFilesDir: result.runtimeFilesDir ?? null,
      logPaths: this.buildLifecycleLogPaths(context, result),
    };
  }

  private buildLifecycleFailure(
    context: HagiscriptRuntimeContext,
    action: HagiscriptServerLifecycleAction,
    message: string,
  ): HagiscriptServerLifecycleResult {
    return {
      success: false,
      action,
      summary: message,
      stdout: '',
      stderr: message,
      exitCode: null,
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
    response: ManagedPm2CommandResult | null,
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
    response: Extract<ComponentServiceResult, { action: 'exact' }> | null,
  ): string[] {
    return this.uniquePaths([
      response?.archivePath ?? null,
      response?.currentRoot ?? null,
      response?.extractedRuntimeRoot ?? null,
      context.runtimeStateFilePath,
      context.manifestPath,
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
}

export class HagiscriptServerManager extends HagiscriptPm2Manager {}
