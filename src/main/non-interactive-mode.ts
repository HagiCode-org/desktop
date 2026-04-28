import type DependencyManagementService from './dependency-management-service.js';
import type {
  CliDependencyInstallResult,
} from './dependency-management-service.js';
import type {
  DependencyManagementOperationProgress,
  ManagedNpmPackageId,
} from '../types/dependency-management.js';

export type NonInteractiveCommandKind = 'deps-install';

export interface NonInteractiveDepsInstallCommand {
  kind: 'deps-install';
  packageIds: ManagedNpmPackageId[];
}

export type NonInteractiveCommand = NonInteractiveDepsInstallCommand;

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
  '',
  'Supported flags:',
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
    || value === '--no-sandbox'
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
    || normalized.endsWith('/src/main/main.ts')
    || normalized.endsWith('/package.json');
}

export function extractNonInteractiveUserArgs(argv: readonly string[]): string[] {
  const args = [...argv];

  while (args.length > 0 && (
    looksLikeExecutableArg(args[0])
    || looksLikeAppEntrypoint(args[0])
    || isIgnorableLeadingRuntimeFlag(args[0])
  )) {
    args.shift();
  }

  return args;
}

export function parseNonInteractiveCommand(argv: readonly string[]): NonInteractiveParseResult {
  const userArgs = extractNonInteractiveUserArgs(argv);

  if (userArgs.length === 0 || userArgs[0]?.startsWith('-')) {
    return { handled: false, reason: 'no-command' };
  }

  if (userArgs[0] !== 'deps') {
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
