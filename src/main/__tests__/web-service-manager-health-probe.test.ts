import assert from 'node:assert/strict';
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
