import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveManagedCliExecutablePath } from '../managed-cli-executable-resolver.js';

describe('resolveManagedCliExecutablePath', () => {
  it('returns the trimmed which path on macOS', async () => {
    const result = await resolveManagedCliExecutablePath({
      binName: 'openspec',
      platform: 'darwin',
      staticExecutablePath: '/managed/bin/openspec',
      runCommand: async (command, args) => {
        assert.equal(command, 'sh');
        assert.deepEqual(args, ['-c', 'which openspec']);
        return { exitCode: 0, stdout: '  /opt/homebrew/bin/openspec  \n' };
      },
    });

    assert.equal(result, '/opt/homebrew/bin/openspec');
  });

  it('returns the first non-empty which path on Linux', async () => {
    const result = await resolveManagedCliExecutablePath({
      binName: 'openspec',
      platform: 'linux',
      staticExecutablePath: '/managed/bin/openspec',
      runCommand: async () => ({ exitCode: 0, stdout: '\n/usr/local/bin/openspec\n' }),
    });

    assert.equal(result, '/usr/local/bin/openspec');
  });

  it('keeps the static path on Windows without invoking the shell', async () => {
    let called = false;
    const result = await resolveManagedCliExecutablePath({
      binName: 'openspec',
      platform: 'win32',
      staticExecutablePath: 'C:\\managed\\openspec.cmd',
      runCommand: async () => {
        called = true;
        return { exitCode: 0, stdout: '/unexpected/openspec' };
      },
    });

    assert.equal(result, 'C:\\managed\\openspec.cmd');
    assert.equal(called, false);
  });

  it('falls back to the static path when which returns no output', async () => {
    const result = await resolveManagedCliExecutablePath({
      binName: 'openspec',
      platform: 'linux',
      staticExecutablePath: '/managed/bin/openspec',
      runCommand: async () => ({ exitCode: 1, stdout: ' \n' }),
    });

    assert.equal(result, '/managed/bin/openspec');
  });
});
