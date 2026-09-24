import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, type TestContext } from 'node:test';
import { resolveManagedCliExecutablePath } from '../managed-cli-executable-resolver.js';

function temporaryDirectory(t: TestContext): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'managed-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function createExecutable(filePath: string): void {
  writeFileSync(filePath, '');
  chmodSync(filePath, 0o755);
}

describe('resolveManagedCliExecutablePath', () => {
  it('returns an existing static path without probing npm or PATH', async (t) => {
    const staticExecutablePath = path.join(temporaryDirectory(t), 'openspec');
    createExecutable(staticExecutablePath);
    const result = await resolveManagedCliExecutablePath({
      binName: 'openspec',
      platform: 'linux',
      staticExecutablePath,
      runCommand: async () => { throw new Error('npm should not be probed'); },
    });

    assert.equal(result, staticExecutablePath);
  });

  it('discovers a Windows .cmd shim before .ps1 and the unprobed static path', async (t) => {
    const prefix = temporaryDirectory(t);
    const cmdPath = path.join(prefix, 'openspec.cmd');
    createExecutable(cmdPath);
    createExecutable(path.join(prefix, 'openspec.ps1'));
    const result = await resolveManagedCliExecutablePath({
      binName: 'openspec',
      platform: 'win32',
      staticExecutablePath: path.join(prefix, 'missing', 'openspec.cmd'),
      runCommand: async (command, args) => {
        assert.equal(command, 'npm');
        assert.deepEqual(args, ['prefix', '-g']);
        return { exitCode: 0, stdout: `  ${prefix}  \n` };
      },
    });

    assert.equal(result, cmdPath);
  });

  it('discovers a Windows .ps1 shim when .cmd is absent', async (t) => {
    const prefix = temporaryDirectory(t);
    const ps1Path = path.join(prefix, 'openspec.ps1');
    createExecutable(ps1Path);
    const result = await resolveManagedCliExecutablePath({
      binName: 'openspec',
      platform: 'win32',
      staticExecutablePath: path.join(prefix, 'missing.cmd'),
      runCommand: async () => ({ exitCode: 0, stdout: prefix }),
    });

    assert.equal(result, ps1Path);
  });

  it('discovers an extensionless Windows shim when other shims are absent', async (t) => {
    const prefix = temporaryDirectory(t);
    const shimPath = path.join(prefix, 'openspec');
    createExecutable(shimPath);
    const result = await resolveManagedCliExecutablePath({
      binName: 'openspec',
      platform: 'win32',
      staticExecutablePath: path.join(prefix, 'missing.cmd'),
      runCommand: async () => ({ exitCode: 0, stdout: prefix }),
    });

    assert.equal(result, shimPath);
  });

  for (const platform of ['darwin', 'linux'] as const) {
    it(`discovers a ${platform} executable in the npm global bin`, async (t) => {
      const prefix = temporaryDirectory(t);
      const binDirectory = path.join(prefix, 'bin');
      mkdirSync(binDirectory);
      const executablePath = path.join(binDirectory, 'openspec');
      createExecutable(executablePath);

      const result = await resolveManagedCliExecutablePath({
        binName: 'openspec',
        platform,
        staticExecutablePath: path.join(prefix, 'missing'),
        runCommand: async () => ({ exitCode: 0, stdout: prefix }),
      });

      assert.equal(result, executablePath);
    });

    it(`falls back to PATH via which on ${platform}`, async (t) => {
      const directory = temporaryDirectory(t);
      const executablePath = path.join(directory, process.platform === 'win32' ? 'openspec.cmd' : 'openspec');
      createExecutable(executablePath);

      const result = await resolveManagedCliExecutablePath({
        binName: 'openspec',
        platform,
        staticExecutablePath: path.join(directory, 'missing'),
        runCommand: async () => ({ exitCode: 1, stdout: '' }),
        env: { PATH: directory, PATHEXT: '.CMD;.EXE' },
      });

      assert.equal(result, executablePath);
    });
  }

  it('falls back to PATH on Windows when the npm global bin has no shim', async (t) => {
    const directory = temporaryDirectory(t);
    const executablePath = path.join(directory, process.platform === 'win32' ? 'openspec.cmd' : 'openspec');
    createExecutable(executablePath);

    const result = await resolveManagedCliExecutablePath({
      binName: 'openspec',
      platform: 'win32',
      staticExecutablePath: path.join(directory, 'missing.cmd'),
      runCommand: async () => ({ exitCode: 0, stdout: path.join(directory, 'other') }),
      env: { PATH: directory, PATHEXT: '.CMD;.EXE' },
    });

    assert.equal(result, executablePath);
  });

  it('returns the static path when npm and PATH both fail', async (t) => {
    const directory = temporaryDirectory(t);
    const staticExecutablePath = path.join(directory, 'missing');

    const result = await resolveManagedCliExecutablePath({
      binName: 'openspec',
      platform: 'linux',
      staticExecutablePath,
      runCommand: async () => ({ exitCode: 1, stdout: 'ignored' }),
      env: { PATH: directory },
    });

    assert.equal(result, staticExecutablePath);
  });
});
