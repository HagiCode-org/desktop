import fs from 'node:fs/promises';
import path from 'node:path';
import type Store from 'electron-store';
import { app } from 'electron';
import { ConfigManager } from './config.js';
import { DependencyManager } from './dependency-manager.js';
import DependencyManagementService from './dependency-management-service.js';
import { HagiscriptRuntimeContextResolver } from './hagiscript-runtime-context.js';
import {
  HagiscriptServerManager,
  type HagiscriptManagedServerStatus,
  type HagiscriptServerLifecycleResult,
} from './hagiscript-server-manager.js';
import { PackageSourceConfigManager } from './package-source-config-manager.js';
import { PathManager } from './path-manager.js';
import { extractPm2MajorVersion } from './portable-toolchain-paths.js';
import { Pm2DotnetManager, resolvePm2LaunchPlan } from './pm2-dotnet-manager.js';
import { VersionManager } from './version-manager.js';
import { resolveManagedLaunchContextForRuntimeRoot } from './web-service-manager.js';
import { CodeServerManager } from './code-server-manager.js';
import OmniRouteManager from './omniroute-manager.js';
import { CODE_SERVER_PROCESS_NAME } from '../types/code-server-management.js';
import { OMNIROUTE_PROCESS_NAME } from '../types/omniroute-management.js';

const DEFAULT_VERIFICATION_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MAX_LOG_TAIL_CHARS = 4_000;

interface ManagedPm2Report {
  npmGlobalPrefix: string;
  npmGlobalBinRoot: string;
  npmGlobalModulesRoot: string;
  packageRoot: string | null;
  executablePath: string | null;
  packageVersion: string | null;
  launchCommand: string;
  launchCli: string | null;
  launchShell: boolean;
  launchCommandUnderManagedNode: boolean;
  launchCliUnderManagedModules: boolean;
}

interface ManagedServiceStageReport {
  pm2Home: string;
  runtimeDataHome: string;
  runtimeFilesDir: string | null;
  startSuccess: boolean;
  statusAfterStart: string;
  stopSuccess: boolean;
  statusAfterStop: string;
  diagnostics: string[];
  error?: string;
}

interface BackendLifecycleReport extends ManagedServiceStageReport {
  activeRuntimeRoot: string | null;
  serviceDllPath: string | null;
  serviceWorkingDirectory: string | null;
  requiredRuntimeLabel: string | null;
  restartSuccess: boolean;
  statusAfterRestart: string;
}

export interface NonInteractiveRuntimeLifecycleReport {
  ok: boolean;
  desktopLogsDirectory: string;
  pm2: ManagedPm2Report;
  services: {
    codeServer: ManagedServiceStageReport;
    omniRoute: ManagedServiceStageReport;
    backend: BackendLifecycleReport;
  };
  issues: string[];
}

