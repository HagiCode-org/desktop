import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSystemDiagnosticBridge } from '../system-diagnostic-bridge.js';

describe('system diagnostic preload bridge', () => {
  it('routes run calls through the configured IPC channel', async () => {
    const invocations: Array<{ channel: string; args: unknown[] }> = [];
    const bridge = createSystemDiagnosticBridge(
      {
        async invoke(channel, ...args) {
          invocations.push({ channel, args });
          return { report: 'report', summary: { status: 'success' } };
        },
      },
      {
        run: 'system-diagnostic:run',
        getLast: 'system-diagnostic:get-last',
      },
    );

    const result = await bridge.run();

    assert.deepEqual(invocations, [{ channel: 'system-diagnostic:run', args: [] }]);
    assert.equal(result.report, 'report');
  });

  it('routes getLast calls through the configured IPC channel', async () => {
    const invocations: Array<{ channel: string; args: unknown[] }> = [];
    const bridge = createSystemDiagnosticBridge(
      {
        async invoke(channel, ...args) {
          invocations.push({ channel, args });
          return null;
        },
      },
      {
        run: 'system-diagnostic:run',
        getLast: 'system-diagnostic:get-last',
      },
    );

    const result = await bridge.getLast();

    assert.equal(result, null);
    assert.deepEqual(invocations, [{ channel: 'system-diagnostic:get-last', args: [] }]);
  });
});
