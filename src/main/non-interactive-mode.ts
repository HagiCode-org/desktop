import type DependencyManagementService from './dependency-management-service.js';
import type {
  CliDependencyInstallResult,
} from './dependency-management-service.js';
import type {
  NonInteractiveRuntimeVerificationReport,
} from './non-interactive-runtime-verify.js';
import type {
  NonInteractiveRuntimeLifecycleReport,
} from './non-interactive-runtime-lifecycle.js';
import type {
  DependencyManagementOperationProgress,
  ManagedNpmPackageId,
} from '../types/dependency-management.js';

export type NonInteractiveCommandKind = 'deps-install' | 'runtime-verify' | 'runtime-lifecycle';

export interface NonInteractiveDepsInstallCommand {
  kind: 'deps-install';
  packageIds: ManagedNpmPackageId[];
}

export interface NonInteractiveRuntimeVerifyCommand {
  kind: 'runtime-verify';
}

export interface NonInteractiveRuntimeLifecycleCommand {
  kind: 'runtime-lifecycle';
}

export type NonInteractiveCommand =
  | NonInteractiveDepsInstallCommand
  | NonInteractiveRuntimeVerifyCommand
  | NonInteractiveRuntimeLifecycleCommand;

export type NonInteractiveParseResult =
  | { handled: false; reason: 'no-command' }
  | { handled: true; ok: true; command: NonInteractiveCommand; userArgs: string[] }
  | { handled: true; ok: false; error: string; userArgs: string[] };

export interface NonInteractiveRunResult {
  exitCode: number;
  stage: 'usage' | 'environment' | 'bootstrap' | 'install' | 'verification' | 'success' | 'internal';
  error?: string;
}

