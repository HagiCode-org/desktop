import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  PM2_DOTNET_PROCESS_NAME,
  PM2_ECOSYSTEM_FILE_NAME,
  PM2_ENV_FILE_NAME,
  Pm2DotnetManager,
  buildPm2CommandArgs,
  buildPm2EcosystemConfig,
  buildPm2EnvFile,
  resolveDefaultPm2Command,
  type Pm2CommandExecutor,
} from '../pm2-dotnet-manager.js';

function createRuntimeConfig(runtimeFilesDirectory: string) {
  return {
    dotnetPath: '/runtime/dotnet',
    serviceDllPath: '/apps/Hagicode Desktop/current/PCode.Web.dll',
    serviceWorkingDirectory: '/apps/Hagicode Desktop/current',
    runtimeFilesDirectory,
    args: ['--mode', 'desktop'],
    env: {
      Z_LAST: 'tail',
      ASPNETCORE_URLS: 'http://127.0.0.1:36556',
      DOTNET_ROOT: '/runtime',
    },
  };
}

describe('pm2-dotnet-manager', () => {
  it('generates deterministic env and ecosystem files', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-'));
    const manager = new Pm2DotnetManager({
      commandExecutor: {
        run: async () => ({ code: 0, stdout: '[]', stderr: '' }),
      },
    });

    try {
      const files = await manager.writeRuntimeFiles(createRuntimeConfig(tmpDir));
      const envContent = await fs.readFile(files.envPath, 'utf-8');
      const ecosystemContent = await fs.readFile(files.ecosystemPath, 'utf-8');

      assert.equal(path.basename(files.envPath), PM2_ENV_FILE_NAME);
      assert.equal(path.basename(files.ecosystemPath), PM2_ECOSYSTEM_FILE_NAME);
      assert.equal(envContent, 'ASPNETCORE_URLS=http://127.0.0.1:36556\nDOTNET_ROOT=/runtime\nZ_LAST=tail\n');
      assert.match(ecosystemContent, new RegExp(`name: "${PM2_DOTNET_PROCESS_NAME}"`));
      assert.match(ecosystemContent, /script: "\/runtime\/dotnet"/);
      assert.match(ecosystemContent, /args: \["\/apps\/Hagicode Desktop\/current\/PCode.Web.dll","--mode","desktop"\]/);
      assert.match(ecosystemContent, /cwd: "\/apps\/Hagicode Desktop\/current"/);
      assert.match(ecosystemContent, /env_file:/);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('builds env and ecosystem content without reading external state', () => {
    assert.equal(buildPm2EnvFile({ B: '2', A: '1' }), 'A=1\nB=2\n');
    const ecosystem = buildPm2EcosystemConfig(createRuntimeConfig('/runtime-files'));

    assert.match(ecosystem, /module\.exports =/);
    assert.match(ecosystem, /interpreter: "none"/);
    assert.match(ecosystem, /args: \["\/apps\/Hagicode Desktop\/current\/PCode.Web.dll","--mode","desktop"\]/);
    assert.match(ecosystem, /HAGICODE_PM2_ENV_FILE/);
  });

  it('constructs explicit pm2 command argument arrays', () => {
    assert.deepEqual(buildPm2CommandArgs('startOrReload', { ecosystemPath: '/cfg/ecosystem.config.js', processName: 'svc' }), [
      'startOrReload',
      '/cfg/ecosystem.config.js',
      '--update-env',
    ]);
    assert.deepEqual(buildPm2CommandArgs('restart', { ecosystemPath: '/cfg/ecosystem.config.js', processName: 'svc' }), [
      'reload',
      '/cfg/ecosystem.config.js',
      '--update-env',
    ]);
    assert.deepEqual(buildPm2CommandArgs('stop', { processName: 'svc' }), ['stop', 'svc']);
    assert.deepEqual(buildPm2CommandArgs('status', { processName: 'svc' }), ['jlist']);
  });

  it('prefers the local package pm2 executable when available', () => {
    assert.equal(
      resolveDefaultPm2Command({ cwd: '/desktop', platform: 'linux', existsSync: target => target === '/desktop/node_modules/.bin/pm2' }),
      '/desktop/node_modules/.bin/pm2',
    );
    assert.equal(
      resolveDefaultPm2Command({ cwd: '/desktop', platform: 'win32', existsSync: target => target === path.join('/desktop', 'node_modules', '.bin', 'pm2.cmd') }),
      path.join('/desktop', 'node_modules', '.bin', 'pm2.cmd'),
    );
    assert.equal(resolveDefaultPm2Command({ cwd: '/desktop', platform: 'linux', existsSync: () => false }), 'pm2');
  });

  it('normalizes missing executable and non-zero exit failures', async () => {
    const missingExecutor: Pm2CommandExecutor = {
      run: async () => {
        const error = new Error('spawn pm2 ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      },
    };
    const failedExecutor: Pm2CommandExecutor = {
      run: async () => ({ code: 1, stdout: '', stderr: 'bad command' }),
    };

    const missing = await new Pm2DotnetManager({ commandExecutor: missingExecutor }).status(process.cwd());
    const failed = await new Pm2DotnetManager({ commandExecutor: failedExecutor }).stop(process.cwd());

    assert.equal(missing.success, false);
    if (!missing.success) {
      assert.equal(missing.errorCode, 'pm2-unavailable');
      assert.match(missing.message, /PM2 is unavailable/);
    }
    assert.equal(failed.success, false);
    if (!failed.success) {
      assert.equal(failed.errorCode, 'pm2-command-failed');
      assert.match(failed.message, /bad command/);
    }
  });

  it('runs lifecycle through mocked pm2 and maps jlist status', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-lifecycle-'));
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    const executor: Pm2CommandExecutor = {
      run: async (command, args, options) => {
        calls.push({ command, args, cwd: String(options.cwd ?? '') });
        if (args[0] === 'jlist') {
          return {
            code: 0,
            stdout: JSON.stringify([{ name: PM2_DOTNET_PROCESS_NAME, pid: 1234, pm2_env: { status: 'online', restart_time: 2, pm_uptime: Date.now() - 5000 } }]),
            stderr: '',
          };
        }
        return { code: 0, stdout: 'ok', stderr: '' };
      },
    };

    try {
      const manager = new Pm2DotnetManager({ pm2Command: 'pm2', commandExecutor: executor });
      const started = await manager.startOrReload(createRuntimeConfig(tmpDir));
      const stopped = await manager.stop(tmpDir);

      assert.equal(started.success, true);
      if (started.success) {
        assert.equal(started.status?.online, true);
        assert.equal(started.status?.pid, 1234);
        assert.equal(started.status?.restartCount, 2);
      }
      assert.equal(stopped.success, true);
      assert.deepEqual(calls.map(call => call.args[0]), ['startOrReload', 'jlist', 'stop']);
      assert.equal(calls.every(call => call.command === 'pm2'), true);
      assert.equal(calls.every(call => call.cwd === tmpDir), true);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
