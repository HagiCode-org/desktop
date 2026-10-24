import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn as spawnChild, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { describe, it } from 'node:test';
import { BackendProcessOwner } from '../backend-process-owner.js';
import { PCodeWebServiceManager, type ProcessInfo, type StartupClock } from '../web-service-manager.js';
import { WEB_SERVICE_STARTUP_TIMEOUT_ENV_KEY } from '../web-service-startup-timeouts.js';
import type { DesktopHttpClient } from '../http-client.js';
import type { ActiveRuntimeDescriptor } from '../../types/distribution-mode.js';

interface LifecycleFixture {
  root: string;
  manager: PCodeWebServiceManager;
  spawnCount(): number;
  spawned: Promise<ChildProcess>;
  port: number;
  serviceDllPath(runtimeName?: string): string;
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

interface VirtualStartupClock extends StartupClock {
  onTick(listener: (now: number) => void): void;
}

/**
 * Virtual time for startup waits: sleeping advances `now` at once, so a 35 s
 * listen delay is covered in milliseconds of real time.
 */
function createVirtualStartupClock(): VirtualStartupClock {
  let current = 0;
  const listeners: Array<(now: number) => void> = [];
  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += ms;
      for (const listener of listeners) {
        listener(current);
      }
      await new Promise((resolve) => setImmediate(resolve));
    },
    onTick: (listener) => {
      listeners.push(listener);
    },
  };
}

