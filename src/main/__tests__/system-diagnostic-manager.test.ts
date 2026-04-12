import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AgentCliType } from '../../types/agent-cli.js';
import { SystemDiagnosticManager } from '../system-diagnostic-manager.js';

type CommandHandler = (command: string, args: string[]) => {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
};

function createRunCommand(handler: CommandHandler) {
  return async (command: string, args: string[]) => {
    const result = handler(command, args);
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.exitCode ?? 0,
    };
  };
}

function createAgentCliManager(options: {
  selection: { cliType: AgentCliType | null; isSkipped: boolean; selectedAt: string | null };
  resolvedPaths: Record<string, string | null>;
}) {
  return {
    loadSelection: () => options.selection,
    getCommandCandidates: (cliType: AgentCliType) => {
      if (cliType === AgentCliType.CopilotCli) {
        return ['copilot', 'github-copilot-cli'];
      }

      if (cliType === AgentCliType.Codex) {
        return ['codex'];
      }

      return ['claude'];
    },
    getRuntimeEnv: async () => ({
      PATH: '/opt/bin',
      SHELL: '/bin/bash',
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
    }),
    resolveCommandPath: async (commandCandidates: string[]) => {
      for (const candidate of commandCandidates) {
        if (candidate in options.resolvedPaths) {
          return options.resolvedPaths[candidate];
        }
      }

      return null;
    },
  };
}

