import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { executeCli, executeCliStreaming, normalizeCliArgsForShell } from '../utils/cli-executor.js';

describe('cli-executor', () => {
  it('captures successful stdout and stderr with command metadata', async () => {
    const result = await executeCli({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("ok"); process.stderr.write("warn");'],
      cwd: process.cwd(),
      metadata: { testCase: 'success' },
    });

    assert.equal(result.success, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, 'ok');
    assert.equal(result.stderr, 'warn');
    assert.equal(result.command.command, process.execPath);
    assert.equal(result.command.args[0], '-e');
    assert.equal(result.command.cwd, process.cwd());
    assert.equal(result.command.windowsHide, true);
    assert.deepEqual(result.command.metadata, { testCase: 'success' });
    assert.ok(result.durationMs >= 0);
  });

  it('normalizes non-zero exits without throwing execa-specific errors', async () => {
    const cwd = path.resolve(process.cwd());
    const result = await executeCli({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("partial"); process.stderr.write("bad"); process.exit(7);'],
      cwd,
    });

    assert.equal(result.success, false);
    assert.equal(result.exitCode, 7);
    assert.equal(result.stdout, 'partial');
    assert.equal(result.stderr, 'bad');
    assert.equal(result.command.command, process.execPath);
    assert.equal(result.command.args[1].includes('process.exit(7)'), true);
    assert.equal(result.command.cwd, cwd);
    assert.equal(result.error?.kind, 'exit');
    assert.match(result.error?.message ?? '', /Command failed/);
  });

  it('normalizes timeout behavior', async () => {
    const result = await executeCli({
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 5000);'],
      timeoutMs: 50,
    });

    assert.equal(result.success, false);
    assert.equal(result.error?.kind, 'timeout');
  });

  it('normalizes abort signal cancellation', async () => {
    const controller = new AbortController();
    const promise = executeCli({
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 5000);'],
      signal: controller.signal,
    });

    controller.abort();
    const result = await promise;

    assert.equal(result.success, false);
    assert.equal(result.error?.kind, 'cancelled');
  });

  it('preserves explicit shell and Windows hidden-window options in metadata', async () => {
    const result = await executeCli({
      command: process.execPath,
      args: ['-e', 'process.exit(0);'],
      shell: false,
      windowsHide: false,
    });

    assert.equal(result.success, true);
    assert.equal(result.command.shell, false);
    assert.equal(result.command.windowsHide, false);
  });

  it('quotes Windows shell arguments for cmd wrappers when values contain spaces', () => {
    const normalized = normalizeCliArgsForShell(
      'C:\\Program Files\\HagiCode\\hagiscript.cmd',
      [
        'npm-sync',
        '--runtime',
        'C:\\Program Files\\HagiCode\\node',
        '--manifest',
        'C:\\Users\\Test User\\AppData\\Local\\Temp\\desktop manifest.json',
      ],
      true,
      'win32',
    );

    assert.deepEqual(normalized, [
      'npm-sync',
      '--runtime',
      '"C:\\Program Files\\HagiCode\\node"',
      '--manifest',
      '"C:\\Users\\Test User\\AppData\\Local\\Temp\\desktop manifest.json"',
    ]);
  });

  it('does not rewrite args for non-Windows shells or non-wrapper commands', () => {
    const args = ['npm-sync', '--runtime', 'C:\\Program Files\\HagiCode\\node'];

    assert.deepEqual(normalizeCliArgsForShell('hagiscript', args, true, 'win32'), args);
    assert.deepEqual(normalizeCliArgsForShell('hagiscript.cmd', args, false, 'win32'), args);
    assert.deepEqual(normalizeCliArgsForShell('hagiscript.cmd', args, true, 'linux'), args);
  });

  it('streams bounded stdout and stderr while returning a final normalized result', async () => {
    const chunks: Array<{ type: 'stdout' | 'stderr'; data: string }> = [];
    const result = await executeCliStreaming({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("live-out"); process.stderr.write("live-err");'],
      onOutput: (type, data) => chunks.push({ type, data }),
    });

    assert.equal(result.success, true);
    assert.equal(result.stdout, 'live-out');
    assert.equal(result.stderr, 'live-err');
    assert.deepEqual(chunks, [
      { type: 'stdout', data: 'live-out' },
      { type: 'stderr', data: 'live-err' },
    ]);
  });
});
