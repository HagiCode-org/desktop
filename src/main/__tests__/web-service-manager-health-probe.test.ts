import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { afterEach, describe, it, mock } from 'node:test';
import log from 'electron-log';
import type { BackendProcessOwner } from '../backend-process-owner.js';
import { PCodeWebServiceManager } from '../web-service-manager.js';

interface ProbeHarness {
  manager: PCodeWebServiceManager;
  owner: { snapshot: { pid: number; startTime: number; identity: object; isAlive(): boolean; waitForExit(): Promise<boolean> } | null };
  requestText: ReturnType<typeof mock.fn>;
}

function createHarness(ownedAlive: boolean): ProbeHarness {
  const requestText = mock.fn(async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:36556');
  });
  const owner: ProbeHarness['owner'] = {
    snapshot: ownedAlive
      ? {
        pid: 4321,
        startTime: Date.now(),
        identity: {},
        isAlive: () => true,
        waitForExit: async () => true,
      }
      : null,
  };
  const manager = new PCodeWebServiceManager(
    { host: '127.0.0.1', port: 36556 },
    {
      pathManager: {} as never,
      backendProcessOwner: {
        ...owner,
        reconcileOrphan: async () => undefined,
        stop: async () => undefined,
      } as unknown as BackendProcessOwner,
      httpClient: { requestText } as never,
    },
  );
  const harness = { manager, owner, requestText };
  manager.setActiveRuntime({
    kind: 'installed-version',
    rootPath: '/tmp/hagicode-probe-test',
    versionLabel: 'test',
    displayName: 'test',
    isReadOnly: false,
  });
  return harness;
}

type WithPerformHealthCheck = { performHealthCheck(): Promise<boolean> };

describe('PCodeWebServiceManager health probing', () => {
  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  it('makes no HTTP request while no backend is owned', async () => {
    const { manager, requestText } = createHarness(false);

    for (let poll = 0; poll < 5; poll += 1) {
      const status = await manager.getStatus();
      assert.equal(status.status, 'stopped');
    }

    assert.equal(requestText.mock.callCount(), 0);
  });

  it('logs one warn for ten consecutive failed health probes', async () => {
    const { manager } = createHarness(true);
    const warn = mock.method(log, 'warn', () => undefined);

    for (let probe = 0; probe < 10; probe += 1) {
      assert.equal(await (manager as unknown as WithPerformHealthCheck).performHealthCheck(), false);
    }

    const failureWarns = warn.mock.calls.filter((call) => (
      call.arguments[0] === '[WebService] Health check failed after trying all endpoints:'
    ));
    assert.equal(failureWarns.length, 1);
  });

  it('skips probes of an alive unhealthy backend while the backoff window is open', async () => {
    mock.timers.enable({ apis: ['Date'], now: 0 });
    const { manager, requestText } = createHarness(true);

    const first = await manager.getStatus();
    const second = await manager.getStatus();
    assert.equal(first.status, 'error');
    assert.equal(second.status, 'error');
    const probesAfterTwoPolls = requestText.mock.callCount();
    assert.ok(probesAfterTwoPolls > 0);

    mock.timers.tick(4000);
    await manager.getStatus();
    assert.equal(requestText.mock.callCount(), probesAfterTwoPolls);

    mock.timers.tick(1000);
    await manager.getStatus();
    assert.ok(requestText.mock.callCount() > probesAfterTwoPolls);
  });
});

describe('PCodeWebServiceManager delayed readiness on the shared deadline', () => {
  it('lets a health wait that begins at 35 seconds finish on the shared 120-second deadline', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-health-deadline-'));
    const port = await reserveFreePort();
    let virtualNow = 0;
    const startupClock = {
      now: () => virtualNow,
      sleep: async (ms: number) => {
        virtualNow += ms;
        await new Promise((resolve) => setImmediate(resolve));
      },
    };
    const requestText = mock.fn(async () => {
      if (virtualNow < 100_000) {
        throw new Error('connect ECONNREFUSED 127.0.0.1');
      }
      return { status: 200, text: 'ok' };
    });
    let alive = false;
    let startCount = 0;
    const snapshot = {
      pid: 4321,
      startTime: 0,
      identity: {},
      isAlive: () => alive,
      waitForExit: async () => true,
    };
    const owner = {
      get snapshot() {
        return alive ? snapshot : null;
      },
      start: async () => {
        startCount += 1;
        alive = true;
        return snapshot;
      },
      stop: async () => {
        alive = false;
        return true;
      },
      reconcileOrphan: async () => undefined,
    };
    const manager = new PCodeWebServiceManager(
      { host: '127.0.0.1', port },
      {
        pathManager: {
          getPaths: () => ({
            config: root,
            webServiceConfig: path.join(root, 'web-service.json'),
          }),
          getEmbeddedDotnetPath: () => process.execPath,
        } as never,
        backendProcessOwner: owner as unknown as BackendProcessOwner,
        httpClient: { requestText } as never,
        resolveLaunchContext: async (runtimeRoot: string) => ({
          serviceDllPath: path.join(runtimeRoot, 'PCode.Web.dll'),
          serviceWorkingDirectory: runtimeRoot,
        }),
        prepareServiceEnvironment: async () => ({}),
        startupTimeoutMs: 120_000,
        startupClock,
        probePort: async () => virtualNow >= 35_000,
      },
    );
    manager.setActiveRuntime({
      kind: 'installed-version',
      rootPath: path.join(root, 'version-a'),
      versionLabel: 'version-a',
      displayName: 'test',
      isReadOnly: false,
    });

    try {
      const result = await manager.start();
      assert.equal(result.success, true);
      assert.equal(startCount, 1);
      assert.ok(virtualNow >= 100_000 && virtualNow < 120_000, `health passed at ${virtualNow} ms`);
      assert.doesNotMatch(result.resultSession.stdout, /retrying/);
      assert.equal((await manager.getStatus()).status, 'running');
    } finally {
      await manager.cleanup();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

async function reserveFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const { port } = address;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}
