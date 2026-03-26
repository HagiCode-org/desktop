import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createClipboardBridge } from '../clipboard-bridge.js';

describe('clipboard preload bridge', () => {
  it('routes readText calls through the configured IPC channel', async () => {
    const invocations: Array<{ channel: string; args: unknown[] }> = [];
    const bridge = createClipboardBridge(
      {
        async invoke(channel, ...args) {
          invocations.push({ channel, args });
          return 'copied text';
        },
      },
      {
        readText: 'clipboard:read-text',
        writeText: 'clipboard:write-text',
      },
    );

    const result = await bridge.readText();

    assert.equal(result, 'copied text');
    assert.deepEqual(invocations, [{ channel: 'clipboard:read-text', args: [] }]);
  });

  it('routes writeText calls through the configured IPC channel', async () => {
    const invocations: Array<{ channel: string; args: unknown[] }> = [];
    const bridge = createClipboardBridge(
      {
        async invoke(channel, ...args) {
          invocations.push({ channel, args });
          return undefined;
        },
      },
      {
        readText: 'clipboard:read-text',
        writeText: 'clipboard:write-text',
      },
    );

    await bridge.writeText('hello');

    assert.deepEqual(invocations, [{ channel: 'clipboard:write-text', args: ['hello'] }]);
  });
});
