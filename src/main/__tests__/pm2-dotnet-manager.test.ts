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
      PATH: '/managed/npm-global/bin:/usr/local/bin',
      Z_LAST: 'tail',
      ASPNETCORE_URLS: 'http://127.0.0.1:36556',
      DOTNET_MULTILEVEL_LOOKUP: '0',
      DOTNET_ROOT: '/runtime',
      HAGICODE_DOTNET_EXE: '/runtime/dotnet',
      HAGICODE_AGENT_CLI_PATH: '/managed/npm-global/bin',
      HAGICODE_NPM_GLOBAL_PATH: '/managed/npm-global',
      PM2_HOME: '/managed/user-data/runtimeData/pm2/22',
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
      assert.equal(envContent, 'ASPNETCORE_URLS=http://127.0.0.1:36556\nDOTNET_MULTILEVEL_LOOKUP=0\nDOTNET_ROOT=/runtime\nHAGICODE_AGENT_CLI_PATH=/managed/npm-global/bin\nHAGICODE_DOTNET_EXE=/runtime/dotnet\nHAGICODE_NPM_GLOBAL_PATH=/managed/npm-global\nPATH=/managed/npm-global/bin:/usr/local/bin\nPM2_HOME=/managed/user-data/runtimeData/pm2/22\nZ_LAST=tail\n');
      assert.match(ecosystemContent, new RegExp(`name: "${PM2_DOTNET_PROCESS_NAME}"`));
      assert.match(ecosystemContent, /script: "\/runtime\/dotnet"/);
      assert.match(ecosystemContent, /args: "\\"\/apps\/Hagicode Desktop\/current\/PCode.Web.dll\\" \\"--mode\\" \\"desktop\\""/);
      assert.match(ecosystemContent, /cwd: "\/apps\/Hagicode Desktop\/current"/);
      assert.match(ecosystemContent, /env_file:/);
      assert.match(ecosystemContent, /"PATH": "\/managed\/npm-global\/bin:\/usr\/local\/bin"/);
      assert.match(ecosystemContent, /"PM2_HOME": "\/managed\/user-data\/runtimeData\/pm2\/22"/);
      assert.match(ecosystemContent, /"HAGICODE_AGENT_CLI_PATH": "\/managed\/npm-global\/bin"/);
      assert.match(ecosystemContent, /"HAGICODE_NPM_GLOBAL_PATH": "\/managed\/npm-global"/);
      assert.doesNotMatch(envContent, /PATH=.*\/runtime/);
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
    assert.match(ecosystem, /"PATH": "\/managed\/npm-global\/bin:\/usr\/local\/bin"/);
    assert.match(ecosystem, /"HAGICODE_DOTNET_EXE": "\/runtime\/dotnet"/);
    assert.match(ecosystem, /"PM2_HOME": "\/managed\/user-data\/runtimeData\/pm2\/22"/);
  });

  it('keeps explicit absolute dotnet paths intact for Windows runtime files', () => {
    const ecosystem = buildPm2EcosystemConfig({
      ...createRuntimeConfig('C:\\pm2-runtime'),
      dotnetPath: 'C:\\runtime\\dotnet.exe',
      serviceDllPath: 'C:\\apps\\Hagicode Desktop\\current\\PCode.Web.dll',
      serviceWorkingDirectory: 'C:\\apps\\Hagicode Desktop\\current',
      runtimeFilesDirectory: 'C:\\pm2-runtime',
      env: {
        ASPNETCORE_URLS: 'http://127.0.0.1:36556',
        DOTNET_MULTILEVEL_LOOKUP: '0',
        DOTNET_ROOT: 'C:\\runtime',
        HAGICODE_DOTNET_EXE: 'C:\\runtime\\dotnet.exe',
      },
    });

    assert.equal(ecosystem.includes('script: "C:\\\\runtime\\\\dotnet.exe"'), true);
    assert.equal(ecosystem.includes('cwd: "C:\\\\apps\\\\Hagicode Desktop\\\\current"'), true);
    assert.match(ecosystem, /env_file: "C:\\\\pm2-runtime(?:\/|\\\\)\.env"/);
    assert.match(ecosystem, /PCode\.Web\.dll/);
    assert.match(ecosystem, /--mode/);
    assert.match(ecosystem, /desktop/);
  });

  it('rejects non-absolute dotnet paths for PM2-managed startup', () => {
    assert.throws(
      () => buildPm2EcosystemConfig({
        ...createRuntimeConfig('/runtime-files'),
        dotnetPath: 'dotnet',
      }),
      /absolute dotnetPath/,
    );
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
    assert.deepEqual(buildPm2CommandArgs('kill', { processName: 'svc' }), ['kill']);
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

  it('rewrites bare Windows pm2 launches using the managed npm global prefix and bundled node runtime', () => {
    const plan = resolvePm2LaunchPlan('pm2.cmd', {
      platform: 'win32',
      env: {
        HAGICODE_NPM_GLOBAL_PATH: 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\node\\node22\\npmGlobal',
      },
      portableToolchainRoots: ['C:\\portable-toolchain'],
      existsSync: target => target === 'C:\\portable-toolchain\\node\\node.exe'
        || target === 'C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\node\\node22\\npmGlobal\\node_modules\\pm2\\bin\\pm2',
    });

    assert.deepEqual(plan, {
      command: 'C:\\portable-toolchain\\node\\node.exe',
      argsPrefix: ['C:\\Users\\Test\\AppData\\Roaming\\HagiCode Desktop\\runtimeData\\node\\node22\\npmGlobal\\node_modules\\pm2\\bin\\pm2'],
      shell: false,
    });
  });

  it('rewrites bare POSIX pm2 launches using the managed npm global prefix and managed node executable', () => {
    const plan = resolvePm2LaunchPlan('pm2', {
      platform: 'linux',
      env: {
        HAGICODE_NPM_GLOBAL_PATH: '/home/user/.config/HagiCode Desktop/runtimeData/node/node22/npmGlobal',
        HAGICODE_PM2_NODE_EXECUTABLE: '/portable/toolchain/node/bin/node',
      },
      existsSync: target => target === '/portable/toolchain/node/bin/node'
        || target === '/home/user/.config/HagiCode Desktop/runtimeData/node/node22/npmGlobal/lib/node_modules/pm2/bin/pm2',
    });

    assert.deepEqual(plan, {
      command: '/portable/toolchain/node/bin/node',
      argsPrefix: ['/home/user/.config/HagiCode Desktop/runtimeData/node/node22/npmGlobal/lib/node_modules/pm2/bin/pm2'],
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

  it('retries PM2 bootstrap text until a valid JSON status result is available', async () => {
    const delays: number[] = [];
    let jlistCount = 0;
    const executor: Pm2CommandExecutor = {
      run: async (_command, args) => {
        if (args[0] !== 'jlist') {
          return { code: 0, stdout: 'ok', stderr: '' };
        }

        jlistCount += 1;
        if (jlistCount === 1) {
          return {
            code: 0,
            stdout: '[PM2] Spawning PM2 daemon with pm2_home=/tmp/.pm2',
            stderr: '',
          };
        }

        return {
          code: 0,
          stdout: JSON.stringify([{ name: PM2_DOTNET_PROCESS_NAME, pid: 3210, pm2_env: { status: 'online', restart_time: 1, pm_uptime: Date.now() - 3000 } }]),
          stderr: '',
        };
      },
    };

    const manager = new Pm2DotnetManager({
      pm2Command: 'pm2',
      commandExecutor: executor,
      platform: 'win32',
      statusRetryDelayMs: 7,
      statusRetryMaxRetries: 2,
      sleep: async (ms) => { delays.push(ms); },
    });

    const result = await manager.status(process.cwd());

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.status?.online, true);
      assert.equal(result.status?.restartCount, 1);
    }
    assert.equal(jlistCount, 2);
    assert.deepEqual(delays, [7]);
  });

  it('fails with malformed output after PM2 bootstrap retries are exhausted', async () => {
    const delays: number[] = [];
    let jlistCount = 0;
    const executor: Pm2CommandExecutor = {
      run: async (_command, args) => {
        assert.equal(args[0], 'jlist');
        jlistCount += 1;
        return {
          code: 0,
          stdout: '[PM2] Spawning PM2 daemon with pm2_home=/tmp/.pm2',
          stderr: '',
        };
      },
    };

    const manager = new Pm2DotnetManager({
      pm2Command: 'pm2',
      commandExecutor: executor,
      platform: 'win32',
      statusRetryDelayMs: 9,
      statusRetryMaxRetries: 2,
      sleep: async (ms) => { delays.push(ms); },
    });

    const result = await manager.status(process.cwd());

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.errorCode, 'pm2-malformed-output');
      assert.match(result.message, /could not be normalized after 3 attempts during PM2 bootstrap/i);
      assert.match(result.message, /\[PM2\] Spawning PM2 daemon/i);
    }
    assert.equal(jlistCount, 3);
    assert.deepEqual(delays, [9, 9]);
  });

  it('accepts PM2 version mismatch warnings before the JSON payload', async () => {
    let jlistCount = 0;
    const executor: Pm2CommandExecutor = {
      run: async (_command, args) => {
        assert.equal(args[0], 'jlist');
        jlistCount += 1;
        return {
          code: 0,
          stdout: '\u001b[31m\u001b[1m>>>> In-memory PM2 is out-of-date, do:\u001b[22m\u001b[39m\n'
            + '\u001b[31m\u001b[1m>>>> $ pm2 update\u001b[22m\u001b[39m\n'
            + 'In memory PM2 version: \u001b[34m\u001b[1m6.0.14\u001b[22m\u001b[39m\n'
            + 'Local PM2 version: \u001b[34m\u001b[1m7.0.1\u001b[22m\u001b[39m\n'
            + JSON.stringify([{ name: PM2_DOTNET_PROCESS_NAME, pid: 4321, pm2_env: { status: 'online', restart_time: 2, pm_uptime: Date.now() - 5000 } }], null, 2),
          stderr: '',
        };
      },
    };

    const manager = new Pm2DotnetManager({
      pm2Command: 'pm2',
      commandExecutor: executor,
      platform: 'win32',
    });

    const result = await manager.status(process.cwd());

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.status?.exists, true);
      assert.equal(result.status?.online, true);
      assert.equal(result.status?.pid, 4321);
      assert.equal(result.status?.restartCount, 2);
    }
    assert.equal(jlistCount, 1);
  });

  it('does not hide ordinary PM2 command failures behind bootstrap retries', async () => {
    const delays: number[] = [];
    let jlistCount = 0;
    const executor: Pm2CommandExecutor = {
      run: async (_command, args) => {
        assert.equal(args[0], 'jlist');
        jlistCount += 1;
        return {
          code: 1,
          stdout: '',
          stderr: 'pm2.cmd returned an unreadable localized error',
        };
      },
    };

    const manager = new Pm2DotnetManager({
      pm2Command: 'pm2',
      commandExecutor: executor,
      platform: 'win32',
      statusRetryDelayMs: 11,
      statusRetryMaxRetries: 3,
      sleep: async (ms) => { delays.push(ms); },
    });

    const result = await manager.status(process.cwd());

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.errorCode, 'pm2-command-failed');
      assert.match(result.message, /status failed while querying the PM2 process list/i);
      assert.match(result.message, /unreadable localized error/i);
    }
    assert.equal(jlistCount, 1);
    assert.deepEqual(delays, []);
  });

  it('runs lifecycle through mocked pm2 and maps jlist status', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-lifecycle-'));
    const calls: Array<{ command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv | undefined }> = [];
    const executor: Pm2CommandExecutor = {
      run: async (command, args, options) => {
        calls.push({ command, args, cwd: String(options.cwd ?? ''), env: options.env });
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
      const manager = new Pm2DotnetManager({ pm2Command: 'pm2', commandExecutor: executor, platform: 'linux' });
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
      assert.equal(calls.every(call => call.env?.PM2_HOME === '/managed/user-data/runtimeData/pm2/22'), true);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('passes shorter status timeouts and longer lifecycle timeouts to the command executor', async () => {
    const calls: Array<{ operation: string; timeoutMs: number | undefined }> = [];
    const executor: Pm2CommandExecutor = {
      run: async (_command, args, options) => {
        calls.push({ operation: args[0], timeoutMs: options.timeoutMs });
        if (args[0] === 'jlist') {
          return { code: 0, stdout: '[]', stderr: '' };
        }
        return { code: 0, stdout: 'ok', stderr: '' };
      },
    };

    const manager = new Pm2DotnetManager({
      pm2Command: 'pm2',
      commandExecutor: executor,
      platform: 'linux',
      statusCommandTimeoutMs: 3210,
      lifecycleCommandTimeoutMs: 9876,
    });

    await manager.status(process.cwd());
    await manager.stop(process.cwd());

    assert.deepEqual(calls, [
      { operation: 'jlist', timeoutMs: 3210 },
      { operation: 'stop', timeoutMs: 9876 },
    ]);
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

      const manager = new Pm2DotnetManager({ pm2Command, commandExecutor: executor, platform: 'win32' });
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

      const manager = new Pm2DotnetManager({ pm2Command: 'pm2', commandExecutor: executor, platform: 'win32' });
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
      const manager = new Pm2DotnetManager({ pm2Command: 'pm2', commandExecutor: executor, platform: 'linux' });
      const result = await manager.startFresh(createRuntimeConfig(tmpDir));

      assert.equal(result.success, true);
      assert.equal(result.success && result.status?.online, true);
      assert.deepEqual(calls.map(call => call.args[0]), ['jlist', 'delete', 'start', 'jlist']);
      assert.equal(calls.every(call => call.cwd === '/apps/Hagicode Desktop/current'), true);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('reuses the same runtime files and environment when bootstrap retries are needed before and after startFresh', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-pm2-bootstrap-start-'));
    const runtimeConfig = createRuntimeConfig(tmpDir);
    const delays: number[] = [];
    const calls: Array<{ args: string[]; cwd: string; env: NodeJS.ProcessEnv | undefined }> = [];
    let jlistCount = 0;
    const executor: Pm2CommandExecutor = {
      run: async (_command, args, options) => {
        calls.push({
          args,
          cwd: String(options.cwd ?? ''),
          env: options.env,
        });

        if (args[0] === 'jlist') {
          jlistCount += 1;
          if (jlistCount === 1 || jlistCount === 3) {
            return {
              code: 0,
              stdout: '[PM2] PM2 Successfully daemonized',
              stderr: '',
            };
          }

          if (jlistCount === 2) {
            return { code: 0, stdout: '[]', stderr: '' };
          }

          return {
            code: 0,
            stdout: JSON.stringify([{ name: PM2_DOTNET_PROCESS_NAME, pid: 8765, pm2_env: { status: 'online', restart_time: 0, pm_uptime: Date.now() - 4000 } }]),
            stderr: '',
          };
        }

        return { code: 0, stdout: 'ok', stderr: '' };
      },
    };

    try {
      const manager = new Pm2DotnetManager({
        pm2Command: 'pm2',
        commandExecutor: executor,
        platform: 'win32',
        statusRetryDelayMs: 5,
        statusRetryMaxRetries: 2,
        sleep: async (ms) => { delays.push(ms); },
      });
      const result = await manager.startFresh(runtimeConfig);
      const envContent = await fs.readFile(path.join(tmpDir, PM2_ENV_FILE_NAME), 'utf-8');
      const ecosystemContent = await fs.readFile(path.join(tmpDir, PM2_ECOSYSTEM_FILE_NAME), 'utf-8');

      assert.equal(result.success, true);
      assert.equal(result.success && result.status?.online, true);
      assert.deepEqual(calls.map(call => call.args[0]), ['jlist', 'jlist', 'start', 'jlist', 'jlist']);
      assert.equal(calls.every(call => call.cwd === runtimeConfig.serviceWorkingDirectory), true);
      assert.equal(calls.every(call => call.env?.HAGICODE_DOTNET_EXE === runtimeConfig.env.HAGICODE_DOTNET_EXE), true);
      assert.equal(calls.every(call => call.env?.PATH === runtimeConfig.env.PATH), true);
      assert.equal(calls.every(call => call.env?.HAGICODE_AGENT_CLI_PATH === runtimeConfig.env.HAGICODE_AGENT_CLI_PATH), true);
      assert.equal(calls.every(call => call.env?.PM2_HOME === runtimeConfig.env.PM2_HOME), true);
      assert.equal(calls[2]?.args[1], path.join(tmpDir, PM2_ECOSYSTEM_FILE_NAME));
      assert.match(envContent, /HAGICODE_DOTNET_EXE=\/runtime\/dotnet/);
      assert.match(envContent, /PATH=\/managed\/npm-global\/bin:\/usr\/local\/bin/);
      assert.match(envContent, /PM2_HOME=\/managed\/user-data\/runtimeData\/pm2\/22/);
      assert.match(ecosystemContent, /"PATH": "\/managed\/npm-global\/bin:\/usr\/local\/bin"/);
      assert.match(ecosystemContent, /"PM2_HOME": "\/managed\/user-data\/runtimeData\/pm2\/22"/);
      assert.match(ecosystemContent, /PCode\.Web\.dll/);
      assert.deepEqual(delays, [5, 5]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
