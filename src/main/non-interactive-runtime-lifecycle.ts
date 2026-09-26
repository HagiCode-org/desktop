import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs/promises';
import { electron } from '../electron-api.js';
import { PathManager } from './path-manager.js';
import { PCodeWebServiceManager } from './web-service-manager.js';
import type { ActiveRuntimeDescriptor } from '../types/distribution-mode.js';

const { app } = electron;
const DEFAULT_VERIFICATION_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 500;

interface BackendLifecycleReport {
  activeRuntimeRoot: string;
  serviceDllPath: string;
  serviceWorkingDirectory: string;
  dotnetExecutablePath: string;
  port: number;
  skipped: boolean;
  skipReason: string | null;
  startSuccess: boolean;
  statusAfterStart: string;
  pidAfterStart: number | null;
  restartSuccess: boolean;
  statusAfterRestart: string;
  pidAfterRestart: number | null;
  stopSuccess: boolean;
  statusAfterStop: string;
  pidAfterStop: number | null;
  processIdentityVerified: boolean;
  error?: string;
}

export interface NonInteractiveRuntimeLifecycleReport {
  ok: boolean;
  desktopLogsDirectory: string;
  backend: BackendLifecycleReport;
  auxiliaryManagement: 'external';
  issues: string[];
}

function resolveVerificationTimeoutMs(): number {
  const configured = Number.parseInt(process.env.HAGICODE_NON_INTERACTIVE_INTEGRATION_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_VERIFICATION_TIMEOUT_MS;
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

async function reserveEphemeralPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Unable to allocate an ephemeral loopback port for the backend lifecycle check.');
  }
  const { port } = address;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

async function waitForStatus(
  manager: PCodeWebServiceManager,
  expectedStatus: 'running' | 'stopped',
  timeoutMs: number,
): Promise<Awaited<ReturnType<PCodeWebServiceManager['getStatus']>>> {
  const deadline = Date.now() + timeoutMs;
  let status = await manager.getStatus();
  while (Date.now() < deadline) {
    status = await manager.getStatus();
    if (status.status === expectedStatus) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
  }
  return status;
}

async function hasPersistedProcessIdentity(
  runtimeDataRoot: string,
  pid: number | null,
  serviceDllPath: string,
): Promise<boolean> {
  if (pid === null) {
    return false;
  }
  let contents: string;
  try {
    contents = await fs.readFile(path.join(runtimeDataRoot, 'backend-process.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
  const identity: unknown = JSON.parse(contents);
  return Boolean(identity && typeof identity === 'object'
    && 'pid' in identity && identity.pid === pid
    && 'serviceDllPath' in identity
    && typeof identity.serviceDllPath === 'string'
    && path.resolve(identity.serviceDllPath) === path.resolve(serviceDllPath));
}

async function isPersistedProcessIdentityCleared(runtimeDataRoot: string): Promise<boolean> {
  try {
    await fs.access(path.join(runtimeDataRoot, 'backend-process.json'));
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return true;
    }
    throw error;
  }
}

export async function verifyDesktopRuntimeLifecycle(): Promise<NonInteractiveRuntimeLifecycleReport> {
  const pathManager = PathManager.getInstance();
  const activeRuntime = buildEmbeddedRuntimeDescriptor(pathManager);
  const serviceDllPath = path.join(activeRuntime.rootPath, 'lib', 'PCode.Web.dll');
  const backend: BackendLifecycleReport = {
    activeRuntimeRoot: activeRuntime.rootPath,
    serviceDllPath,
    serviceWorkingDirectory: path.dirname(serviceDllPath),
    dotnetExecutablePath: pathManager.getEmbeddedDotnetPath(),
    port: 0,
    skipped: false,
    skipReason: null,
    startSuccess: false,
    statusAfterStart: 'unknown',
    pidAfterStart: null,
    restartSuccess: false,
    statusAfterRestart: 'unknown',
    pidAfterRestart: null,
    stopSuccess: false,
    statusAfterStop: 'unknown',
    pidAfterStop: null,
    processIdentityVerified: false,
  };
  try {
    await fs.access(serviceDllPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    backend.skipped = true;
    backend.skipReason = 'This Desktop package does not contain a portable backend payload; the direct lifecycle will run when one is included.';
    return {
      ok: true,
      desktopLogsDirectory: app.getPath('logs'),
      backend,
      auxiliaryManagement: 'external',
      issues: [],
    };
  }

  const port = await reserveEphemeralPort();
  backend.port = port;
  const manager = new PCodeWebServiceManager({
    host: '127.0.0.1',
    port,
    env: { ASPNETCORE_ENVIRONMENT: 'Production' },
  });
  manager.setActiveRuntime(activeRuntime);

  const issues: string[] = [];
  const timeoutMs = resolveVerificationTimeoutMs();

  try {
    const startResult = await manager.start();
    backend.startSuccess = startResult.success;
    const startStatus = await waitForStatus(manager, 'running', timeoutMs);
    backend.statusAfterStart = startStatus.status;
    backend.pidAfterStart = startStatus.pid;
    backend.processIdentityVerified = await hasPersistedProcessIdentity(
      pathManager.getRuntimeDataHome(),
      backend.pidAfterStart,
      serviceDllPath,
    );
    if (!startResult.success) {
      backend.error = startResult.parsedResult.errorMessage ?? startResult.resultSession.stderr;
    }

    if (backend.startSuccess && backend.statusAfterStart === 'running') {
      const restartResult = await manager.restart();
      backend.restartSuccess = restartResult.success;
      const restartStatus = await waitForStatus(manager, 'running', timeoutMs);
      backend.statusAfterRestart = restartStatus.status;
      backend.pidAfterRestart = restartStatus.pid;
      backend.processIdentityVerified = backend.processIdentityVerified
        && await hasPersistedProcessIdentity(
          pathManager.getRuntimeDataHome(),
          backend.pidAfterRestart,
          serviceDllPath,
        );
      if (!restartResult.success) {
        backend.error = restartResult.parsedResult.errorMessage ?? restartResult.resultSession.stderr;
      }
    }

    backend.stopSuccess = await manager.stop();
    const stopStatus = await waitForStatus(manager, 'stopped', timeoutMs);
    backend.statusAfterStop = stopStatus.status;
    backend.pidAfterStop = stopStatus.pid;
    backend.processIdentityVerified = backend.processIdentityVerified
      && backend.pidAfterStop === null
      && await isPersistedProcessIdentityCleared(pathManager.getRuntimeDataHome());
  } catch (error) {
    backend.error = error instanceof Error ? error.message : String(error);
  } finally {
    try {
      await manager.cleanup();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      backend.error = backend.error ? `${backend.error}; cleanup failed: ${message}` : `cleanup failed: ${message}`;
    }
  }

  if (!backend.startSuccess) {
    issues.push('Backend failed to start under the Desktop-owned .NET process lifecycle.');
  }
  if (backend.statusAfterStart !== 'running') {
    issues.push(`Backend did not report running after start. Actual: ${backend.statusAfterStart}`);
  }
  if (!backend.restartSuccess) {
    issues.push('Backend failed to restart under the Desktop-owned .NET process lifecycle.');
  }
  if (backend.statusAfterRestart !== 'running') {
    issues.push(`Backend did not report running after restart. Actual: ${backend.statusAfterRestart}`);
  }
  if (!backend.stopSuccess) {
    issues.push('Backend failed to stop under the Desktop-owned .NET process lifecycle.');
  }
  if (backend.statusAfterStop !== 'stopped') {
    issues.push(`Backend did not report stopped after stop. Actual: ${backend.statusAfterStop}`);
  }
  if (backend.pidAfterStart === null || backend.pidAfterRestart === null || backend.pidAfterStop !== null) {
    issues.push('Backend PID tracking did not report owned process IDs while running and clear the PID after stop.');
  }
  if (!backend.processIdentityVerified) {
    issues.push('Backend PID did not match its persisted runtime-scoped process identity.');
  }
  if (backend.error) {
    issues.push(`backend: ${backend.error}`);
  }

  return {
    ok: issues.length === 0,
    desktopLogsDirectory: app.getPath('logs'),
    backend,
    auxiliaryManagement: 'external',
    issues,
  };
}
