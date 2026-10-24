import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { createWebServiceStatusPublisher, startWebServiceStatusPoller } from '../status-publisher.js';
import type { ProcessInfo } from '../web-service-manager.js';

function statusInfo(overrides: Partial<ProcessInfo> = {}): ProcessInfo {
  return {
    status: 'stopped',
    uptime: 0,
    startTime: null,
    pid: null,
    url: null,
    restartCount: 0,
    phase: 'idle' as ProcessInfo['phase'],
    port: 36556,
    host: '127.0.0.1',
    ...overrides,
  };
}

function createSinks() {
  return {
    sendToRenderer: mock.fn<(info: ProcessInfo) => void>(),
    applyToShell: mock.fn<(info: ProcessInfo) => void>(),
  };
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('createWebServiceStatusPublisher', () => {
  it('sends nothing for an identical payload', () => {
    const sinks = createSinks();
    const publisher = createWebServiceStatusPublisher(sinks);

    assert.equal(publisher.publish(statusInfo()), true);
    assert.equal(publisher.publish(statusInfo()), false);

    assert.equal(sinks.sendToRenderer.mock.callCount(), 1);
    assert.equal(sinks.applyToShell.mock.callCount(), 1);
  });

  it('publishes when uptime advances on a running service', () => {
    const sinks = createSinks();
    const publisher = createWebServiceStatusPublisher(sinks);

    publisher.publish(statusInfo({ status: 'running', uptime: 5000, url: 'http://127.0.0.1:36556' }));
    publisher.publish(statusInfo({ status: 'running', uptime: 10000, url: 'http://127.0.0.1:36556' }));

    assert.equal(sinks.sendToRenderer.mock.callCount(), 2);
    assert.equal(sinks.applyToShell.mock.callCount(), 2);
  });

  it('publishes an identical payload when forced', () => {
    const sinks = createSinks();
    const publisher = createWebServiceStatusPublisher(sinks);

    publisher.publish(statusInfo());
    assert.equal(publisher.publish(statusInfo(), { force: true }), true);

    assert.equal(sinks.sendToRenderer.mock.callCount(), 2);
    assert.equal(sinks.applyToShell.mock.callCount(), 2);
  });
});

describe('startWebServiceStatusPoller', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setInterval'] });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it('sends exactly one IPC event across twelve stopped-state ticks', async () => {
    const sinks = createSinks();
    const readStatus = mock.fn(async () => statusInfo());
    const stop = startWebServiceStatusPoller({
      intervalMs: 5000,
      canPoll: () => true,
      readStatus,
      publisher: createWebServiceStatusPublisher(sinks),
      onError: () => assert.fail('poller should not fail'),
    });

    for (let tick = 0; tick < 12; tick += 1) {
      mock.timers.tick(5000);
      await flushPromises();
    }
    stop();

    assert.equal(readStatus.mock.callCount(), 12);
    assert.equal(sinks.sendToRenderer.mock.callCount(), 1);
    assert.equal(sinks.applyToShell.mock.callCount(), 1);
  });

  it('applies tray status, menu and URL from the managed loop for each state', async () => {
    const states: ProcessInfo[] = [
      statusInfo({ status: 'stopped' }),
      statusInfo({ status: 'starting', phase: 'healthCheck' as ProcessInfo['phase'] }),
      statusInfo({ status: 'running', uptime: 1000, url: 'http://127.0.0.1:36556' }),
      statusInfo({ status: 'error', phase: 'error' as ProcessInfo['phase'] }),
    ];
    const sinks = createSinks();
    let index = 0;
    const stop = startWebServiceStatusPoller({
      intervalMs: 5000,
      canPoll: () => true,
      readStatus: async () => states[index++],
      publisher: createWebServiceStatusPublisher(sinks),
      onError: () => assert.fail('poller should not fail'),
    });

    for (let tick = 0; tick < states.length; tick += 1) {
      mock.timers.tick(5000);
      await flushPromises();
    }
    stop();

    const applied = sinks.applyToShell.mock.calls.map((call) => call.arguments[0].status);
    assert.deepEqual(applied, ['stopped', 'starting', 'running', 'error']);
    assert.equal(sinks.applyToShell.mock.calls[2].arguments[0].url, 'http://127.0.0.1:36556');
  });

  it('does not read status while polling is not allowed', async () => {
    const readStatus = mock.fn(async () => statusInfo());
    const stop = startWebServiceStatusPoller({
      intervalMs: 5000,
      canPoll: () => false,
      readStatus,
      publisher: createWebServiceStatusPublisher(createSinks()),
      onError: () => assert.fail('poller should not fail'),
    });

    mock.timers.tick(5000);
    await flushPromises();
    stop();

    assert.equal(readStatus.mock.callCount(), 0);
  });
});
