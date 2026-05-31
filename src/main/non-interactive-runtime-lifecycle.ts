import fs from 'node:fs/promises';
import path from 'node:path';
import type Store from 'electron-store';
import { electron } from '../electron-api.js';
import { ConfigManager } from './config.js';
import { DependencyManager } from './dependency-manager.js';
import DependencyManagementService from './dependency-management-service.js';
import { HagiscriptRuntimeContextResolver, type HagiscriptRuntimeContext } from './hagiscript-runtime-context.js';
import {
  HagiscriptServerManager,
  type HagiscriptServerLifecycleResult,
} from './hagiscript-server-manager.js';
import { PackageSourceConfigManager } from './package-source-config-manager.js';
import { PathManager } from './path-manager.js';
import { VersionManager } from './version-manager.js';
import { resolveManagedLaunchContextForRuntimeRoot } from './web-service-manager.js';
import type { ActiveRuntimeDescriptor } from '../types/distribution-mode.js';

const { app } = electron;

const DEFAULT_VERIFICATION_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MAX_LOG_TAIL_CHARS = 4_000;

interface ManagedRuntimeToolingReport {
  npmGlobalPrefix: string;
  npmGlobalBinRoot: string;
  npmGlobalModulesRoot: string;
  pm2PackageRoot: string | null;
  pm2ExecutablePath: string | null;
  pm2PackageVersion: string | null;
  pm2PackageUnderManagedModules: boolean;
  pm2ExecutableUnderManagedBin: boolean;
}

interface ManagedServiceStageReport {
  pm2Home: string;
  runtimeDataHome: string;
  runtimeFilesDir: string | null;
  launchScriptPath: string | null;
  launchWorkingDirectory: string | null;
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
  skipped: boolean;
  skipReason: string | null;
  restartSuccess: boolean;
  statusAfterRestart: string;
}

