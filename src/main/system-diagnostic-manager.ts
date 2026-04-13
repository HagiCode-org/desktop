import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';
import log from 'electron-log';
import type AgentCliManager from './agent-cli-manager.js';
import { AgentCliType, getCliConfig } from '../types/agent-cli.js';
import type {
  SystemDiagnosticAgentCliInfo,
  SystemDiagnosticCommandProbe,
  SystemDiagnosticCommandScope,
  SystemDiagnosticCoverageMatrix,
  SystemDiagnosticData,
  SystemDiagnosticHardwareInfo,
  SystemDiagnosticIssue,
  SystemDiagnosticMeta,
  SystemDiagnosticResult,
  SystemDiagnosticSystemInfo,
  SystemDiagnosticWindowsCodePageInfo,
} from '../types/system-diagnostic.js';

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 5_000;
const GIGABYTE = 1024 ** 3;

export const AUDITED_CORE_DEPENDENCY_COVERAGE_MATRIX: SystemDiagnosticCoverageMatrix = Object.freeze({
  auditedConsumers: [
    'CliVersionService',
    'AgentCliInstallPrerequisiteChecker',
    'SkillInstallService',
    'WizardComponentDetectionAppService',
  ],
  requiredCommands: ['node', 'npm', 'npx', 'git'],
  notes: [
    'Selected Agent CLI probing follows the same command-candidate and version-lookup shape used by hagicode-core provider version checks.',
    'node, npm, npx, and git are the first-pass commands because hagicode-core currently consumes them in runtime detection, install prerequisites, or managed skill flows.',
  ],
});

const REQUIRED_TOOLCHAIN_SCOPE: SystemDiagnosticCommandScope = 'required-by-core-runtime';

const TOOLCHAIN_PROBES = [
  { command: 'node', displayName: 'Node.js', versionArgs: [['--version']] },
  { command: 'npm', displayName: 'npm', versionArgs: [['--version']] },
  { command: 'npx', displayName: 'npx', versionArgs: [['--version']] },
  { command: 'git', displayName: 'Git', versionArgs: [['--version']] },
] as const;

const AGENT_CLI_VERSION_ARGS: Record<AgentCliType, string[][]> = {
  [AgentCliType.ClaudeCode]: [['--version'], ['version'], ['-v']],
  [AgentCliType.Codex]: [['--version'], ['version'], ['-v']],
  [AgentCliType.CopilotCli]: [['version'], ['--version'], ['-v']],
};

interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

interface CommandExecutionOptions {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

type RunCommand = (
  command: string,
  args: string[],
  options?: CommandExecutionOptions,
) => Promise<CommandExecutionResult>;

interface AgentCliDiagnosticAdapter {
  loadSelection: () => { cliType: AgentCliType | null; isSkipped: boolean; selectedAt: string | null };
  getCommandCandidates: (cliType: AgentCliType) => string[];
  getRuntimeEnv: () => Promise<NodeJS.ProcessEnv>;
  resolveCommandPath: (commandCandidates: string[], env?: NodeJS.ProcessEnv) => Promise<string | null>;
}

interface SystemDiagnosticManagerDeps {
  agentCliManager?: AgentCliDiagnosticAdapter | null;
  runCommand?: RunCommand;
  readFile?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  platform?: NodeJS.Platform;
  architecture?: string;
  hostname?: () => string;
  osType?: () => string;
  osRelease?: () => string;
  osVersion?: () => string;
  cpus?: () => os.CpuInfo[];
  totalMem?: () => number;
  freeMem?: () => number;
  now?: () => Date;
}

function normalizeVersionOutput(rawOutput: string): string | null {
  const firstLine = rawOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return null;
  }

  const match = firstLine.match(/v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/i);
  return match?.[0] ?? firstLine.slice(0, 120);
}

function formatGigabytes(value: number): string {
  return (value / GIGABYTE).toFixed(1).replace(/\.0$/, '');
}