export interface NonInteractiveOutput {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

export interface NonInteractiveRunOptions {
  service?: Pick<DependencyManagementService, 'onProgress' | 'installManagedPackagesForCli'>;
  output?: NonInteractiveOutput;
  runtimeVerifier?: () => Promise<NonInteractiveRuntimeVerificationReport>;
  runtimeLifecycleVerifier?: () => Promise<NonInteractiveRuntimeLifecycleReport>;
}

export const nonInteractiveExitCodes = {
  success: 0,
  usage: 64,
  environment: 69,
  bootstrap: 70,
  install: 71,
  verification: 72,
  internal: 1,
} as const;

const flagToPackageId = new Map<string, ManagedNpmPackageId>([
  ['--claude-code', 'claude-code'],
  ['--codex', 'codex'],
]);

export const nonInteractiveUsageText = [
  'Usage:',
  '  Hagicode Desktop deps install --claude-code --codex',
  '  Hagicode Desktop runtime verify',
  '  Hagicode Desktop runtime lifecycle',
  '',
  'Supported commands:',
  '  runtime verify  Validate the migrated Desktop runtime structure and report resolved paths.',
  '  runtime lifecycle  Validate hagiscript-managed runtime service lifecycle transitions.',
  '',
  'Supported deps install flags:',
  '  --claude-code   Install the Desktop-managed Claude Code package.',
  '  --codex         Install the Desktop-managed Codex package.',
  '',
  'Exit codes:',
  `  ${nonInteractiveExitCodes.success}   success`,
  `  ${nonInteractiveExitCodes.usage}  command or flag usage error`,
  `  ${nonInteractiveExitCodes.environment}  Desktop-managed Node/npm environment unavailable`,
  `  ${nonInteractiveExitCodes.bootstrap}  hagiscript bootstrap install or verification failed`,
  `  ${nonInteractiveExitCodes.install}  requested package installation failed`,
  `  ${nonInteractiveExitCodes.verification}  post-install package verification failed`,
  `  ${nonInteractiveExitCodes.internal}   unexpected internal failure`,
].join('\n');

function isIgnorableLeadingRuntimeFlag(value: string): boolean {
  return value === '--headless'
    || value === '--disable-gpu'
    || value === '--disable-setuid-sandbox'
    || value === '--no-sandbox'
    || value === '--hagicode-non-interactive-integration'
    || value.startsWith('--hagicode-user-data-dir=')
    || value.startsWith('--hagicode-non-interactive-log-path=')
    || value.startsWith('-psn_')
    || value.startsWith('--ozone-platform=');
}

function looksLikeExecutableArg(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  const baseName = normalized.split('/').pop();
  return normalized.endsWith('/electron')
    || normalized.endsWith('/electron.exe')
    || normalized.endsWith('/node')
    || normalized.endsWith('/node.exe')
    || normalized.endsWith('/hagicode desktop')
    || normalized.endsWith('/hagicode desktop.exe')
    || normalized.endsWith('/hagicode-desktop')
    || normalized.endsWith('/hagicode-desktop.exe')
    || normalized.endsWith('/hagicode')
    || normalized.endsWith('/hagicode.exe')
    || baseName === 'electron'
    || baseName === 'electron.exe'
    || baseName === 'node'
    || baseName === 'node.exe'
    || baseName === 'hagicode desktop'
    || baseName === 'hagicode desktop.exe'
    || baseName === 'hagicode-desktop'
    || baseName === 'hagicode-desktop.exe'
    || baseName === 'hagicode'
    || baseName === 'hagicode.exe';
}

function looksLikeAppEntrypoint(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return value === '.'
    || normalized.endsWith('/dist/main/main.js')
    || normalized.endsWith('/dist/main/main.mjs')
    || normalized.endsWith('/dist/main/bootstrap.js')
    || normalized.endsWith('/dist/main/bootstrap.mjs')
    || normalized.endsWith('/src/main/main.ts')
    || normalized.endsWith('/src/main/bootstrap.ts')
    || normalized.endsWith('/package.json');
}

function shouldSkipLeadingRuntimeFlagValue(value: string): boolean {
  return value !== 'deps'
    && !value.startsWith('-')
    && !looksLikeExecutableArg(value)
    && !looksLikeAppEntrypoint(value);
}

export function extractNonInteractiveUserArgs(argv: readonly string[]): string[] {
  const args = [...argv];

  while (args.length > 0) {
    const current = args[0];

    if (
      looksLikeExecutableArg(current)
      || looksLikeAppEntrypoint(current)
      || isIgnorableLeadingRuntimeFlag(current)
    ) {
      args.shift();
      continue;
    }

    if (current.startsWith('-')) {
      args.shift();
      if (args.length > 0 && shouldSkipLeadingRuntimeFlagValue(args[0])) {
        args.shift();
      }
      continue;
    }

    break;
  }

  return args;
}

export function parseNonInteractiveCommand(argv: readonly string[]): NonInteractiveParseResult {
  const userArgs = extractNonInteractiveUserArgs(argv);

  if (userArgs.length === 0 || userArgs[0]?.startsWith('-')) {
    return { handled: false, reason: 'no-command' };
  }

  if (userArgs[0] !== 'deps') {
    if (userArgs[0] === 'runtime') {
      if (userArgs[1] !== 'verify' && userArgs[1] !== 'lifecycle') {
        return {
          handled: true,
          ok: false,
          error: `Unsupported runtime command: ${userArgs.slice(0, 2).join(' ') || 'runtime'}`,
          userArgs,
        };
      }

      if (userArgs.length > 2) {
        return {
          handled: true,
          ok: false,
          error: `runtime ${userArgs[1]} does not accept extra arguments: ${userArgs.slice(2).join(' ')}`,
          userArgs,
        };
      }

      return {
        handled: true,
        ok: true,
        command: {
          kind: userArgs[1] === 'verify' ? 'runtime-verify' : 'runtime-lifecycle',
        },
        userArgs,
      };
    }

    return {
      handled: true,
      ok: false,
      error: `Unsupported non-interactive command: ${userArgs[0]}`,
      userArgs,
    };
  }

  if (userArgs[1] !== 'install') {
    return {
      handled: true,
      ok: false,
      error: `Unsupported deps command: ${userArgs.slice(0, 2).join(' ') || 'deps'}`,
      userArgs,
    };
  }

  const packageIds: ManagedNpmPackageId[] = [];
  const seenFlags = new Set<string>();
  const flags = userArgs.slice(2);

  for (const flag of flags) {
    const packageId = flagToPackageId.get(flag);
    if (!packageId) {
      return {
        handled: true,
        ok: false,
        error: `Unsupported deps install flag: ${flag}`,
        userArgs,
      };
    }
    if (seenFlags.has(flag)) {
      return {
        handled: true,
        ok: false,
        error: `Duplicate deps install flag: ${flag}`,
        userArgs,
      };
    }
    seenFlags.add(flag);
    packageIds.push(packageId);
  }

  if (packageIds.length === 0) {
    return {
      handled: true,
      ok: false,
      error: 'deps install requires at least one supported package flag.',
      userArgs,
    };
  }

  return {
    handled: true,
    ok: true,
    command: {
      kind: 'deps-install',
      packageIds,
    },
    userArgs,
  };
}

function defaultOutput(): NonInteractiveOutput {
  return {
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  };
}

function exitCodeForStage(stage: CliDependencyInstallResult['stage']): number {
  switch (stage) {
    case 'success':
      return nonInteractiveExitCodes.success;
    case 'environment':
      return nonInteractiveExitCodes.environment;
    case 'bootstrap':
      return nonInteractiveExitCodes.bootstrap;
    case 'install':
      return nonInteractiveExitCodes.install;
    case 'verification':
      return nonInteractiveExitCodes.verification;
    default:
      return nonInteractiveExitCodes.internal;
  }
}

function printProgress(output: NonInteractiveOutput, event: DependencyManagementOperationProgress): void {
  const percent = typeof event.percentage === 'number' ? ` ${event.percentage}%` : '';
  output.stdout(`[${event.packageId}] ${event.operation}:${event.stage}${percent} ${event.message}`);
}

function printSuccess(output: NonInteractiveOutput, result: CliDependencyInstallResult): void {
  output.stdout('HagiCode Desktop non-interactive dependency install');
  output.stdout(`command: deps install`);
  output.stdout(`requested packages: ${result.requestedPackageIds.join(', ')}`);
  output.stdout(`bootstrap package: hagiscript ${result.bootstrapPerformed ? 'installed' : 'already installed'}`);
  output.stdout(`install root: ${result.snapshot.environment.npmGlobalPrefix}`);
  output.stdout(`managed modules: ${result.snapshot.environment.npmGlobalModulesRoot}`);
  output.stdout(`managed bin: ${result.snapshot.environment.npmGlobalBinRoot}`);
  for (const verification of result.verifications) {
    output.stdout(
      `[${verification.packageId}] status=${verification.status} packageRoot=${verification.packageRoot ?? '<missing>'} executable=${verification.executablePath ?? '<missing>'} resolved=${verification.resolvedCommandPath ?? '<missing>'}`,
    );
  }
  output.stdout('result: success');
}

function printFailure(output: NonInteractiveOutput, result: CliDependencyInstallResult): void {
  output.stderr(`result: failure`);
  output.stderr(`stage: ${result.stage}`);
  output.stderr(`error: ${result.error ?? 'unknown non-interactive dependency install failure'}`);
  if (result.snapshot) {
    output.stderr(`install root: ${result.snapshot.environment.npmGlobalPrefix}`);
    output.stderr(`managed modules: ${result.snapshot.environment.npmGlobalModulesRoot}`);
    output.stderr(`managed bin: ${result.snapshot.environment.npmGlobalBinRoot}`);
  }
}

function formatRuntimeVerificationIssues(issues: string[]): string {
  return issues.length > 0 ? issues.join(' | ') : '<none>';
}

function printRuntimeVerificationReport(output: NonInteractiveOutput, report: NonInteractiveRuntimeVerificationReport): void {
  output.stdout('HagiCode Desktop non-interactive runtime verification');
  output.stdout('command: runtime verify');
  output.stdout(`runtime mode: ${report.mode}`);
  output.stdout(`runtime manifest: ${report.manifestPath}`);
  output.stdout(`runtime program home: ${report.programHome}`);
  output.stdout(`runtime program home exists: ${report.programHomeExists}`);
  output.stdout(`runtime data home: ${report.dataHome}`);
  output.stdout(`runtime data home exists: ${report.dataHomeExists}`);
  output.stdout(`runtime shared config: ${report.sharedPaths.config}`);
  output.stdout(`runtime shared logs: ${report.sharedPaths.logs}`);
  output.stdout(`runtime shared data: ${report.sharedPaths.data}`);
  output.stdout(`runtime shared state: ${report.sharedPaths.state}`);
  output.stdout(`runtime service code-server data: ${report.serviceDataHomes.codeServer}`);
  output.stdout(`runtime component dotnet root: ${report.components.dotnet.root}`);
  output.stdout(`runtime component dotnet status: ${report.components.dotnet.status}`);
  output.stdout(`runtime component dotnet executable: ${report.components.dotnet.executablePath}`);
  output.stdout(`runtime component dotnet aspnet: ${report.components.dotnet.aspNetCoreVersion ?? '<missing>'}`);
  output.stdout(`runtime component dotnet netcore: ${report.components.dotnet.netCoreVersion ?? '<missing>'}`);
  output.stdout(`runtime component dotnet hostfxr: ${report.components.dotnet.hostFxrVersion ?? '<missing>'}`);
  output.stdout(`runtime component dotnet source: ${report.components.dotnet.runtimeSource ?? '<missing>'}`);
  output.stdout(`runtime component dotnet issues: ${formatRuntimeVerificationIssues(report.components.dotnet.issues)}`);
  output.stdout(`runtime component node root: ${report.components.node.root}`);
  output.stdout(`runtime component node status: ${report.components.node.status}`);
  output.stdout(`runtime component node manifest: ${report.components.node.manifestPath}`);
  output.stdout(`runtime component node active: ${report.components.node.activeForDesktop}`);
  output.stdout(`runtime component node executable: ${report.components.node.nodeExecutablePath ?? '<missing>'}`);
  output.stdout(`runtime component npm executable: ${report.components.node.npmExecutablePath ?? '<missing>'}`);
  output.stdout(`runtime component node version: ${report.components.node.governedNodeVersion ?? '<missing>'}`);
  output.stdout(`runtime component node issues: ${formatRuntimeVerificationIssues(report.components.node.issues)}`);
  output.stdout(`runtime component code-server root: ${report.components.codeServer.root}`);
  output.stdout(`runtime component code-server status: ${report.components.codeServer.status}`);
  output.stdout(`runtime component code-server wrapper: ${report.components.codeServer.wrapperPath ?? '<missing>'}`);
  output.stdout(`runtime component code-server entry: ${report.components.codeServer.entryScriptPath ?? '<missing>'}`);
  output.stdout(`runtime component code-server version: ${report.components.codeServer.version ?? '<missing>'}`);
  output.stdout(`runtime component code-server issues: ${formatRuntimeVerificationIssues(report.components.codeServer.issues)}`);
}

function printRuntimeVerificationFailure(output: NonInteractiveOutput, report: NonInteractiveRuntimeVerificationReport): void {
  output.stderr('result: failure');
  output.stderr('stage: verification');
  output.stderr('error: runtime verification failed');
  for (const issue of report.issues) {
    output.stderr(`issue: ${issue}`);
  }
}

function printRuntimeLifecycleReport(output: NonInteractiveOutput, report: NonInteractiveRuntimeLifecycleReport): void {
  output.stdout('HagiCode Desktop non-interactive runtime lifecycle');
  output.stdout('command: runtime lifecycle');
  output.stdout(`desktop logs directory: ${report.desktopLogsDirectory}`);
  output.stdout(`managed npm prefix: ${report.tooling.npmGlobalPrefix}`);
  output.stdout(`managed npm bin: ${report.tooling.npmGlobalBinRoot}`);
  output.stdout(`managed npm modules: ${report.tooling.npmGlobalModulesRoot}`);
  output.stdout(`hagiscript package root: ${report.tooling.hagiscriptPackageRoot ?? '<missing>'}`);
  output.stdout(`hagiscript executable: ${report.tooling.hagiscriptExecutablePath ?? '<missing>'}`);
  output.stdout(`hagiscript version: ${report.tooling.hagiscriptPackageVersion ?? '<missing>'}`);
  output.stdout(`hagiscript package managed: ${report.tooling.hagiscriptPackageUnderManagedModules}`);
  output.stdout(`hagiscript executable managed: ${report.tooling.hagiscriptExecutableUnderManagedBin}`);
  output.stdout(`standalone pm2 package root: ${report.tooling.pm2PackageRoot ?? '<missing>'}`);
  output.stdout(`bundled pm2 executable: ${report.tooling.pm2ExecutablePath ?? '<missing>'}`);
  output.stdout(`standalone pm2 version: ${report.tooling.pm2PackageVersion ?? '<missing>'}`);
  output.stdout(`standalone pm2 package managed: ${report.tooling.pm2PackageUnderManagedModules}`);
  output.stdout(`standalone pm2 executable managed: ${report.tooling.pm2ExecutableUnderManagedBin}`);

  output.stdout(`code-server pm2 home: ${report.services.codeServer.pm2Home}`);
  output.stdout(`code-server runtime data: ${report.services.codeServer.runtimeDataHome}`);
  output.stdout(`code-server runtime files: ${report.services.codeServer.runtimeFilesDir ?? '<missing>'}`);
  output.stdout(`code-server launch script: ${report.services.codeServer.launchScriptPath ?? '<missing>'}`);
  output.stdout(`code-server launch cwd: ${report.services.codeServer.launchWorkingDirectory ?? '<missing>'}`);
  output.stdout(`code-server start success: ${report.services.codeServer.startSuccess}`);
  output.stdout(`code-server status after start: ${report.services.codeServer.statusAfterStart}`);
  output.stdout(`code-server stop success: ${report.services.codeServer.stopSuccess}`);
  output.stdout(`code-server status after stop: ${report.services.codeServer.statusAfterStop}`);

  output.stdout(`backend active runtime root: ${report.services.backend.activeRuntimeRoot ?? '<missing>'}`);
  output.stdout(`backend payload dll: ${report.services.backend.serviceDllPath ?? '<missing>'}`);
  output.stdout(`backend working directory: ${report.services.backend.serviceWorkingDirectory ?? '<missing>'}`);
  output.stdout(`backend required runtime: ${report.services.backend.requiredRuntimeLabel ?? '<missing>'}`);
  output.stdout(`backend pm2 home: ${report.services.backend.pm2Home}`);
  output.stdout(`backend runtime data: ${report.services.backend.runtimeDataHome}`);
  output.stdout(`backend runtime files: ${report.services.backend.runtimeFilesDir ?? '<missing>'}`);
  output.stdout(`backend lifecycle skipped: ${report.services.backend.skipped}`);
  output.stdout(`backend lifecycle skip reason: ${report.services.backend.skipReason ?? '<none>'}`);
  output.stdout(`backend start success: ${report.services.backend.startSuccess}`);
  output.stdout(`backend status after start: ${report.services.backend.statusAfterStart}`);
  output.stdout(`backend restart success: ${report.services.backend.restartSuccess}`);
  output.stdout(`backend status after restart: ${report.services.backend.statusAfterRestart}`);
  output.stdout(`backend stop success: ${report.services.backend.stopSuccess}`);
  output.stdout(`backend status after stop: ${report.services.backend.statusAfterStop}`);
}

function printRuntimeLifecycleFailure(output: NonInteractiveOutput, report: NonInteractiveRuntimeLifecycleReport): void {
  output.stderr('result: failure');
  output.stderr('stage: verification');
  output.stderr('error: runtime lifecycle verification failed');
  for (const issue of report.issues) {
    output.stderr(`issue: ${issue}`);
  }

  for (const [serviceName, serviceReport] of Object.entries(report.services)) {
    for (const diagnostic of serviceReport.diagnostics) {
      output.stderr(`${serviceName} diagnostic: ${diagnostic}`);
    }
  }
}

async function runRuntimeVerificationCommand(
  output: NonInteractiveOutput,
  runtimeVerifier?: () => Promise<NonInteractiveRuntimeVerificationReport>,
): Promise<NonInteractiveRunResult> {
  try {
    const verifier = runtimeVerifier ?? (async () => {
      const { verifyDesktopRuntimeStructure } = await import('./non-interactive-runtime-verify.js');
      return verifyDesktopRuntimeStructure();
    });
    const report = await verifier();
    printRuntimeVerificationReport(output, report);
    if (!report.ok) {
      printRuntimeVerificationFailure(output, report);
      return {
        exitCode: nonInteractiveExitCodes.verification,
        stage: 'verification',
        error: report.issues.join('; ') || 'runtime verification failed',
      };
    }
    output.stdout('result: success');
    return {
      exitCode: nonInteractiveExitCodes.success,
      stage: 'success',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.stderr('result: failure');
    output.stderr('stage: verification');
    output.stderr(`error: ${message}`);
    return {
      exitCode: nonInteractiveExitCodes.verification,
      stage: 'verification',
      error: message,
    };
  }
}

async function runRuntimeLifecycleCommand(
  output: NonInteractiveOutput,
  runtimeLifecycleVerifier?: () => Promise<NonInteractiveRuntimeLifecycleReport>,
): Promise<NonInteractiveRunResult> {
  try {
    const verifier = runtimeLifecycleVerifier ?? (async () => {
      const { verifyDesktopRuntimeLifecycle } = await import('./non-interactive-runtime-lifecycle.js');
      return verifyDesktopRuntimeLifecycle();
    });
    const report = await verifier();
    printRuntimeLifecycleReport(output, report);
    if (!report.ok) {
      printRuntimeLifecycleFailure(output, report);
      return {
        exitCode: nonInteractiveExitCodes.verification,
        stage: 'verification',
        error: report.issues.join('; ') || 'runtime lifecycle verification failed',
      };
    }
    output.stdout('result: success');
    return {
      exitCode: nonInteractiveExitCodes.success,
      stage: 'success',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.stderr('result: failure');
    output.stderr('stage: verification');
    output.stderr(`error: ${message}`);
    return {
      exitCode: nonInteractiveExitCodes.verification,
      stage: 'verification',
      error: message,
    };
  }
}

export async function runNonInteractiveCommand(
  parseResult: NonInteractiveParseResult,
  options: NonInteractiveRunOptions = {},
): Promise<NonInteractiveRunResult> {
  const output = options.output ?? defaultOutput();

  if (!parseResult.handled) {
    return { exitCode: nonInteractiveExitCodes.success, stage: 'success' };
  }

  if (!parseResult.ok) {
    output.stderr(parseResult.error);
    output.stderr(nonInteractiveUsageText);
    return {
      exitCode: nonInteractiveExitCodes.usage,
      stage: 'usage',
      error: parseResult.error,
    };
  }

  if (parseResult.command.kind === 'runtime-verify') {
    return runRuntimeVerificationCommand(output, options.runtimeVerifier);
  }
  if (parseResult.command.kind === 'runtime-lifecycle') {
    return runRuntimeLifecycleCommand(output, options.runtimeLifecycleVerifier);
  }

  const service = options.service ?? new (await import('./dependency-management-service.js')).default();
  const unsubscribe = service.onProgress((event) => printProgress(output, event));

  try {
    const result = await service.installManagedPackagesForCli(parseResult.command.packageIds);
    if (result.success) {
      printSuccess(output, result);
    } else {
      printFailure(output, result);
    }

    return {
      exitCode: exitCodeForStage(result.stage),
      stage: result.stage,
      error: result.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.stderr(`result: failure`);
    output.stderr(`stage: internal`);
    output.stderr(`error: ${message}`);
    return {
      exitCode: nonInteractiveExitCodes.internal,
      stage: 'internal',
      error: message,
    };
  } finally {
    unsubscribe();
  }
}