async function createLifecycleFixture(options: {
  readyDelayMs?: number;
  exitAfterReadyMs?: number;
  listen?: boolean;
  ignoreTermination?: boolean;
  startupTimeoutMs?: number;
  useStartupLimitDefaults?: boolean;
  startupClock?: StartupClock;
  probePort?: (host: string, port: number) => Promise<boolean>;
  httpClient?: DesktopHttpClient;
  shutdownTimeoutMs?: number;
  maxRestartAttempts?: number;
} = {}): Promise<LifecycleFixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-owned-lifecycle-'));
  const runtimeDataRoot = path.join(root, 'runtime-data');
  const port = await reservePort();
  const serviceDllPath = (runtimeName = 'version-a') => path.join(root, runtimeName, 'lib', 'PCode.Web.dll');
  await fs.mkdir(path.dirname(serviceDllPath()), { recursive: true });
  await fs.writeFile(serviceDllPath(), '');
  const pendingChildren: ChildProcess[] = [];
  let resolveSpawned!: (child: ChildProcess) => void;
  let spawnedPromise = new Promise<ChildProcess>((resolve) => {
    resolveSpawned = resolve;
  });
  let launches = 0;
  let latestDllPath = serviceDllPath();
  const processIdentity = new Map<number, string>();
  const pathManager = {
    getRuntimeProgramHome: () => path.join(root, 'runtime'),
    getBundledRuntimeProgramHome: () => path.join(root, 'runtime'),
    getRuntimeDataHome: () => runtimeDataRoot,
    getUserDataPath: () => root,
    getManagedServerProgramHome: () => path.join(root, 'server-program'),
    getEmbeddedRuntimeContainerRoot: () => path.join(root, 'dotnet'),
    getEmbeddedRuntimeRoot: () => path.join(root, 'dotnet'),
    getCurrentPlatform: () => process.platform === 'win32'
      ? 'win-x64' as const
      : process.platform === 'darwin'
        ? 'osx-x64' as const
        : 'linux-x64' as const,
    getDesktopLogsDirectory: () => path.join(root, 'logs'),
    getDesktopAppsRoot: () => path.join(root, 'apps'),
    getDesktopConfigDirectory: () => path.join(root, 'config'),
    getEmbeddedDotnetPath: () => process.execPath,
    getInstalledVersionPath: (versionId: string) => path.join(root, versionId),
    getPaths: () => ({
      userData: root,
      runtimeDataRoot,
      appsInstalled: path.join(root, 'versions'),
      appsData: path.join(root, 'apps-data'),
      config: path.join(root, 'config'),
      cache: path.join(root, 'cache'),
      webServiceConfig: path.join(root, 'config', 'web-service.json'),
    }),
    getDataDirectory: () => path.join(root, 'data'),
    getAppSettingsPath: () => path.join(root, 'appsettings.yml'),
  };
  const owner = new BackendProcessOwner(path.join(runtimeDataRoot, 'backend-process.json'), {
    spawn: (_executable, args, spawnOptions) => {
      launches += 1;
      latestDllPath = String(args?.[0] ?? serviceDllPath());
      const script = [
        'const http = require("node:http");',
        `if (${options.ignoreTermination ?? false}) process.on("SIGTERM", () => {});`,
        `const shouldListen = ${options.listen !== false};`,
        `const readyDelayMs = ${options.readyDelayMs ?? 0};`,
        `const exitAfterReadyMs = ${options.exitAfterReadyMs ?? 0};`,
        'if (shouldListen) {',
        '  setTimeout(() => {',
        '    const server = http.createServer((request, response) => {',
        '      response.statusCode = request.url === "/api/health" ? 200 : 404;',
        '      response.end("ok");',
        '    });',
        `    server.listen(${port}, "127.0.0.1", () => {`,
        '      if (exitAfterReadyMs > 0) setTimeout(() => process.exit(0), exitAfterReadyMs);',
        '    });',
        '  }, readyDelayMs);',
        '} else {',
        '  setInterval(() => {}, 1000);',
        '}',
      ].join('\n');
      const child = spawnChild(process.execPath, ['-e', script, latestDllPath], spawnOptions);
      pendingChildren.push(child);
      const childPid = child.pid;
      if (childPid) {
        processIdentity.set(childPid, `created-${childPid}`);
        child.once('exit', () => processIdentity.delete(childPid));
      }
      resolveSpawned(child);
      spawnedPromise = new Promise<ChildProcess>((resolve) => {
        resolveSpawned = resolve;
      });
      return child;
    },
    inspectProcess: async (pid) => {
      const creationIdentity = processIdentity.get(pid);
      if (!creationIdentity) {
        return null;
      }
      return {
        executablePath: process.execPath,
        creationIdentity,
        commandLine: `${process.execPath} ${latestDllPath}`,
      };
    },
    signalProcessTree: async (pid, signal) => {
      process.kill(process.platform === 'win32' ? pid : -pid, signal);
    },
    platform: process.platform,
  });
  const manager = new PCodeWebServiceManager({
    host: '127.0.0.1',
    port,
  }, {
    pathManager,
    backendProcessOwner: owner,
    resolveLaunchContext: async (runtimeRoot) => {
      const dllPath = path.join(runtimeRoot, 'lib', 'PCode.Web.dll');
      await fs.mkdir(path.dirname(dllPath), { recursive: true });
      await fs.writeFile(dllPath, '');
      return {
        serviceDllPath: dllPath,
        serviceWorkingDirectory: path.dirname(dllPath),
        requiredRuntimeLabel: '8.0',
      };
    },
    prepareServiceEnvironment: async () => ({}),
    startupTimeoutMs: options.useStartupLimitDefaults ? undefined : (options.startupTimeoutMs ?? 2_000),
    startupClock: options.startupClock,
    probePort: options.probePort,
    httpClient: options.httpClient,
    shutdownTimeoutMs: options.shutdownTimeoutMs ?? 100,
    maxRestartAttempts: options.maxRestartAttempts,
  });
  manager.setActiveRuntime({
    kind: 'installed-version',
    rootPath: path.join(root, 'version-a'),
    versionId: 'version-a',
    versionLabel: 'version-a',
    displayName: 'HagiCode Server',
    isReadOnly: false,
  });

  return {
    root,
    manager,
    spawnCount: () => launches,
    spawned: spawnedPromise,
    port,
    serviceDllPath,
  };
}