function shellEscape(argument: string): string {
  return `'${argument.replace(/'/g, `'\\''`)}'`;
}

function firstNonEmptyLine(rawOutput: string): string | null {
  return rawOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? null;
}

function parseLinuxOsRelease(content: string): Record<string, string> {
  return content
    .split(/\r?\n/)
    .reduce<Record<string, string>>((accumulator, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return accumulator;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) {
        return accumulator;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^"/, '')
        .replace(/"$/, '');

      accumulator[key] = value;
      return accumulator;
    }, {});
}

function parseLscpuModel(content: string): string | null {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^Model name:\s*(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function parseChcpOutput(content: string): string | null {
  const match = content.match(/:\s*(\d+)/);
  return match?.[1] ?? null;
}

async function defaultRunCommand(
  command: string,
  args: string[],
  options: CommandExecutionOptions = {},
): Promise<CommandExecutionResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      env: options.env,
      windowsHide: true,
      timeout: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });

    return {
      stdout: typeof stdout === 'string' ? stdout : String(stdout ?? ''),
      stderr: typeof stderr === 'string' ? stderr : String(stderr ?? ''),
      exitCode: 0,
    };
  } catch (error) {
    const typedError = error as Error & {
      code?: string | number;
      stdout?: string;
      stderr?: string;
    };

    if (typedError.code === 'ENOENT') {
      throw error;
    }

    return {
      stdout: typedError.stdout ?? '',
      stderr: typedError.stderr ?? typedError.message ?? '',
      exitCode: typeof typedError.code === 'number' ? typedError.code : 1,
    };
  }
}

export class SystemDiagnosticManager {
  private readonly agentCliManager: AgentCliDiagnosticAdapter | null;
  private readonly runCommand: RunCommand;
  private readonly readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  private readonly platform: NodeJS.Platform;
  private readonly architecture: string;
  private readonly hostname: () => string;
  private readonly osType: () => string;
  private readonly osRelease: () => string;
  private readonly osVersion: () => string;
  private readonly cpus: () => os.CpuInfo[];
  private readonly totalMem: () => number;
  private readonly freeMem: () => number;
  private readonly now: () => Date;
  private lastResult: SystemDiagnosticResult | null = null;

  constructor(deps: SystemDiagnosticManagerDeps = {}) {
    this.agentCliManager = deps.agentCliManager ?? null;
    this.runCommand = deps.runCommand ?? defaultRunCommand;
    this.readFile = deps.readFile ?? ((filePath, encoding) => fs.readFile(filePath, encoding));
    this.platform = deps.platform ?? process.platform;
    this.architecture = deps.architecture ?? process.arch;
    this.hostname = deps.hostname ?? os.hostname;
    this.osType = deps.osType ?? os.type;
    this.osRelease = deps.osRelease ?? os.release;
    this.osVersion = deps.osVersion ?? os.version;
    this.cpus = deps.cpus ?? os.cpus;
    this.totalMem = deps.totalMem ?? os.totalmem;
    this.freeMem = deps.freeMem ?? os.freemem;
    this.now = deps.now ?? (() => new Date());
  }

  getLastResult(): SystemDiagnosticResult | null {
    return this.lastResult;
  }

  async run(): Promise<SystemDiagnosticResult> {
    const startedAt = this.now();
    const runtimeEnv = await this.loadRuntimeEnvironment();
    const issues: SystemDiagnosticIssue[] = [];

    const metaBase = {
      generatedAt: startedAt.toISOString(),
      platform: this.platform,
      architecture: this.architecture,
      hostname: this.hostname(),
    };

    const system = await this.collectSystemInfo(runtimeEnv, issues);
    const hardware = await this.collectHardwareInfo(runtimeEnv, issues);
    const agentCli = await this.collectAgentCliInfo(runtimeEnv, issues);
    const toolchain = await this.collectToolchainInfo(runtimeEnv, issues);
    const windowsCodePage = this.platform === 'win32'
      ? await this.collectWindowsCodePageInfo(runtimeEnv, issues)
      : undefined;

    const completedAt = this.now().toISOString();
    const meta: SystemDiagnosticMeta = {
      ...metaBase,
      completedAt,
    };

    const data: SystemDiagnosticData = {
      meta,
      system,
      hardware,
      agentCli,
      toolchain,
      issues,
      ...(windowsCodePage ? { windowsCodePage } : {}),
    };

    const summary = {
      status: issues.length > 0 ? 'partial-failure' : 'success',
      completedAt,
      errorCount: issues.length,
      sectionCount: windowsCodePage ? 5 : 4,
    } as const;

    const result: SystemDiagnosticResult = {
      report: this.formatReport(data, summary),
      summary,
      data,
      coverage: AUDITED_CORE_DEPENDENCY_COVERAGE_MATRIX,
    };

    this.lastResult = result;
    return result;
  }

  private async loadRuntimeEnvironment(): Promise<NodeJS.ProcessEnv> {
    if (!this.agentCliManager) {
      return { ...process.env };
    }

    try {
      return await this.agentCliManager.getRuntimeEnv();
    } catch (error) {
      log.warn('[SystemDiagnosticManager] Failed to load runtime environment, falling back to process.env', error);
      return { ...process.env };
    }
  }

  private async collectSystemInfo(
    runtimeEnv: NodeJS.ProcessEnv,
    issues: SystemDiagnosticIssue[],
  ): Promise<SystemDiagnosticSystemInfo> {
    const info: SystemDiagnosticSystemInfo = {
      osName: this.osType(),
      osVersion: this.osVersion(),
      osRelease: this.osRelease(),
      shell: runtimeEnv.SHELL ?? runtimeEnv.ComSpec ?? null,
    };

    if (this.platform === 'linux') {
      try {
        const osReleaseContent = await this.readFile('/etc/os-release', 'utf8');
        const parsed = parseLinuxOsRelease(osReleaseContent);
        info.osName = parsed.PRETTY_NAME ?? parsed.NAME ?? info.osName;
        info.osVersion = parsed.VERSION_ID ?? info.osVersion;
      } catch (error) {
        this.pushIssue(issues, 'system', 'os-release', 'error', this.describeError(error, 'Failed to read /etc/os-release.'));
      }
    }

    if (this.platform === 'darwin') {
      try {
        const [nameResult, versionResult, buildResult] = await Promise.all([
          this.runCommand('sw_vers', ['-productName'], { env: runtimeEnv }),
          this.runCommand('sw_vers', ['-productVersion'], { env: runtimeEnv }),
          this.runCommand('sw_vers', ['-buildVersion'], { env: runtimeEnv }),
        ]);
        info.osName = firstNonEmptyLine(nameResult.stdout) ?? info.osName;
        info.osVersion = firstNonEmptyLine(versionResult.stdout) ?? info.osVersion;
        info.osRelease = firstNonEmptyLine(buildResult.stdout) ?? info.osRelease;
      } catch (error) {
        this.pushIssue(issues, 'system', 'sw_vers', 'error', this.describeError(error, 'Failed to query macOS version information.'));
      }
    }

    if (this.platform === 'win32') {
      try {
        const windowsInfo = await this.runPowerShellJsonCommand<{
          caption?: string;
          version?: string;
          buildNumber?: string;
        }>(
          '$os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber; ' +
          '[pscustomobject]@{ caption = $os.Caption; version = $os.Version; buildNumber = $os.BuildNumber } | ConvertTo-Json -Compress',
          runtimeEnv,
        );

        info.osName = windowsInfo.caption ?? info.osName;
        info.osVersion = windowsInfo.version ?? info.osVersion;
        info.osRelease = windowsInfo.buildNumber ?? info.osRelease;
      } catch (error) {
        this.pushIssue(issues, 'system', 'windows-os', 'error', this.describeError(error, 'Failed to query Windows operating system information.'));
      }
    }

    return info;
  }

  private async collectHardwareInfo(
    runtimeEnv: NodeJS.ProcessEnv,
    issues: SystemDiagnosticIssue[],
  ): Promise<SystemDiagnosticHardwareInfo> {
    const cpuList = this.cpus();
    const info: SystemDiagnosticHardwareInfo = {
      cpuModel: cpuList[0]?.model ?? null,
      cpuCores: cpuList.length > 0 ? cpuList.length : null,
      cpuArchitecture: this.architecture,
      memoryTotalGb: formatGigabytes(this.totalMem()),
      memoryFreeGb: formatGigabytes(this.freeMem()),
    };

    if (this.platform === 'linux') {
      try {
        const result = await this.runCommand('lscpu', [], { env: runtimeEnv });
        info.cpuModel = parseLscpuModel(result.stdout) ?? info.cpuModel;
      } catch (error) {
        this.pushIssue(issues, 'hardware', 'lscpu', 'error', this.describeError(error, 'Failed to query Linux CPU information.'));
      }
    }

    if (this.platform === 'darwin') {
      try {
        const [cpuModelResult, cpuCoreResult] = await Promise.all([
          this.runCommand('sysctl', ['-n', 'machdep.cpu.brand_string'], { env: runtimeEnv }),
          this.runCommand('sysctl', ['-n', 'hw.physicalcpu'], { env: runtimeEnv }),
        ]);

        info.cpuModel = firstNonEmptyLine(cpuModelResult.stdout) ?? info.cpuModel;
        const coreCount = Number(firstNonEmptyLine(cpuCoreResult.stdout));
        info.cpuCores = Number.isFinite(coreCount) ? coreCount : info.cpuCores;
      } catch (error) {
        this.pushIssue(issues, 'hardware', 'sysctl', 'error', this.describeError(error, 'Failed to query macOS hardware information.'));
      }
    }

    if (this.platform === 'win32') {
      try {
        const hardwareInfo = await this.runPowerShellJsonCommand<{
          cpuName?: string;
          cpuCores?: number;
          totalPhysicalMemory?: string | number;
        }>(
          '$cpu = Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores; ' +
          '$system = Get-CimInstance Win32_ComputerSystem | Select-Object TotalPhysicalMemory; ' +
          '[pscustomobject]@{ ' +
          'cpuName = ($cpu | Select-Object -First 1).Name; ' +
          'cpuCores = (($cpu | Measure-Object -Property NumberOfCores -Sum).Sum); ' +
          'totalPhysicalMemory = $system.TotalPhysicalMemory ' +
          '} | ConvertTo-Json -Compress',
          runtimeEnv,
        );

        info.cpuModel = hardwareInfo.cpuName ?? info.cpuModel;
        info.cpuCores = typeof hardwareInfo.cpuCores === 'number' ? hardwareInfo.cpuCores : info.cpuCores;
        const totalPhysicalMemory = Number(hardwareInfo.totalPhysicalMemory);
        if (Number.isFinite(totalPhysicalMemory) && totalPhysicalMemory > 0) {
          info.memoryTotalGb = formatGigabytes(totalPhysicalMemory);
        }
      } catch (error) {
        this.pushIssue(issues, 'hardware', 'windows-hardware', 'error', this.describeError(error, 'Failed to query Windows hardware information.'));
      }
    }

    return info;
  }

  private async collectAgentCliInfo(
    runtimeEnv: NodeJS.ProcessEnv,
    issues: SystemDiagnosticIssue[],
  ): Promise<SystemDiagnosticAgentCliInfo> {
    if (!this.agentCliManager) {
      return {
        selectedCliType: null,
        displayName: null,
        status: 'not-selected',
        commandCandidates: [],
        resolvedPath: null,
        version: null,
        message: 'Agent CLI manager is not available during this diagnostic run.',
      };
    }

    const selection = this.agentCliManager.loadSelection();
    const selectedCliType = selection.cliType;

    if (!selectedCliType) {
      return {
        selectedCliType: null,
        displayName: null,
        status: 'not-selected',
        commandCandidates: [],
        resolvedPath: null,
        version: null,
        message: selection.isSkipped
          ? 'Agent CLI selection was skipped in Desktop settings.'
          : 'No Agent CLI is currently selected in Desktop settings.',
      };
    }

    const commandCandidates = this.agentCliManager.getCommandCandidates(selectedCliType);
    const displayName = getCliConfig(selectedCliType).displayName;
    let resolvedPath: string | null = null;

    try {
      resolvedPath = await this.agentCliManager.resolveCommandPath(commandCandidates, runtimeEnv);
    } catch (error) {
      const message = this.describeError(error, `Failed to resolve ${displayName} command candidates.`);
      this.pushIssue(issues, 'agent-cli', selectedCliType, 'error', message);
      return {
        selectedCliType,
        displayName,
        status: 'error',
        commandCandidates,
        resolvedPath: null,
        version: null,
        message,
      };
    }

    if (!resolvedPath) {
      const message = `No executable matched the stored ${displayName} command candidates.`;
      this.pushIssue(issues, 'agent-cli', selectedCliType, 'missing', message);
      return {
        selectedCliType,
        displayName,
        status: 'missing',
        commandCandidates,
        resolvedPath: null,
        version: null,
        message,
      };
    }

    try {
      const version = await this.probeVersion(resolvedPath, AGENT_CLI_VERSION_ARGS[selectedCliType], runtimeEnv);
      if (!version) {
        const message = `The ${displayName} executable was found, but its version could not be determined.`;
        this.pushIssue(issues, 'agent-cli', selectedCliType, 'error', message);
        return {
          selectedCliType,
          displayName,
          status: 'error',
          commandCandidates,
          resolvedPath,
          version: null,
          message,
        };
      }

      return {
        selectedCliType,
        displayName,
        status: 'healthy',
        commandCandidates,
        resolvedPath,
        version,
        message: null,
      };
    } catch (error) {
      const message = this.describeError(error, `Failed to probe ${displayName} version.`);
      this.pushIssue(issues, 'agent-cli', selectedCliType, 'error', message);
      return {
        selectedCliType,
        displayName,
        status: 'error',
        commandCandidates,
        resolvedPath,
        version: null,
        message,
      };
    }
  }

  private async collectToolchainInfo(
    runtimeEnv: NodeJS.ProcessEnv,
    issues: SystemDiagnosticIssue[],
  ): Promise<SystemDiagnosticCommandProbe[]> {
    const probes: SystemDiagnosticCommandProbe[] = [];

    // Keep this whitelist aligned with the audited hagicode-core dependency matrix.
    // This manager only inspects local machine prerequisites and CLI executables
    // that support runtime troubleshooting.
    for (const toolchainProbe of TOOLCHAIN_PROBES) {
      let resolvedPath: string | null = null;

      try {
        resolvedPath = await this.resolveExecutablePath([toolchainProbe.command], runtimeEnv);
      } catch (error) {
        const message = this.describeError(error, `Failed to resolve "${toolchainProbe.command}" from the console environment.`);
        this.pushIssue(issues, 'toolchain', toolchainProbe.command, 'error', message);
        probes.push({
          command: toolchainProbe.command,
          displayName: toolchainProbe.displayName,
          scope: REQUIRED_TOOLCHAIN_SCOPE,
          status: 'error',
          candidateCommands: [toolchainProbe.command],
          resolvedPath: null,
          version: null,
          message,
        });
        continue;
      }

      if (!resolvedPath) {
        const message = `Command "${toolchainProbe.command}" was not found in the resolved console environment.`;
        this.pushIssue(issues, 'toolchain', toolchainProbe.command, 'missing', message);
        probes.push({
          command: toolchainProbe.command,
          displayName: toolchainProbe.displayName,
          scope: REQUIRED_TOOLCHAIN_SCOPE,
          status: 'missing',
          candidateCommands: [toolchainProbe.command],
          resolvedPath: null,
          version: null,
          message,
        });
        continue;
      }

      try {
        const version = await this.probeVersion(resolvedPath, toolchainProbe.versionArgs, runtimeEnv);
        if (!version) {
          const message = `Command "${toolchainProbe.command}" is present, but its version output could not be parsed.`;
          this.pushIssue(issues, 'toolchain', toolchainProbe.command, 'error', message);
          probes.push({
            command: toolchainProbe.command,
            displayName: toolchainProbe.displayName,
            scope: REQUIRED_TOOLCHAIN_SCOPE,
            status: 'error',
            candidateCommands: [toolchainProbe.command],
            resolvedPath,
            version: null,
            message,
          });
          continue;
        }

        probes.push({
          command: toolchainProbe.command,
          displayName: toolchainProbe.displayName,
          scope: REQUIRED_TOOLCHAIN_SCOPE,
          status: 'available',
          candidateCommands: [toolchainProbe.command],
          resolvedPath,
          version,
          message: null,
        });
      } catch (error) {
        const message = this.describeError(error, `Failed to probe "${toolchainProbe.command}" version.`);
        this.pushIssue(issues, 'toolchain', toolchainProbe.command, 'error', message);
        probes.push({
          command: toolchainProbe.command,
          displayName: toolchainProbe.displayName,
          scope: REQUIRED_TOOLCHAIN_SCOPE,
          status: 'error',
          candidateCommands: [toolchainProbe.command],
          resolvedPath,
          version: null,
          message,
        });
      }
    }

    return probes;
  }

  private async collectWindowsCodePageInfo(
    runtimeEnv: NodeJS.ProcessEnv,
    issues: SystemDiagnosticIssue[],
  ): Promise<SystemDiagnosticWindowsCodePageInfo> {
    const info: SystemDiagnosticWindowsCodePageInfo = {
      activeCodePage: null,
      outputEncoding: null,
      shell: null,
    };

    try {
      const chcpResult = await this.runCommand('chcp', [], { env: runtimeEnv });
      info.activeCodePage = parseChcpOutput(chcpResult.stdout) ?? parseChcpOutput(chcpResult.stderr);
    } catch (error) {
      this.pushIssue(issues, 'windows-code-page', 'chcp', 'error', this.describeError(error, 'Failed to query Windows active code page with chcp.'));
    }

    try {
      const details = await this.runPowerShellJsonCommand<{
        outputEncoding?: string;
        shell?: string;
      }>(
        '[pscustomobject]@{ ' +
        'outputEncoding = [Console]::OutputEncoding.WebName; ' +
        'shell = (Get-Process -Id $PID).Path ' +
        '} | ConvertTo-Json -Compress',
        runtimeEnv,
      );

      info.outputEncoding = details.outputEncoding ?? null;
      info.shell = details.shell ?? null;
    } catch (error) {
      this.pushIssue(issues, 'windows-code-page', 'powershell', 'error', this.describeError(error, 'Failed to query Windows console output encoding.'));
    }

    if (!info.activeCodePage && !info.outputEncoding) {
      this.pushIssue(
        issues,
        'windows-code-page',
        'summary',
        'error',
        'Windows code page details were unavailable because every collector failed.',
      );
    }

    return info;
  }

  private async runPowerShellJsonCommand<T>(
    script: string,
    runtimeEnv: NodeJS.ProcessEnv,
  ): Promise<T> {
    const candidates = ['pwsh.exe', 'powershell.exe'];
    let lastError: unknown = null;

    for (const executable of candidates) {
      try {
        const result = await this.runCommand(executable, ['-NoProfile', '-Command', script], {
          env: runtimeEnv,
        });

        const payload = firstNonEmptyLine(result.stdout) ?? firstNonEmptyLine(result.stderr);
        if (!payload) {
          throw new Error(`No JSON payload returned from ${executable}.`);
        }

        return JSON.parse(payload) as T;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('No supported PowerShell executable was available.');
  }

  private async resolveExecutablePath(
    commandCandidates: string[],
    runtimeEnv: NodeJS.ProcessEnv,
  ): Promise<string | null> {
    if (this.agentCliManager) {
      return this.agentCliManager.resolveCommandPath(commandCandidates, runtimeEnv);
    }

    for (const candidate of commandCandidates) {
      try {
        const result = this.platform === 'win32'
          ? await this.runCommand('where', [candidate], { env: runtimeEnv })
          : await this.runCommand('/bin/sh', ['-lc', `command -v -- ${shellEscape(candidate)}`], { env: runtimeEnv });
        const resolved = firstNonEmptyLine(result.stdout);
        if (resolved) {
          return resolved;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async probeVersion(
    executablePath: string,
    argumentSets: readonly (readonly string[])[],
    runtimeEnv: NodeJS.ProcessEnv,
  ): Promise<string | null> {
    for (const argumentsSet of argumentSets) {
      try {
        const result = await this.runCommand(executablePath, [...argumentsSet], { env: runtimeEnv });
        const version = normalizeVersionOutput(result.stdout || result.stderr);
        if (version) {
          return version;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private formatReport(
    data: SystemDiagnosticData,
    summary: {
      status: 'success' | 'partial-failure';
      completedAt: string;
      errorCount: number;
      sectionCount: number;
    },
  ): string {
    const lines: string[] = [];

    const pushSection = (sectionName: string, sectionLines: Array<string | null | undefined>) => {
      lines.push(`[${sectionName}]`);
      for (const line of sectionLines) {
        if (line) {
          lines.push(line);
        }
      }
      lines.push('');
    };

    pushSection('meta', [
      `generatedAt=${data.meta.generatedAt}`,
      `completedAt=${data.meta.completedAt}`,
      `platform=${data.meta.platform}-${data.meta.architecture}`,
      `hostname=${data.meta.hostname}`,
      `status=${summary.status}`,
      `issueCount=${summary.errorCount}`,
      `coverage.requiredByCoreRuntime=${AUDITED_CORE_DEPENDENCY_COVERAGE_MATRIX.requiredCommands.join(',')}`,
    ]);

    pushSection('system', [
      `os.name=${data.system.osName}`,
      `os.version=${data.system.osVersion ?? 'unknown'}`,
      `os.release=${data.system.osRelease}`,
      `shell=${data.system.shell ?? 'unknown'}`,
    ]);

    pushSection('hardware', [
      `cpu.model=${data.hardware.cpuModel ?? 'unknown'}`,
      `cpu.cores=${data.hardware.cpuCores ?? 'unknown'}`,
      `cpu.architecture=${data.hardware.cpuArchitecture}`,
      `memory.totalGb=${data.hardware.memoryTotalGb}`,
      `memory.freeGb=${data.hardware.memoryFreeGb}`,
    ]);

    pushSection('agent-cli', [
      `selected=${data.agentCli.selectedCliType ?? 'none'}`,
      `displayName=${data.agentCli.displayName ?? 'none'}`,
      `status=${data.agentCli.status}`,
      `commandCandidates=${data.agentCli.commandCandidates.join(',') || 'none'}`,
      `resolvedPath=${data.agentCli.resolvedPath ?? 'unresolved'}`,
      `version=${data.agentCli.version ?? 'unknown'}`,
      data.agentCli.message ? `message=${data.agentCli.message}` : null,
    ]);

    const toolchainLines = data.toolchain.flatMap((probe) => ([
      `${probe.command}.scope=${probe.scope}`,
      `${probe.command}.status=${probe.status}`,
      `${probe.command}.resolvedPath=${probe.resolvedPath ?? 'unresolved'}`,
      `${probe.command}.version=${probe.version ?? 'unknown'}`,
      probe.message ? `${probe.command}.message=${probe.message}` : null,
    ]));
    pushSection('toolchain', toolchainLines);

    if (data.windowsCodePage) {
      pushSection('windows-code-page', [
        `activeCodePage=${data.windowsCodePage.activeCodePage ?? 'unknown'}`,
        `outputEncoding=${data.windowsCodePage.outputEncoding ?? 'unknown'}`,
        `shell=${data.windowsCodePage.shell ?? 'unknown'}`,
      ]);
    }

    if (data.issues.length > 0) {
      pushSection('errors', data.issues.map((issue) => `${issue.section}.${issue.key}=${issue.kind}: ${issue.message}`));
    }

    return lines.join('\n').trim();
  }

  private pushIssue(
    issues: SystemDiagnosticIssue[],
    section: string,
    key: string,
    kind: 'missing' | 'error',
    message: string,
  ): void {
    issues.push({ section, key, kind, message });
  }

  private describeError(error: unknown, fallbackMessage: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return fallbackMessage;
  }
}

export default SystemDiagnosticManager;
