import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn as spawnChild, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { describe, it } from 'node:test';
import { BackendProcessOwner } from '../backend-process-owner.js';
import { PCodeWebServiceManager } from '../web-service-manager.js';
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

async function createLifecycleFixture(options: {
  readyDelayMs?: number;
  exitAfterReadyMs?: number;
  listen?: boolean;
  ignoreTermination?: boolean;
  startupTimeoutMs?: number;
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
    startupTimeoutMs: options.startupTimeoutMs ?? 2_000,
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