describe('SystemDiagnosticManager', () => {
  it('collects a linux report with the audited hagicode-core toolchain matrix', async () => {
    const manager = new SystemDiagnosticManager({
      platform: 'linux',
      architecture: 'x64',
      hostname: () => 'demo-box',
      osType: () => 'Linux',
      osRelease: () => '6.8.0',
      osVersion: () => '6.8.0-custom',
      cpus: () => [{ model: 'Fallback CPU', speed: 1000, times: { idle: 0, irq: 0, nice: 0, sys: 0, user: 0 } }],
      totalMem: () => 32 * 1024 ** 3,
      freeMem: () => 12 * 1024 ** 3,
      now: () => new Date('2026-04-11T08:00:00.000Z'),
      readFile: async () => 'PRETTY_NAME="Ubuntu 24.04 LTS"\nVERSION_ID="24.04"\n',
      agentCliManager: createAgentCliManager({
        selection: {
          cliType: AgentCliType.Codex,
          isSkipped: false,
          selectedAt: '2026-04-11T07:59:00.000Z',
        },
        resolvedPaths: {
          codex: '/opt/bin/codex',
          node: '/opt/bin/node',
          npm: '/opt/bin/npm',
          npx: '/opt/bin/npx',
          git: '/opt/bin/git',
        },
      }),
      runCommand: createRunCommand((command, args) => {
        if (command === 'lscpu') {
          return { stdout: 'Model name: AMD Ryzen 7 7840HS\n' };
        }

        if (command === '/opt/bin/codex' && args[0] === '--version') {
          return { stdout: 'codex 0.28.0\n' };
        }

        if (command === '/opt/bin/node') {
          return { stdout: 'v22.11.0\n' };
        }

        if (command === '/opt/bin/npm') {
          return { stdout: '10.9.2\n' };
        }

        if (command === '/opt/bin/npx') {
          return { stdout: '10.9.2\n' };
        }

        if (command === '/opt/bin/git') {
          return { stdout: 'git version 2.49.0\n' };
        }

        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
      }),
    });

    const result = await manager.run();

    assert.equal(result.summary.status, 'success');
    assert.equal(result.data.system.osName, 'Ubuntu 24.04 LTS');
    assert.equal(result.data.hardware.cpuModel, 'AMD Ryzen 7 7840HS');
    assert.equal(result.data.agentCli.status, 'healthy');
    assert.deepEqual(
      result.data.toolchain.map((probe) => probe.command),
      ['node', 'npm', 'npx', 'git'],
    );
    assert.match(result.report, /\[toolchain\]/);
    assert.match(result.report, /coverage\.requiredByCoreRuntime=node,npm,npx,git/);
    assert.equal(result.data.windowsCodePage, undefined);
  });

  it('reports a deterministic not-selected agent CLI state without failing the whole run', async () => {
    const manager = new SystemDiagnosticManager({
      platform: 'darwin',
      architecture: 'arm64',
      hostname: () => 'mac-mini',
      osType: () => 'Darwin',
      osRelease: () => '24.4.0',
      osVersion: () => 'Darwin Kernel Version',
      cpus: () => [{ model: 'Apple M3', speed: 1000, times: { idle: 0, irq: 0, nice: 0, sys: 0, user: 0 } }],
      totalMem: () => 16 * 1024 ** 3,
      freeMem: () => 8 * 1024 ** 3,
      now: () => new Date('2026-04-11T08:05:00.000Z'),
      readFile: async () => '',
      agentCliManager: createAgentCliManager({
        selection: {
          cliType: null,
          isSkipped: true,
          selectedAt: '2026-04-10T00:00:00.000Z',
        },
        resolvedPaths: {
          node: '/opt/bin/node',
          npm: '/opt/bin/npm',
          npx: '/opt/bin/npx',
          git: '/opt/bin/git',
        },
      }),
      runCommand: createRunCommand((command, args) => {
        if (command === 'sw_vers' && args[0] === '-productName') {
          return { stdout: 'macOS\n' };
        }

        if (command === 'sw_vers' && args[0] === '-productVersion') {
          return { stdout: '15.4\n' };
        }

        if (command === 'sw_vers' && args[0] === '-buildVersion') {
          return { stdout: '24E248\n' };
        }

        if (command === 'sysctl' && args[1] === 'machdep.cpu.brand_string') {
          return { stdout: 'Apple M3\n' };
        }

        if (command === 'sysctl' && args[1] === 'hw.physicalcpu') {
          return { stdout: '8\n' };
        }

        if (command === '/opt/bin/node') {
          return { stdout: 'v22.11.0\n' };
        }

        if (command === '/opt/bin/npm') {
          return { stdout: '10.9.2\n' };
        }

        if (command === '/opt/bin/npx') {
          return { stdout: '10.9.2\n' };
        }

        if (command === '/opt/bin/git') {
          return { stdout: 'git version 2.49.0\n' };
        }

        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
      }),
    });

    const result = await manager.run();

    assert.equal(result.summary.status, 'success');
    assert.equal(result.data.agentCli.status, 'not-selected');
    assert.match(result.report, /selected=none/);
    assert.equal(result.data.windowsCodePage, undefined);
  });

  it('uses CLI-specific version lookup rules and captures Windows code page details', async () => {
    const invocations: string[] = [];
    const manager = new SystemDiagnosticManager({
      platform: 'win32',
      architecture: 'x64',
      hostname: () => 'desktop-win',
      osType: () => 'Windows_NT',
      osRelease: () => '10.0.26100',
      osVersion: () => 'Windows 11',
      cpus: () => [{ model: 'Fallback Windows CPU', speed: 1000, times: { idle: 0, irq: 0, nice: 0, sys: 0, user: 0 } }],
      totalMem: () => 64 * 1024 ** 3,
      freeMem: () => 40 * 1024 ** 3,
      now: () => new Date('2026-04-11T08:10:00.000Z'),
      readFile: async () => '',
      agentCliManager: createAgentCliManager({
        selection: {
          cliType: AgentCliType.CopilotCli,
          isSkipped: false,
          selectedAt: '2026-04-11T08:09:00.000Z',
        },
        resolvedPaths: {
          copilot: 'C:\\Tools\\copilot.cmd',
          node: 'C:\\Tools\\node.exe',
          npm: 'C:\\Tools\\npm.cmd',
          npx: 'C:\\Tools\\npx.cmd',
          git: 'C:\\Tools\\git.exe',
        },
      }),
      runCommand: createRunCommand((command, args) => {
        invocations.push(`${command} ${args.join(' ')}`.trim());

        if (command === 'chcp') {
          return { stdout: 'Active code page: 936\r\n' };
        }

        if (command === 'pwsh.exe' && args[2]?.includes('Win32_OperatingSystem')) {
          return {
            stdout: '{"caption":"Windows 11 Pro","version":"10.0.26100","buildNumber":"26100"}',
          };
        }

        if (command === 'pwsh.exe' && args[2]?.includes('Win32_Processor')) {
          return {
            stdout: '{"cpuName":"AMD Ryzen 9 7940HS","cpuCores":8,"totalPhysicalMemory":"68719476736"}',
          };
        }

        if (command === 'pwsh.exe' && args[2]?.includes('outputEncoding')) {
          return {
            stdout: '{"outputEncoding":"utf-8","shell":"C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe"}',
          };
        }

        if (command === 'C:\\Tools\\copilot.cmd' && args[0] === 'version') {
          return { stdout: 'copilot 1.2.3\n' };
        }

        if (command === 'C:\\Tools\\node.exe') {
          return { stdout: 'v22.11.0\n' };
        }

        if (command === 'C:\\Tools\\npm.cmd') {
          return { stdout: '10.9.2\n' };
        }

        if (command === 'C:\\Tools\\npx.cmd') {
          return { stdout: '10.9.2\n' };
        }

        if (command === 'C:\\Tools\\git.exe') {
          return { stdout: 'git version 2.49.0.windows.1\n' };
        }

        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
      }),
    });

    const result = await manager.run();

    assert.equal(result.summary.status, 'success');
    assert.equal(result.data.agentCli.status, 'healthy');
    assert.equal(result.data.agentCli.version, '1.2.3');
    assert.equal(result.data.windowsCodePage?.activeCodePage, '936');
    assert.equal(result.data.windowsCodePage?.outputEncoding, 'utf-8');
    assert.ok(invocations.includes('C:\\Tools\\copilot.cmd version'));
    assert.match(result.report, /\[windows-code-page\]/);
  });

  it('keeps partial results and formats missing or failed checks into the report', async () => {
    const manager = new SystemDiagnosticManager({
      platform: 'linux',
      architecture: 'x64',
      hostname: () => 'broken-box',
      osType: () => 'Linux',
      osRelease: () => '6.8.0',
      osVersion: () => '6.8.0-custom',
      cpus: () => [{ model: 'Fallback CPU', speed: 1000, times: { idle: 0, irq: 0, nice: 0, sys: 0, user: 0 } }],
      totalMem: () => 8 * 1024 ** 3,
      freeMem: () => 2 * 1024 ** 3,
      now: () => new Date('2026-04-11T08:20:00.000Z'),
      readFile: async () => {
        throw new Error('os-release unavailable');
      },
      agentCliManager: createAgentCliManager({
        selection: {
          cliType: AgentCliType.Codex,
          isSkipped: false,
          selectedAt: '2026-04-11T08:19:00.000Z',
        },
        resolvedPaths: {
          codex: null,
          node: '/opt/bin/node',
          npm: null,
          npx: '/opt/bin/npx',
          git: '/opt/bin/git',
        },
      }),
      runCommand: createRunCommand((command) => {
        if (command === 'lscpu') {
          throw new Error('permission denied');
        }

        if (command === '/opt/bin/node') {
          return { stdout: 'v22.11.0\n' };
        }

        if (command === '/opt/bin/npx') {
          return { stderr: '10.9.2\n' };
        }

        if (command === '/opt/bin/git') {
          return { stdout: '' };
        }

        throw new Error(`Unexpected command: ${command}`);
      }),
    });

    const result = await manager.run();

    assert.equal(result.summary.status, 'partial-failure');
    assert.ok(result.summary.errorCount >= 4);
    assert.match(result.report, /\[errors\]/);
    assert.match(result.report, /agent-cli\.codex=missing:/);
    assert.match(result.report, /toolchain\.npm=missing:/);
    assert.match(result.report, /toolchain\.git=error:/);
    assert.match(result.report, /system\.os-release=error:/);
  });
});