function resolveVerificationTimeoutMs(): number {
  const configured = Number.parseInt(process.env.HAGICODE_NON_INTERACTIVE_INTEGRATION_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_VERIFICATION_TIMEOUT_MS;
}

function isPathUnder(parentPath: string, childPath: string | null | undefined): boolean {
  if (!childPath) {
    return false;
  }

  const normalizedParent = process.platform === 'win32'
    ? path.resolve(parentPath).toLowerCase()
    : path.resolve(parentPath);
  const normalizedChild = process.platform === 'win32'
    ? path.resolve(childPath).toLowerCase()
    : path.resolve(childPath);
  const relative = path.relative(normalizedParent, normalizedChild);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

async function readDiagnosticTail(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const trimmed = content.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.length > MAX_LOG_TAIL_CHARS ? trimmed.slice(-MAX_LOG_TAIL_CHARS) : trimmed;
  } catch {
    return null;
  }
}

async function collectDiagnosticLines(paths: readonly string[]): Promise<string[]> {
  const diagnostics: string[] = [];
  for (const targetPath of paths) {
    const tail = await readDiagnosticTail(targetPath);
    if (!tail) {
      continue;
    }
    diagnostics.push(`${targetPath}: ${tail}`);
  }
  return diagnostics;
}

async function waitForResult<T>(
  description: string,
  checker: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
): Promise<{ ok: true; value: T } | { ok: false; value: T | null; error: string }> {
  const startTime = Date.now();
  let lastValue: T | null = null;

  while (Date.now() - startTime < timeoutMs) {
    lastValue = await checker();
    if (predicate(lastValue)) {
      return { ok: true, value: lastValue };
    }

    await new Promise((resolve) => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
  }

  return {
    ok: false,
    value: lastValue,
    error: `${description} did not reach the expected state within ${timeoutMs}ms.`,
  };
}

async function cleanupManagedPm2State(input: {
  processName: string;
  pm2Command: string | null;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<string[]> {
  if (!input.pm2Command) {
    return ['PM2 cleanup skipped because the managed pm2 executable is unavailable.'];
  }

  const manager = new Pm2DotnetManager({
    pm2Command: input.pm2Command,
    processName: input.processName,
  });
  const diagnostics: string[] = [];

  for (const action of [
    ['stop', () => manager.stop(input.cwd, input.env)],
    ['delete', () => manager.delete(input.cwd, input.env)],
    ['kill', () => manager.kill(input.cwd, input.env)],
  ] as const) {
    try {
      const result = await action[1]();
      if (!result.success) {
        diagnostics.push(`${action[0]} cleanup failed: ${result.message}`);
      }
    } catch (error) {
      diagnostics.push(`${action[0]} cleanup threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return diagnostics;
}

function createEmptyServiceReport(pm2Home: string, runtimeDataHome: string, runtimeFilesDir: string | null): ManagedServiceStageReport {
  return {
    pm2Home,
    runtimeDataHome,
    runtimeFilesDir,
    startSuccess: false,
    statusAfterStart: 'unknown',
    stopSuccess: false,
    statusAfterStop: 'unknown',
    diagnostics: [],
  };
}

function createEmptyBackendReport(): BackendLifecycleReport {
  return {
    ...createEmptyServiceReport('<missing>', '<missing>', null),
    activeRuntimeRoot: null,
    serviceDllPath: null,
    serviceWorkingDirectory: null,
    requiredRuntimeLabel: null,
    restartSuccess: false,
    statusAfterRestart: 'unknown',
  };
}

async function verifyCodeServerLifecycle(input: {
  manager: CodeServerManager;
  pm2Command: string | null;
  cleanupEnv: NodeJS.ProcessEnv;
  pm2Home: string;
  timeoutMs: number;
}): Promise<ManagedServiceStageReport> {
  const status = await input.manager.getStatus();
  const report = createEmptyServiceReport(input.pm2Home, status.paths.root, status.paths.runtime);

  try {
    const startResult = await input.manager.start();
    report.startSuccess = startResult.success;
    if (!startResult.success) {
      report.error = startResult.error ?? 'code-server start failed.';
      report.statusAfterStart = (await input.manager.getStatus()).process.status;
      return report;
    }

    const online = await waitForResult(
      'code-server PM2 status',
      () => input.manager.getStatus(),
      (value) => value.process.status === 'online',
      input.timeoutMs,
    );
    if (online.ok) {
      report.statusAfterStart = online.value.process.status;
    } else {
      report.statusAfterStart = online.value?.process.status ?? 'unknown';
      report.error = report.error ?? online.error;
    }

    const stopResult = await input.manager.stop();
    report.stopSuccess = stopResult.success;
    if (!stopResult.success) {
      report.error = report.error ?? stopResult.error ?? 'code-server stop failed.';
      report.statusAfterStop = (await input.manager.getStatus()).process.status;
      return report;
    }

    const stopped = await waitForResult(
      'code-server stopped status',
      () => input.manager.getStatus(),
      (value) => value.process.status === 'stopped',
      input.timeoutMs,
    );
    if (stopped.ok) {
      report.statusAfterStop = stopped.value.process.status;
    } else {
      report.statusAfterStop = stopped.value?.process.status ?? 'unknown';
      report.error = report.error ?? stopped.error;
    }
  } finally {
    report.diagnostics.push(
      ...await cleanupManagedPm2State({
        processName: CODE_SERVER_PROCESS_NAME,
        pm2Command: input.pm2Command,
        cwd: status.paths.runtime,
        env: {
          ...input.cleanupEnv,
          PM2_HOME: input.pm2Home,
        },
      }),
    );
    report.diagnostics.push(
      ...await collectDiagnosticLines([
        path.join(status.paths.logs, 'code-server-error.log'),
        path.join(status.paths.logs, 'code-server-out.log'),
        status.paths.ecosystemFile,
      ]),
    );
  }

  return report;
}

async function verifyOmniRouteLifecycle(input: {
  manager: OmniRouteManager;
  pm2Command: string | null;
  cleanupEnv: NodeJS.ProcessEnv;
  pm2Home: string;
  timeoutMs: number;
}): Promise<ManagedServiceStageReport> {
  const status = await input.manager.getStatus();
  const report = createEmptyServiceReport(input.pm2Home, status.paths.root, status.paths.runtime);

  try {
    const startResult = await input.manager.start();
    report.startSuccess = startResult.success;
    if (!startResult.success) {
      report.error = startResult.error ?? 'omniroute start failed.';
      report.statusAfterStart = (await input.manager.getStatus()).processes[0]?.status ?? 'unknown';
      return report;
    }

    const online = await waitForResult(
      'omniroute PM2 status',
      () => input.manager.getStatus(),
      (value) => value.processes.some((entry) => entry.status === 'online'),
      input.timeoutMs,
    );
    if (online.ok) {
      report.statusAfterStart = online.value.processes[0]?.status ?? 'unknown';
    } else {
      report.statusAfterStart = online.value?.processes[0]?.status ?? 'unknown';
      report.error = report.error ?? online.error;
    }

    const stopResult = await input.manager.stop();
    report.stopSuccess = stopResult.success;
    if (!stopResult.success) {
      report.error = report.error ?? stopResult.error ?? 'omniroute stop failed.';
      report.statusAfterStop = (await input.manager.getStatus()).processes[0]?.status ?? 'unknown';
      return report;
    }

    const stopped = await waitForResult(
      'omniroute stopped status',
      () => input.manager.getStatus(),
      (value) => value.processes.every((entry) => entry.status === 'stopped' || entry.status === 'unknown'),
      input.timeoutMs,
    );
    if (stopped.ok) {
      report.statusAfterStop = stopped.value.processes[0]?.status ?? 'stopped';
    } else {
      report.statusAfterStop = stopped.value?.processes[0]?.status ?? 'unknown';
      report.error = report.error ?? stopped.error;
    }
  } finally {
    report.diagnostics.push(
      ...await cleanupManagedPm2State({
        processName: OMNIROUTE_PROCESS_NAME,
        pm2Command: input.pm2Command,
        cwd: status.paths.runtime,
        env: {
          ...input.cleanupEnv,
          PM2_HOME: input.pm2Home,
        },
      }),
    );
    report.diagnostics.push(
      ...await collectDiagnosticLines([
        path.join(status.paths.logs, 'omniroute-error.log'),
        path.join(status.paths.logs, 'omniroute-out.log'),
        status.paths.envFile,
        status.paths.ecosystemFile,
      ]),
    );
  }

  return report;
}

function normalizeBackendStatus(result: HagiscriptServerLifecycleResult | null): string {
  return result?.status ?? 'unknown';
}

async function verifyBackendLifecycle(input: {
  pathManager: PathManager;
  configManager: ConfigManager;
  dependencyManagementService: DependencyManagementService;
  pm2Command: string | null;
  timeoutMs: number;
}): Promise<BackendLifecycleReport> {
  const report = createEmptyBackendReport();
  const dependencyManager = new DependencyManager(input.configManager.getStore() as unknown as Store<Record<string, unknown>>);
  const packageSourceConfigManager = new PackageSourceConfigManager(input.configManager.getStore() as unknown as Store);
  const versionManager = new VersionManager(dependencyManager, packageSourceConfigManager);
  const distributionModeState = await versionManager.initializeDistributionMode();
  const activeRuntime = distributionModeState.activeRuntime ?? await versionManager.getActiveRuntimeDescriptor();

  report.activeRuntimeRoot = activeRuntime?.rootPath ?? null;
  if (!activeRuntime) {
    report.error = 'Desktop did not resolve an active packaged runtime payload.';
    return report;
  }

  const launchContext = await resolveManagedLaunchContextForRuntimeRoot(activeRuntime.rootPath);
  report.serviceDllPath = launchContext.serviceDllPath;
  report.serviceWorkingDirectory = launchContext.serviceWorkingDirectory;
  report.requiredRuntimeLabel = launchContext.requiredRuntimeLabel ?? null;

  const runtimeContextResolver = new HagiscriptRuntimeContextResolver({
    pathManager: input.pathManager,
    dependencyManagementService: input.dependencyManagementService,
  });
  const runtimeContext = await runtimeContextResolver.resolve({
    activeRuntime,
    servicePayloadPath: launchContext.serviceDllPath,
    serviceWorkingDirectory: launchContext.serviceWorkingDirectory,
    serviceEnv: {
      ASPNETCORE_ENVIRONMENT: 'Production',
      ASPNETCORE_URLS: 'http://127.0.0.1:36556',
    },
  });
  const serverManager = new HagiscriptServerManager();

  report.pm2Home = runtimeContext.pm2Home;
  report.runtimeDataHome = runtimeContext.serviceDataHome;
  report.runtimeFilesDir = runtimeContext.runtimeFilesDir;

  try {
    const startResult = await serverManager.start(runtimeContext);
    report.startSuccess = startResult.success;
    if (!startResult.success) {
      report.error = startResult.summary;
      report.statusAfterStart = startResult.status;
      return report;
    }

    const online = await waitForResult(
      'backend PM2 online status',
      () => serverManager.status(runtimeContext),
      (value) => value.status === 'online',
      input.timeoutMs,
    );
    report.statusAfterStart = online.ok ? online.value.status : normalizeBackendStatus(online.value);
    if (!online.ok) {
      report.error = report.error ?? online.error;
    }

    const restartResult = await serverManager.restart(runtimeContext);
    report.restartSuccess = restartResult.success;
    if (!restartResult.success) {
      report.error = report.error ?? restartResult.summary;
      report.statusAfterRestart = restartResult.status;
      return report;
    }

    const restarted = await waitForResult(
      'backend PM2 restart status',
      () => serverManager.status(runtimeContext),
      (value) => value.status === 'online',
      input.timeoutMs,
    );
    report.statusAfterRestart = restarted.ok ? restarted.value.status : normalizeBackendStatus(restarted.value);
    if (!restarted.ok) {
      report.error = report.error ?? restarted.error;
    }

    const stopResult = await serverManager.stop(runtimeContext);
    report.stopSuccess = stopResult.success;
    if (!stopResult.success) {
      report.error = report.error ?? stopResult.summary;
      report.statusAfterStop = stopResult.status;
      return report;
    }

    const stopped = await waitForResult(
      'backend PM2 stopped status',
      () => serverManager.status(runtimeContext),
      (value) => value.status === 'stopped' || value.status === 'missing',
      input.timeoutMs,
    );
    report.statusAfterStop = stopped.ok ? stopped.value.status : normalizeBackendStatus(stopped.value);
    if (!stopped.ok) {
      report.error = report.error ?? stopped.error;
    }

    if (report.error) {
      const runtimeState = await serverManager.getRuntimeState(runtimeContext);
      report.diagnostics.push(...await collectDiagnosticLines(runtimeState.logPaths));
    }
  } finally {
    report.diagnostics.push(
      ...await cleanupManagedPm2State({
        processName: runtimeContext.appName,
        pm2Command: input.pm2Command,
        cwd: runtimeContext.serviceWorkingDirectory,
        env: {
          ...runtimeContext.commandEnv,
          PM2_HOME: runtimeContext.pm2Home,
        },
      }),
    );
    report.diagnostics.push(...await collectDiagnosticLines([
      path.join(runtimeContext.pm2LogsDirectory, `${runtimeContext.appName}-error.log`),
      path.join(runtimeContext.pm2LogsDirectory, `${runtimeContext.appName}-out.log`),
      path.join(runtimeContext.runtimeFilesDir, 'launch-contract.json'),
      runtimeContext.runtimeStateFilePath,
    ]));
    await runtimeContext.cleanup();
  }

  return report;
}

export async function verifyDesktopRuntimeLifecycle(): Promise<NonInteractiveRuntimeLifecycleReport> {
  const configManager = new ConfigManager();
  const pathManager = PathManager.getInstance();
  const dependencyManagementService = new DependencyManagementService();
  const pm2Context = await dependencyManagementService.getManagedCommandContext('pm2');
  const launchPlan = resolvePm2LaunchPlan(pm2Context.executablePath ?? 'pm2', {
    env: pm2Context.commandEnv,
  });
  const pm2LaunchCli = launchPlan.argsPrefix[0] ?? null;
  const timeoutMs = resolveVerificationTimeoutMs();
  const pm2Report: ManagedPm2Report = {
    npmGlobalPrefix: pm2Context.environment.npmGlobalPrefix,
    npmGlobalBinRoot: pm2Context.environment.npmGlobalBinRoot,
    npmGlobalModulesRoot: pm2Context.environment.npmGlobalModulesRoot,
    packageRoot: pm2Context.packageStatus?.packageRoot ?? null,
    executablePath: pm2Context.executablePath,
    packageVersion: pm2Context.packageStatus?.version ?? null,
    launchCommand: launchPlan.command,
    launchCli: pm2LaunchCli,
    launchShell: launchPlan.shell,
    launchCommandUnderManagedNode: isPathUnder(pm2Context.environment.nodeRuntimeRoot, launchPlan.command)
      || isPathUnder(pm2Context.environment.toolchainRoot, launchPlan.command),
    launchCliUnderManagedModules: isPathUnder(pm2Context.environment.npmGlobalModulesRoot, pm2LaunchCli),
  };

  const codeServerManager = new CodeServerManager({
    dependencyManagementService,
    configManager,
  });
  const omniRouteManager = new OmniRouteManager({
    configManager,
    dependencyManagementService,
  });
  const pm2MajorVersion = extractPm2MajorVersion(pm2Context.packageStatus?.version ?? null);
  const codeServerPm2Home = path.join(pathManager.getCodeServerRuntimeDataHome(), 'pm2', pm2MajorVersion);
  const omniRoutePm2Home = path.join(pathManager.getOmniRouteRuntimeDataHome(), 'pm2', pm2MajorVersion);

  const report: NonInteractiveRuntimeLifecycleReport = {
    ok: false,
    desktopLogsDirectory: app.getPath('logs'),
    pm2: pm2Report,
    services: {
      codeServer: createEmptyServiceReport(codeServerPm2Home, pathManager.getCodeServerRuntimeDataHome(), path.join(pathManager.getCodeServerRuntimeDataHome(), 'runtime')),
      omniRoute: createEmptyServiceReport(omniRoutePm2Home, pathManager.getOmniRouteRuntimeDataHome(), path.join(pathManager.getOmniRouteRuntimeDataHome(), 'runtime')),
      backend: createEmptyBackendReport(),
    },
    issues: [],
  };

  if (pm2Context.packageStatus?.status !== 'installed') {
    report.issues.push('Desktop-managed PM2 is not installed in the managed npm prefix.');
  }
  if (!pm2Context.executablePath || !isPathUnder(pm2Context.environment.npmGlobalBinRoot, pm2Context.executablePath)) {
    report.issues.push(`PM2 executable is outside the Desktop-managed npm bin root: ${pm2Context.executablePath ?? '<missing>'}`);
  }
  if (!pm2Report.launchCli) {
    report.issues.push('PM2 launch plan fell back to the ambient shell instead of the Desktop-managed PM2 CLI entrypoint.');
  } else if (!pm2Report.launchCliUnderManagedModules) {
    report.issues.push(`PM2 launch CLI is outside the Desktop-managed npm modules root: ${pm2Report.launchCli}`);
  }
  if (!pm2Report.launchCommandUnderManagedNode) {
    report.issues.push(`PM2 launch command is outside the Desktop-managed Node runtime root: ${pm2Report.launchCommand}`);
  }
  if (pm2Report.launchShell) {
    report.issues.push('PM2 launch plan unexpectedly requires shell execution.');
  }

  report.services.codeServer = await verifyCodeServerLifecycle({
    manager: codeServerManager,
    pm2Command: pm2Context.executablePath,
    cleanupEnv: pm2Context.commandEnv,
    pm2Home: codeServerPm2Home,
    timeoutMs,
  });
  report.services.omniRoute = await verifyOmniRouteLifecycle({
    manager: omniRouteManager,
    pm2Command: pm2Context.executablePath,
    cleanupEnv: pm2Context.commandEnv,
    pm2Home: omniRoutePm2Home,
    timeoutMs,
  });
  report.services.backend = await verifyBackendLifecycle({
    pathManager,
    configManager,
    dependencyManagementService,
    pm2Command: pm2Context.executablePath,
    timeoutMs,
  });

  for (const [serviceName, serviceReport] of Object.entries(report.services)) {
    if (!serviceReport.startSuccess) {
      report.issues.push(`${serviceName} failed to start under Desktop-managed PM2.`);
    }
    if (serviceReport.statusAfterStart !== 'online') {
      report.issues.push(`${serviceName} did not report online after start. Actual: ${serviceReport.statusAfterStart}`);
    }
    if ('restartSuccess' in serviceReport && !serviceReport.restartSuccess) {
      report.issues.push(`${serviceName} failed to restart under Desktop-managed PM2.`);
    }
    if ('statusAfterRestart' in serviceReport && serviceReport.statusAfterRestart !== 'online') {
      report.issues.push(`${serviceName} did not report online after restart. Actual: ${serviceReport.statusAfterRestart}`);
    }
    if (!serviceReport.stopSuccess) {
      report.issues.push(`${serviceName} failed to stop under Desktop-managed PM2.`);
    }
    if (!['stopped', 'missing'].includes(serviceReport.statusAfterStop)) {
      report.issues.push(`${serviceName} did not report stopped after stop. Actual: ${serviceReport.statusAfterStop}`);
    }
    if (serviceReport.error) {
      report.issues.push(`${serviceName}: ${serviceReport.error}`);
    }
  }

  report.ok = report.issues.length === 0;
  return report;
}