export interface NonInteractiveRuntimeLifecycleReport {
  ok: boolean;
  desktopLogsDirectory: string;
  tooling: ManagedRuntimeToolingReport;
  services: {
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

function normalizeLifecycleStatus(result: HagiscriptServerLifecycleResult | null): string {
  return result?.status ?? 'unknown';
}

async function collectHagiscriptManagedDiagnostics(input: {
  manager: HagiscriptServerManager;
  runtimeContext: HagiscriptRuntimeContext | null;
  fallbackPaths: readonly string[];
  serviceLabel: string;
}): Promise<string[]> {
  const diagnostics: string[] = [];
  const logPaths = new Set(input.fallbackPaths);

  if (!input.runtimeContext) {
    diagnostics.push(`${input.serviceLabel} runtime diagnostics skipped because the Desktop SDK runtime context could not be resolved.`);
    diagnostics.push(...await collectDiagnosticLines([...logPaths]));
    return diagnostics;
  }

  const addLogPaths = (paths: readonly string[]): void => {
    for (const targetPath of paths) {
      if (targetPath.length > 0) {
        logPaths.add(targetPath);
      }
    }
  };

  try {
    const statusResult = await input.manager.status(input.runtimeContext);
    addLogPaths(statusResult.logPaths);
    if (!statusResult.success) {
      diagnostics.push(`runtime status failed: ${statusResult.summary}`);
    } else if (!['stopped', 'missing'].includes(statusResult.status)) {
      const stopResult = await input.manager.stop(input.runtimeContext);
      addLogPaths(stopResult.logPaths);
      if (!stopResult.success) {
        diagnostics.push(`runtime cleanup stop failed: ${stopResult.summary}`);
      }

      const stoppedResult = await input.manager.status(input.runtimeContext);
      addLogPaths(stoppedResult.logPaths);
      if (!['stopped', 'missing'].includes(stoppedResult.status)) {
        diagnostics.push(`runtime cleanup status: ${normalizeLifecycleStatus(stoppedResult)}`);
      }
    }
  } catch (error) {
    diagnostics.push(`runtime cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const runtimeState = await input.manager.getRuntimeState(input.runtimeContext);
    addLogPaths(runtimeState.logPaths);
    if (!runtimeState.success) {
      diagnostics.push(`runtime state failed: ${runtimeState.summary}`);
    }
  } catch (error) {
    diagnostics.push(`runtime state threw: ${error instanceof Error ? error.message : String(error)}`);
  }

  diagnostics.push(...await collectDiagnosticLines([...logPaths]));
  return diagnostics;
}

function createEmptyServiceReport(pm2Home: string, runtimeDataHome: string, runtimeFilesDir: string | null): ManagedServiceStageReport {
  return {
    pm2Home,
    runtimeDataHome,
    runtimeFilesDir,
    launchScriptPath: null,
    launchWorkingDirectory: null,
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
    skipped: false,
    skipReason: null,
    restartSuccess: false,
    statusAfterRestart: 'unknown',
  };
}

function buildEmbeddedRuntimeDescriptor(pathManager: PathManager): ActiveRuntimeDescriptor {
  return {
    kind: 'portable-fixed',
    rootPath: pathManager.getEmbeddedRuntimeRoot(),
    versionId: `embedded-${app.getVersion()}-${pathManager.getCurrentPlatform()}`,
    versionLabel: app.getVersion(),
    displayName: 'embedded-runtime',
    isReadOnly: true,
  };
}

function normalizeBackendStatus(result: HagiscriptServerLifecycleResult | null): string {
  return result?.status ?? 'unknown';
}

async function verifyBackendLifecycle(input: {
  pathManager: PathManager;
  configManager: ConfigManager;
  dependencyManagementService: DependencyManagementService;
  timeoutMs: number;
}): Promise<BackendLifecycleReport> {
  const report = createEmptyBackendReport();
  const dependencyManager = new DependencyManager(input.configManager.getStore() as unknown as Store<Record<string, unknown>>);
  const packageSourceConfigManager = new PackageSourceConfigManager(input.configManager.getStore() as unknown as Store);
  const versionManager = new VersionManager(dependencyManager, packageSourceConfigManager);
  const distributionModeState = await versionManager.initializeDistributionMode();
  const activeRuntime = distributionModeState.activeRuntime
    ?? await versionManager.getActiveRuntimeDescriptor()
    ?? buildEmbeddedRuntimeDescriptor(input.pathManager);

  report.activeRuntimeRoot = activeRuntime?.rootPath ?? null;
  if (!activeRuntime) {
    report.error = 'Desktop did not resolve an active packaged runtime payload.';
    return report;
  }

  report.serviceDllPath = path.join(activeRuntime.rootPath, 'lib', 'PCode.Web.dll');
  report.serviceWorkingDirectory = path.join(activeRuntime.rootPath, 'lib');
  let launchContext: Awaited<ReturnType<typeof resolveManagedLaunchContextForRuntimeRoot>>;
  try {
    launchContext = await resolveManagedLaunchContextForRuntimeRoot(activeRuntime.rootPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Invalid service payload: Missing framework-dependent payload files:')) {
      report.skipped = true;
      report.skipReason = message;
      report.statusAfterStart = 'skipped';
      report.statusAfterRestart = 'skipped';
      report.stopSuccess = true;
      report.statusAfterStop = 'skipped';
      report.diagnostics.push(message);
      return report;
    }

    report.error = message;
    report.diagnostics.push(message);
    return report;
  }
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

    const restarted = await waitForResult<HagiscriptServerLifecycleResult>(
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

    const stopped = await waitForResult<HagiscriptServerLifecycleResult>(
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
      ...await collectHagiscriptManagedDiagnostics({
        manager: serverManager,
        runtimeContext,
        fallbackPaths: [
          path.join(runtimeContext.pm2LogsDirectory, `${runtimeContext.appName}-error.log`),
          path.join(runtimeContext.pm2LogsDirectory, `${runtimeContext.appName}-out.log`),
          path.join(runtimeContext.runtimeFilesDir, 'launch-contract.json'),
          runtimeContext.runtimeStateFilePath,
        ],
        serviceLabel: 'backend',
      }),
    );
    await runtimeContext.cleanup();
  }

  return report;
}

export async function verifyDesktopRuntimeLifecycle(): Promise<NonInteractiveRuntimeLifecycleReport> {
  const configManager = new ConfigManager();
  const pathManager = PathManager.getInstance();
  const dependencyManagementService = new DependencyManagementService();
  const pm2Context = await dependencyManagementService.getManagedCommandContext('pm2');
  const timeoutMs = resolveVerificationTimeoutMs();
  const runtimeContextResolver = new HagiscriptRuntimeContextResolver({
    pathManager,
    dependencyManagementService,
  });
  const toolingReport: ManagedRuntimeToolingReport = {
    npmGlobalPrefix: pm2Context.environment.npmGlobalPrefix,
    npmGlobalBinRoot: pm2Context.environment.npmGlobalBinRoot,
    npmGlobalModulesRoot: pm2Context.environment.npmGlobalModulesRoot,
    pm2PackageRoot: pm2Context.packageStatus?.packageRoot ?? null,
    pm2ExecutablePath: pm2Context.executablePath,
    pm2PackageVersion: pm2Context.packageStatus?.version ?? null,
    pm2PackageUnderManagedModules: isPathUnder(
      pm2Context.environment.npmGlobalModulesRoot,
      pm2Context.packageStatus?.packageRoot ?? null,
    ),
    pm2ExecutableUnderManagedBin: isPathUnder(
      pm2Context.environment.npmGlobalBinRoot,
      pm2Context.executablePath,
    ),
  };

  const report: NonInteractiveRuntimeLifecycleReport = {
    ok: false,
    desktopLogsDirectory: app.getPath('logs'),
    tooling: toolingReport,
    services: {
      backend: createEmptyBackendReport(),
    },
    issues: [],
  };

  if (pm2Context.packageStatus?.status !== 'installed') {
    report.issues.push('Desktop-managed PM2 is not installed in the managed npm prefix.');
  }
  if (!toolingReport.pm2PackageUnderManagedModules) {
    report.issues.push(`PM2 package root is outside the Desktop-managed npm modules root: ${toolingReport.pm2PackageRoot ?? '<missing>'}`);
  }
  if (!toolingReport.pm2ExecutableUnderManagedBin) {
    report.issues.push(`PM2 executable is outside the Desktop-managed npm bin root: ${toolingReport.pm2ExecutablePath ?? '<missing>'}`);
  }
  report.services.backend = await verifyBackendLifecycle({
    pathManager,
    configManager,
    dependencyManagementService,
    timeoutMs,
  });

  toolingReport.pm2ExecutableUnderManagedBin = isPathUnder(toolingReport.npmGlobalBinRoot, toolingReport.pm2ExecutablePath);

  for (const [serviceName, serviceReport] of Object.entries(report.services)) {
    if (serviceName === 'backend' && 'skipped' in serviceReport && serviceReport.skipped) {
      continue;
    }
    if (!serviceReport.startSuccess) {
      report.issues.push(`${serviceName} failed to start under the Desktop SDK runtime.`);
    }
    if (serviceReport.statusAfterStart !== 'online') {
      report.issues.push(`${serviceName} did not report online after start. Actual: ${serviceReport.statusAfterStart}`);
    }
    if ('restartSuccess' in serviceReport && !serviceReport.restartSuccess) {
      report.issues.push(`${serviceName} failed to restart under the Desktop SDK runtime.`);
    }
    if ('statusAfterRestart' in serviceReport && serviceReport.statusAfterRestart !== 'online') {
      report.issues.push(`${serviceName} did not report online after restart. Actual: ${serviceReport.statusAfterRestart}`);
    }
    if (!serviceReport.stopSuccess) {
      report.issues.push(`${serviceName} failed to stop under the Desktop SDK runtime.`);
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
