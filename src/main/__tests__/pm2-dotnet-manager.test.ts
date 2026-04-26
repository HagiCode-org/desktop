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
  resolvePm2LaunchPlan,
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
      assert.match(ecosystemContent, /args: "\\"\/apps\/Hagicode Desktop\/current\/PCode.Web.dll\\" \\"--mode\\" \\"desktop\\""/);
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
    assert.match(ecosystem, /args: "\\"\/apps\/Hagicode Desktop\/current\/PCode.Web.dll\\" \\"--mode\\" \\"desktop\\""/);
    assert.match(ecosystem, /HAGICODE_PM2_ENV_FILE/);
  });

  it('constructs explicit pm2 command argument arrays', () => {
    assert.deepEqual(buildPm2CommandArgs('startOrReload', { ecosystemPath: '/cfg/ecosystem.config.js', processName: 'svc' }), [
      'startOrReload',
      '/cfg/ecosystem.config.js',
      '--update-env',
    ]);
    assert.deepEqual(buildPm2CommandArgs('start', { ecosystemPath: '/cfg/ecosystem.config.js', processName: 'svc' }), [
      'start',
      '/cfg/ecosystem.config.js',
      '--only',
      'svc',
      '--update-env',
    ]);
    assert.deepEqual(buildPm2CommandArgs('restart', { ecosystemPath: '/cfg/ecosystem.config.js', processName: 'svc' }), [
      'reload',
      '/cfg/ecosystem.config.js',
      '--update-env',
    ]);
    assert.deepEqual(buildPm2CommandArgs('stop', { processName: 'svc' }), ['stop', 'svc']);
    assert.deepEqual(buildPm2CommandArgs('delete', { processName: 'svc' }), ['delete', 'svc']);
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

  it('rewrites Windows pm2.cmd launches to node plus the PM2 CLI entrypoint when available', () => {
    const command = 'C:\\toolchain\\node\\pm2.cmd';
    const plan = resolvePm2LaunchPlan(command, {
      platform: 'win32',
      existsSync: target => target === 'C:\\toolchain\\node\\node.exe' || target === 'C:\\toolchain\\node\\node_modules\\pm2\\bin\\pm2',
    });

    assert.deepEqual(plan, {
      command: 'C:\\toolchain\\node\\node.exe',
      argsPrefix: ['C:\\toolchain\\node\\node_modules\\pm2\\bin\\pm2'],
      shell: false,
    });
  });

  it('rewrites bare Windows pm2 launches using npm-managed node environment when available', () => {
    const plan = resolvePm2LaunchPlan('pm2', {
      platform: 'win32',
      env: {
        npm_node_execpath: 'C:\\toolchain\\node\\node.exe',
      },
      existsSync: target => target === 'C:\\toolchain\\node\\node.exe' || target === 'C:\\toolchain\\node\\node_modules\\pm2\\bin\\pm2',
    });

    assert.deepEqual(plan, {
      command: 'C:\\toolchain\\node\\node.exe',
      argsPrefix: ['C:\\toolchain\\node\\node_modules\\pm2\\bin\\pm2'],
      shell: false,
    });
  });

  it('rewrites bare Windows pm2 launches using the discovered portable toolchain when env is unavailable', () => {
    const plan = resolvePm2LaunchPlan('pm2.cmd', {
      platform: 'win32',
      portableToolchainRoots: ['C:\\portable-toolchain'],
      existsSync: target => target === 'C:\\portable-toolchain\\node\\node.exe' || target === 'C:\\portable-toolchain\\node\\node_modules\\pm2\\bin\\pm2',
    });

    assert.deepEqual(plan, {
      command: 'C:\\portable-toolchain\\node\\node.exe',
      argsPrefix: ['C:\\portable-toolchain\\node\\node_modules\\pm2\\bin\\pm2'],
      shell: false,
    });
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
        assert.equal(started.status?.restartCount, 2);
      }
      assert.equal(stopped.success, true);
      assert.deepEqual(calls.map(call => call.args[0]), ['startOrReload', 'jlist', 'stop']);
      assert.equal(calls.every(call => call.command === 'pm2'), true);
      assert.equal(calls[0]?.cwd, '/apps/Hagicode Desktop/current');
      assert.equal(calls[1]?.cwd, '/apps/Hagicode Desktop/current');
      assert.equal(calls[2]?.cwd, tmpDir);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('uses the rewritten Windows PM2 launch plan when the managed pm2.cmd path is provided', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-windows-launch-'));
    const toolchainDir = path.join(tmpDir, 'toolchain');
    const pm2Command = path.join(toolchainDir, 'pm2.cmd');
    const nodeExecutable = path.join(toolchainDir, 'node.exe');
    const pm2Cli = path.join(toolchainDir, 'node_modules', 'pm2', 'bin', 'pm2');
    const calls: Array<{ command: string; args: string[]; shell: boolean | string | undefined }> = [];
    const executor: Pm2CommandExecutor = {
      run: async (command, args, options) => {
        calls.push({ command, args, shell: options.shell });
        return { code: 0, stdout: '[]', stderr: '' };
      },
    };

    try {
      await fs.mkdir(path.dirname(pm2Cli), { recursive: true });
      await Promise.all([
        fs.writeFile(pm2Command, '', 'utf8'),
        fs.writeFile(nodeExecutable, '', 'utf8'),
        fs.writeFile(pm2Cli, '', 'utf8'),
      ]);

      const manager = new Pm2DotnetManager({ pm2Command, commandExecutor: executor });
      const result = await manager.status(tmpDir);

      assert.equal(result.success, true);
      assert.deepEqual(calls, [
        {
          command: nodeExecutable,
          args: [pm2Cli, 'jlist'],
          shell: false,
        },
      ]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('uses the rewritten Windows PM2 launch plan when only a bare pm2 command is configured but npm env points to bundled node', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-env-launch-'));
    const toolchainDir = path.join(tmpDir, 'toolchain');
    const nodeExecutable = path.join(toolchainDir, 'node.exe');
    const pm2Cli = path.join(toolchainDir, 'node_modules', 'pm2', 'bin', 'pm2');
    const calls: Array<{ command: string; args: string[]; shell: boolean | string | undefined }> = [];
    const executor: Pm2CommandExecutor = {
      run: async (command, args, options) => {
        calls.push({ command, args, shell: options.shell });
        return { code: 0, stdout: '[]', stderr: '' };
      },
    };

    try {
      await fs.mkdir(path.dirname(pm2Cli), { recursive: true });
      await Promise.all([
        fs.writeFile(nodeExecutable, '', 'utf8'),
        fs.writeFile(pm2Cli, '', 'utf8'),
      ]);

      const manager = new Pm2DotnetManager({ pm2Command: 'pm2', commandExecutor: executor });
      const result = await manager.status(tmpDir, {
        npm_node_execpath: nodeExecutable,
      });

      assert.equal(result.success, true);
      assert.deepEqual(calls, [
        {
          command: nodeExecutable,
          args: [pm2Cli, 'jlist'],
          shell: false,
        },
      ]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('deletes an existing PM2 process before starting the current version directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-fresh-start-'));
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    let jlistCount = 0;
    const executor: Pm2CommandExecutor = {
      run: async (command, args, options) => {
        calls.push({ command, args, cwd: String(options.cwd ?? '') });
        if (args[0] === 'jlist') {
          jlistCount++;
          return {
            code: 0,
            stdout: JSON.stringify([
              {
                name: PM2_DOTNET_PROCESS_NAME,
                pid: jlistCount === 1 ? 4321 : 6789,
                pm2_env: {
                  status: 'online',
                  restart_time: jlistCount === 1 ? 4 : 0,
                  pm_uptime: Date.now() - 5000,
                },
              },
            ]),
            stderr: '',
          };
        }
        return { code: 0, stdout: 'ok', stderr: '' };
      },
    };

    try {
      const manager = new Pm2DotnetManager({ pm2Command: 'pm2', commandExecutor: executor });
      const result = await manager.startFresh(createRuntimeConfig(tmpDir));

      assert.equal(result.success, true);
      assert.equal(result.success && result.status?.online, true);
      assert.deepEqual(calls.map(call => call.args[0]), ['jlist', 'delete', 'start', 'jlist']);
      assert.equal(calls.every(call => call.cwd === '/apps/Hagicode Desktop/current'), true);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