async function waitForStatus(
  manager: PCodeWebServiceManager,
  predicate: (status: Awaited<ReturnType<PCodeWebServiceManager['getStatus']>>) => boolean,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  let status = await manager.getStatus();
  while (!predicate(status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    status = await manager.getStatus();
  }
  return status;
}

function runtime(rootPath: string, versionId: string): ActiveRuntimeDescriptor {
  return {
    kind: 'installed-version',
    rootPath,
    versionId,
    versionLabel: versionId,
    displayName: 'HagiCode Server',
    isReadOnly: false,
  };
}

describe('Desktop-owned backend lifecycle', () => {
  it('keeps startup in starting until HTTP health succeeds and coalesces concurrent starts', async () => {
    const fixture = await createLifecycleFixture({ readyDelayMs: 200 });
    try {
      const firstStart = fixture.manager.start();
      const child = await fixture.spawned;
      assert.ok(child.pid);
      const pendingStatus = await fixture.manager.getStatus();
      assert.equal(pendingStatus.status, 'starting');
      assert.equal(pendingStatus.pid, child.pid);
      const identity = JSON.parse(await fs.readFile(
        path.join(fixture.root, 'runtime-data', 'backend-process.json'),
        'utf8',
      )) as { pid: number; serviceDllPath: string };
      assert.equal(identity.pid, child.pid);
      assert.equal(identity.serviceDllPath, fixture.serviceDllPath());

      const [first, second] = await Promise.all([firstStart, fixture.manager.start()]);
      assert.equal(first.success, true);
      assert.equal(second.success, true);
      assert.equal(fixture.spawnCount(), 1);
      assert.equal((await fixture.manager.getStatus()).status, 'running');
      assert.equal(await fixture.manager.stop(), true);
      const stoppedStatus = await fixture.manager.getStatus();
      assert.equal(stoppedStatus.status, 'stopped');
      assert.equal(stoppedStatus.pid, null);
    } finally {
      await fixture.manager.cleanup();
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('stops the prior runtime before starting a switched version', async () => {
    const fixture = await createLifecycleFixture();
    try {
      assert.equal((await fixture.manager.start()).success, true);
      fixture.manager.setActiveRuntime(runtime(path.join(fixture.root, 'version-b'), 'version-b'));
      assert.equal((await fixture.manager.start()).success, true);
      assert.equal(fixture.spawnCount(), 2);
      assert.equal((await fixture.manager.getStatus()).status, 'running');
      assert.equal(await fixture.manager.stop(), true);
    } finally {
      await fixture.manager.cleanup();
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('stops a child when the startup listening timeout expires', async () => {
    const fixture = await createLifecycleFixture({ listen: false, startupTimeoutMs: 100 });
    try {
      const result = await fixture.manager.start();
      assert.equal(result.success, false);
      assert.match(result.parsedResult.errorMessage ?? '', /did not listen/);
      // The alive-but-silent child gets one retry from the default restart budget.
      assert.equal(fixture.spawnCount(), 2);
      assert.equal((await fixture.manager.getStatus()).status, 'error');
    } finally {
      await fixture.manager.cleanup();
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('does not adopt an unrelated process already listening on the backend port', async () => {
    const fixture = await createLifecycleFixture();
    const listener = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        listener.once('error', reject);
        listener.listen(fixture.port, '127.0.0.1', resolve);
      });
      const result = await fixture.manager.start();
      assert.equal(result.success, false);
      assert.match(result.parsedResult.errorMessage ?? '', /will not adopt a port-only listener/);
      assert.equal(fixture.spawnCount(), 0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        listener.close((error) => error ? reject(error) : resolve());
      });
      await fixture.manager.cleanup();
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('retries unexpected exits only within the configured restart budget', async () => {
    const fixture = await createLifecycleFixture({
      exitAfterReadyMs: 1_200,
      maxRestartAttempts: 1,
      startupTimeoutMs: 2_000,
    });
    try {
      assert.equal((await fixture.manager.start()).success, true);
      const finalStatus = await waitForStatus(
        fixture.manager,
        (status) => status.status === 'error' && status.restartCount === 1,
        7_000,
      );
      assert.equal(finalStatus.status, 'error');
      assert.equal(finalStatus.restartCount, 1);
      assert.equal(fixture.spawnCount(), 2);
    } finally {
      await fixture.manager.cleanup();
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('waits for a bounded shutdown and force-stops an unresponsive child on quit', async () => {
    const fixture = await createLifecycleFixture({
      ignoreTermination: true,
      shutdownTimeoutMs: 25,
    });
    try {
      assert.equal((await fixture.manager.start()).success, true);
      const child = await fixture.spawned;
      await fixture.manager.cleanup();
      assert.equal(child.signalCode, 'SIGKILL');
      assert.equal((await fixture.manager.getStatus()).status, 'stopped');
    } finally {
      await fixture.manager.cleanup();
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });
});

interface StartupPhaseEvent {
  phase: string;
  message?: string;
  timestamp: number;
  slow?: boolean;
  elapsedMs?: number;
}

function captureStartupPhaseEvents(): { events: StartupPhaseEvent[]; restore(): void } {
  const globals = globalThis as { mainWindow?: unknown };
  const previous = globals.mainWindow;
  const events: StartupPhaseEvent[] = [];
  globals.mainWindow = {
    webContents: {
      send: (channel: string, payload: StartupPhaseEvent) => {
        if (channel === 'web-service-startup-phase') {
          events.push(payload);
        }
      },
    },
  };
  return {
    events,
    restore: () => {
      globals.mainWindow = previous;
    },
  };
}

function healthyHttpClient(isHealthy: () => boolean): DesktopHttpClient {
  return {
    requestText: async () => {
      if (!isHealthy()) {
        throw new Error('connect ECONNREFUSED 127.0.0.1');
      }
      return { status: 200, text: 'ok' };
    },
  } as unknown as DesktopHttpClient;
}

function noteBackendOutput(manager: PCodeWebServiceManager, text: string): void {
  (manager as unknown as { noteBackendOutput(text: string): void }).noteBackendOutput(text);
}

async function disposeFixture(fixture: LifecycleFixture): Promise<void> {
  await fixture.manager.cleanup();
  await fs.rm(fixture.root, { recursive: true, force: true });
}

describe('Desktop-owned backend startup readiness', () => {
  it('resolves the startup limit per start, with a longer limit before the first successful start', async () => {
    const previousOverride = process.env[WEB_SERVICE_STARTUP_TIMEOUT_ENV_KEY];
    delete process.env[WEB_SERVICE_STARTUP_TIMEOUT_ENV_KEY];
    const fixture = await createLifecycleFixture({ useStartupLimitDefaults: true });
    try {
      const first = await fixture.manager.start();
      assert.equal(first.success, true);
      assert.match(first.resultSession.stdout, /Startup limit 180 s/);
      assert.equal(await fixture.manager.stop(), true);

      const second = await fixture.manager.start();
      assert.equal(second.success, true);
      assert.match(second.resultSession.stdout, /Startup limit 120 s/);
      assert.equal(await fixture.manager.stop(), true);
    } finally {
      if (previousOverride === undefined) {
        delete process.env[WEB_SERVICE_STARTUP_TIMEOUT_ENV_KEY];
      } else {
        process.env[WEB_SERVICE_STARTUP_TIMEOUT_ENV_KEY] = previousOverride;
      }
      await disposeFixture(fixture);
    }
  });

  it('keeps waiting for a backend that listens at 35 seconds and starts it once', async () => {
    const clock = createVirtualStartupClock();
    const fixture = await createLifecycleFixture({
      listen: false,
      startupClock: clock,
      startupTimeoutMs: 120_000,
      probePort: async () => clock.now() >= 35_000,
      httpClient: healthyHttpClient(() => clock.now() >= 35_000),
    });
    try {
      const result = await fixture.manager.start();
      assert.equal(result.success, true);
      assert.equal(fixture.spawnCount(), 1);
      assert.equal((await fixture.manager.getStatus()).status, 'running');
    } finally {
      await disposeFixture(fixture);
    }
  });

  it('ends a slow start promptly when the user stops the service at 40 seconds', async () => {
    const clock = createVirtualStartupClock();
    const stopRequests: Array<Promise<boolean>> = [];
    let fixture!: LifecycleFixture;
    fixture = await createLifecycleFixture({
      listen: false,
      startupClock: clock,
      startupTimeoutMs: 120_000,
      probePort: async () => false,
      httpClient: healthyHttpClient(() => false),
    });
    clock.onTick((now) => {
      if (now >= 40_000 && stopRequests.length === 0) {
        stopRequests.push(fixture.manager.stop());
      }
    });
    try {
      const result = await fixture.manager.start();
      assert.equal(await stopRequests[0], true);
      assert.equal(result.success, false);
      assert.match(result.parsedResult.errorMessage ?? '', /stopped before the owned backend became ready/);
      assert.ok(clock.now() <= 41_000, `stop completed at ${clock.now()} ms`);
      assert.equal(fixture.spawnCount(), 1);
      assert.equal((await fixture.manager.getStatus()).status, 'stopped');
    } finally {
      await disposeFixture(fixture);
    }
  });

  it('treats the first output as progress so a listener at 38 seconds shows no slow-start notice', async () => {
    const clock = createVirtualStartupClock();
    const capture = captureStartupPhaseEvents();
    let outputSent = false;
    let fixture!: LifecycleFixture;
    fixture = await createLifecycleFixture({
      listen: false,
      startupClock: clock,
      startupTimeoutMs: 120_000,
      probePort: async () => clock.now() >= 38_000,
      httpClient: healthyHttpClient(() => clock.now() >= 38_000),
    });
    clock.onTick((now) => {
      if (now >= 28_000 && !outputSent) {
        outputSent = true;
        noteBackendOutput(fixture.manager, 'Application starting');
      }
    });
    try {
      const result = await fixture.manager.start();
      assert.equal(result.success, true);
      assert.equal(capture.events.filter((event) => event.slow === true).length, 0);
      assert.match(result.resultSession.stdout, /Backend first output after 28 s/);
    } finally {
      capture.restore();
      await disposeFixture(fixture);
    }
  });

  it('shows a slow-start indication after 30 seconds of silence and refreshes it every 5 seconds', async () => {
    const clock = createVirtualStartupClock();
    const capture = captureStartupPhaseEvents();
    const slowStatuses: ProcessInfo[] = [];
    let statusRequested = false;
    let fixture!: LifecycleFixture;
    fixture = await createLifecycleFixture({
      listen: false,
      startupClock: clock,
      startupTimeoutMs: 120_000,
      probePort: async () => clock.now() >= 50_000,
      httpClient: healthyHttpClient(() => clock.now() >= 50_000),
    });
    clock.onTick((now) => {
      if (now >= 31_000 && !statusRequested) {
        statusRequested = true;
        void fixture.manager.getStatus().then((status) => slowStatuses.push(status));
      }
    });
    try {
      const result = await fixture.manager.start();
      assert.equal(result.success, true);

      const slowEvents = capture.events.filter((event) => event.slow === true);
      assert.equal(slowEvents[0]?.elapsedMs, 30_000);
      assert.ok(slowEvents.length >= 4, `expected at least four refreshes, got ${slowEvents.length}`);
      for (let index = 1; index < slowEvents.length; index += 1) {
        const gap = (slowEvents[index].elapsedMs ?? 0) - (slowEvents[index - 1].elapsedMs ?? 0);
        assert.ok(gap >= 5_000 && gap <= 5_500, `refresh gap was ${gap} ms`);
      }

      assert.equal(slowStatuses[0]?.status, 'starting');
      assert.equal(slowStatuses[0]?.slowStart, true);
      assert.ok((slowStatuses[0]?.startupElapsedMs ?? 0) >= 30_000);

      const running = await fixture.manager.getStatus();
      assert.equal(running.status, 'running');
      assert.equal(running.slowStart, undefined);
      assert.equal(running.startupElapsedMs, undefined);
      assert.equal(capture.events[capture.events.length - 1]?.slow, false);
    } finally {
      capture.restore();
      await disposeFixture(fixture);
    }
  });

  it('relaunches once when an alive backend misses the deadline and then starts', async () => {
    const clock = createVirtualStartupClock();
    const capture = captureStartupPhaseEvents();
    let fixture!: LifecycleFixture;
    const secondAttemptListening = () => fixture.spawnCount() >= 2;
    fixture = await createLifecycleFixture({
      listen: false,
      startupClock: clock,
      startupTimeoutMs: 120_000,
      probePort: async () => secondAttemptListening(),
      httpClient: healthyHttpClient(secondAttemptListening),
    });
    try {
      const result = await fixture.manager.start();
      assert.equal(result.success, true);
      assert.equal(fixture.spawnCount(), 2);
      assert.equal((await fixture.manager.getStatus()).status, 'running');
      assert.match(result.resultSession.stdout, /retrying 1\/3/);
      assert.match(result.resultSession.stdout, /did not listen/);
      assert.equal(capture.events.some((event) => event.phase === 'error'), false);
      assert.equal(capture.events.some((event) => event.message === 'Retrying the owned backend start...'), true);
    } finally {
      capture.restore();
      await disposeFixture(fixture);
    }
  });

  it('reports error with both attempts in the log when the retry also misses the deadline', async () => {
    const clock = createVirtualStartupClock();
    let fixture!: LifecycleFixture;
    fixture = await createLifecycleFixture({
      listen: false,
      startupClock: clock,
      startupTimeoutMs: 120_000,
      probePort: async () => false,
      httpClient: healthyHttpClient(() => false),
    });
    try {
      const result = await fixture.manager.start();
      assert.equal(result.success, false);
      assert.equal(fixture.spawnCount(), 2);
      assert.equal((await fixture.manager.getStatus()).status, 'error');
      const log = result.parsedResult.rawOutput ?? '';
      assert.equal(log.match(/did not listen/g)?.length, 2);
      assert.equal(log.match(/no output received/g)?.length, 2);
      assert.match(log, /retrying 1\/3/);
      assert.match(result.parsedResult.errorMessage ?? '', /did not listen.*within the 120 s startup limit.*backend still alive, pid \d+/);
    } finally {
      await disposeFixture(fixture);
    }
  });

  it('reports the health-check miss with liveness when the port listened but health never passed', async () => {
    const clock = createVirtualStartupClock();
    let fixture!: LifecycleFixture;
    fixture = await createLifecycleFixture({
      listen: false,
      startupClock: clock,
      startupTimeoutMs: 120_000,
      probePort: async () => true,
      httpClient: healthyHttpClient(() => false),
    });
    try {
      const result = await fixture.manager.start();
      assert.equal(result.success, false);
      assert.match(result.parsedResult.errorMessage ?? '', /failed its HTTP health check within the 120 s startup limit.*backend still alive/);
      assert.equal((await fixture.manager.getStatus()).status, 'error');
    } finally {
      await disposeFixture(fixture);
    }
  });

  it('does not retry an alive backend once the automatic restart budget is spent', async () => {
    const fixture = await createLifecycleFixture({
      exitAfterReadyMs: 1_200,
      maxRestartAttempts: 1,
      startupTimeoutMs: 600,
      probePort: async () => fixture.spawnCount() === 1,
      httpClient: healthyHttpClient(() => fixture.spawnCount() === 1),
    });
    try {
      assert.equal((await fixture.manager.start()).success, true);
      const finalStatus = await waitForStatus(
        fixture.manager,
        (status) => status.status === 'error' && status.restartCount === 1,
        7_000,
      );
      assert.equal(finalStatus.status, 'error');
      assert.equal(finalStatus.restartCount, 1);
      assert.equal(fixture.spawnCount(), 2);
    } finally {
      await disposeFixture(fixture);
    }
  });
});
