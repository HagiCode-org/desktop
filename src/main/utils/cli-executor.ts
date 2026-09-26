import { execa, type Options as ExecaOptions } from 'execa';

export type CliOutputType = 'stdout' | 'stderr';
export type CliFailureKind = 'exit' | 'spawn' | 'timeout' | 'cancelled' | 'validation' | 'unknown';

export interface CliExecutorOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  shell?: boolean | string;
  commandChain?: {
    shell?: string;
  };
  windowsHide?: boolean;
  input?: string | Buffer;
  onOutput?: (type: CliOutputType, data: string) => void;
  metadata?: Record<string, unknown>;
}

export interface CliCommandMetadata {
  command: string;
  args: string[];
  cwd?: string;
  shell: boolean | string;
  windowsHide: boolean;
  displayCommand: string;
  metadata?: Record<string, unknown>;
}

export interface CliExecutionResult {
  success: boolean;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  command: CliCommandMetadata;
  error?: {
    kind: CliFailureKind;
    message: string;
  };
}

function stripWrappingQuotes(command: string): string {
  return command.replace(/^"(.*)"$/, '$1');
}

function shouldQuoteWindowsShellArgs(
  command: string,
  shell: boolean | string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== 'win32' || !shell) {
    return false;
  }

  const normalizedCommand = stripWrappingQuotes(command).toLowerCase();
  return normalizedCommand.endsWith('.cmd') || normalizedCommand.endsWith('.bat');
}

function quoteWindowsShellArg(arg: string): string {
  if (arg.length === 0) {
    return '""';
  }

  if (/^".*"$/u.test(arg) || !/[\s"]/u.test(arg)) {
    return arg;
  }

  return `"${arg.replace(/"/gu, '\\"')}"`;
}

export function normalizeCliArgsForShell(
  command: string,
  args: string[],
  shell: boolean | string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (!shouldQuoteWindowsShellArgs(command, shell, platform)) {
    return args;
  }

  return args.map((arg) => quoteWindowsShellArg(arg));
}

function normalizeChunk(chunk: unknown): string {
  return Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
}

function buildCommandMetadata(options: CliExecutorOptions): CliCommandMetadata {
  const shell = options.shell ?? false;
  const args = normalizeCliArgsForShell(options.command, options.args ?? [], shell);
  const windowsHide = options.windowsHide ?? true;
  return {
    command: options.command,
    args,
    cwd: options.cwd,
    shell,
    windowsHide,
    displayCommand: [options.command, ...args].join(' '),
    metadata: options.metadata,
  };
}

type WindowsCommandShell = 'cmd' | 'powershell' | 'pwsh';

function resolveWindowsCommandShell(
  shell: string | undefined,
): { kind: WindowsCommandShell; executable: string } {
  const executable = shell?.trim();
  if (!executable) {
    throw new Error('Select cmd.exe, powershell.exe, or pwsh.exe to run a Windows command chain.');
  }

  const pathParts = executable.split(/[\\/]/u);
  const name = pathParts[pathParts.length - 1]?.toLowerCase();
  if (name === 'cmd.exe') {
    return { kind: 'cmd', executable };
  }
  if (name === 'powershell.exe') {
    return { kind: 'powershell', executable };
  }
  if (name === 'pwsh.exe') {
    return { kind: 'pwsh', executable };
  }
  throw new Error(`Unsupported command-chain shell "${executable}". Select cmd.exe, powershell.exe, or pwsh.exe.`);
}

export function validateWindowsCommandChain(command: string, shell: string | undefined): void {
  const { kind: shellKind } = resolveWindowsCommandShell(shell);
  if (!command.trim()) {
    throw new Error('A Windows command chain cannot be empty.');
  }

  let quote: '"' | "'" | null = null;
  let segmentStart = 0;
  let separatorCount = 0;
  let index = 0;

  const addSeparator = (operatorLength: number) => {
    if (!command.slice(segmentStart, index).trim()) {
      throw new Error('A Windows command chain cannot start with or repeat a separator.');
    }
    separatorCount += 1;
    index += operatorLength;
    segmentStart = index;
  };

  while (index < command.length) {
    const character = command[index];
    const nextCharacter = command[index + 1];

    if (shellKind === 'cmd') {
      if (character === '^' && quote !== '"') {
        if (index === command.length - 1) {
          throw new Error('The cmd escape character "^" must escape another character.');
        }
        index += 2;
        continue;
      }
      if (character === '"') {
        quote = quote === '"' ? null : quote === null ? '"' : quote;
        index += 1;
        continue;
      }

      if (quote === null) {
        if (character === '&') {
          addSeparator(nextCharacter === '&' ? 2 : 1);
          continue;
        }
        if (character === '|') {
          if (nextCharacter === '|') {
            addSeparator(2);
            continue;
          }
          throw new Error('Pipelines are not supported in validated cmd command chains.');
        }
      }
      index += 1;
      continue;
    }

    if (quote === "'") {
      if (character === "'" && nextCharacter === "'") {
        index += 2;
      } else {
        if (character === "'") {
          quote = null;
        }
        index += 1;
      }
      continue;
    }
    if (character === '`') {
      if (index === command.length - 1) {
        throw new Error('The PowerShell escape character "`" must escape another character.');
      }
      index += 2;
      continue;
    }
    if (character === '"') {
      quote = quote === '"' ? null : '"';
      index += 1;
      continue;
    }
    if (character === "'") {
      quote = "'";
      index += 1;
      continue;
    }

    if (character === ';') {
      addSeparator(1);
      continue;
    }
    if (character === '&' || character === '|') {
      if ((nextCharacter === character) && (character === '&' || character === '|')) {
        if (shellKind !== 'pwsh') {
          throw new Error(`The operator "${character}${character}" is only supported with pwsh.exe.`);
        }
        addSeparator(2);
        continue;
      }
      throw new Error(`The PowerShell operator "${character}" is not supported in command chains.`);
    }

    index += 1;
  }

  if (quote !== null) {
    throw new Error('The Windows command chain contains an unclosed quoted string.');
  }
  if (separatorCount === 0) {
    throw new Error('The selected command-chain mode requires at least one supported command separator.');
  }
  if (!command.slice(segmentStart).trim()) {
    throw new Error('A Windows command chain cannot end with a separator.');
  }
}

interface CliExecutionPlan {
  command: string;
  args: string[];
  options: CliExecutorOptions;
  metadata: CliCommandMetadata;
}

function buildExecutionPlan(options: CliExecutorOptions): CliExecutionPlan {
  if (!options.commandChain) {
    const metadata = buildCommandMetadata(options);
    return {
      command: options.command,
      args: metadata.args,
      options: { ...options, args: metadata.args },
      metadata,
    };
  }

  const shell = options.commandChain.shell;
  validateWindowsCommandChain(options.command, shell);
  if ((options.args?.length ?? 0) > 0) {
    throw new Error('Pass a Windows command chain as command text without a separate argument list.');
  }

  const { kind: shellKind, executable } = resolveWindowsCommandShell(shell);
  const args = shellKind === 'cmd'
    ? ['/d', '/s', '/c', options.command]
    : ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', options.command];
  const windowsHide = options.windowsHide ?? true;
  const metadata: CliCommandMetadata = {
    command: executable,
    args,
    cwd: options.cwd,
    shell: executable,
    windowsHide,
    displayCommand: [executable, ...args].join(' '),
    metadata: options.metadata,
  };

  return {
    command: executable,
    args,
    options: { ...options, command: executable, args, shell: false },
    metadata,
  };
}

function toValidationResult(
  options: CliExecutorOptions,
  error: unknown,
  startedAt: number,
): CliExecutionResult {
  const candidate = error as { message?: string };
  const metadata = buildCommandMetadata(options);
  return {
    success: false,
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
    durationMs: Date.now() - startedAt,
    command: metadata,
    error: {
      kind: 'validation',
      message: candidate.message ?? 'The Windows command chain is invalid.',
    },
  };
}

function classifyError(error: unknown): CliFailureKind {
  const candidate = error as { timedOut?: boolean; isCanceled?: boolean; code?: string; exitCode?: number };
  if (candidate?.timedOut) {
    return 'timeout';
  }
  if (candidate?.isCanceled) {
    return 'cancelled';
  }
  if (typeof candidate?.exitCode === 'number') {
    return 'exit';
  }
  if (candidate?.code) {
    return 'spawn';
  }
  return 'unknown';
}

function buildExecaOptions(options: CliExecutorOptions, streaming: boolean): ExecaOptions {
  return {
    cwd: options.cwd,
    env: options.env,
    shell: options.shell ?? false,
    windowsHide: options.windowsHide ?? true,
    timeout: options.timeoutMs,
    cancelSignal: options.signal,
    input: options.input,
    reject: false,
    stdout: streaming ? ['pipe', 'pipe'] : 'pipe',
    stderr: streaming ? ['pipe', 'pipe'] : 'pipe',
    stdin: options.input ? 'pipe' : 'ignore',
  };
}

function toResult(
  rawResult: Awaited<ReturnType<typeof execa>>,
  metadata: CliCommandMetadata,
  startedAt: number,
): CliExecutionResult {
  const stdout = typeof rawResult.stdout === 'string' ? rawResult.stdout : '';
  const stderr = typeof rawResult.stderr === 'string' ? rawResult.stderr : '';
  const exitCode = typeof rawResult.exitCode === 'number' ? rawResult.exitCode : null;
  const signal = rawResult.signal ?? null;
  const success = rawResult.exitCode === 0 && !rawResult.failed && !rawResult.timedOut && !rawResult.isCanceled;

  return {
    success,
    exitCode,
    signal,
    stdout,
    stderr,
    durationMs: Date.now() - startedAt,
    command: metadata,
    error: success
      ? undefined
      : {
          kind: rawResult.timedOut ? 'timeout' : rawResult.isCanceled ? 'cancelled' : 'exit',
          message: rawResult.shortMessage || rawResult.message || `Command failed: ${metadata.displayCommand}`,
        },
  };
}

function toErrorResult(error: unknown, metadata: CliCommandMetadata, startedAt: number): CliExecutionResult {
  const candidate = error as {
    message?: string;
    shortMessage?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    signal?: string;
  };

  return {
    success: false,
    exitCode: typeof candidate.exitCode === 'number' ? candidate.exitCode : null,
    signal: candidate.signal ?? null,
    stdout: candidate.stdout ?? '',
    stderr: candidate.stderr ?? '',
    durationMs: Date.now() - startedAt,
    command: metadata,
    error: {
      kind: classifyError(error),
      message: candidate.shortMessage || candidate.message || `Command failed: ${metadata.displayCommand}`,
    },
  };
}

export async function executeCli(options: CliExecutorOptions): Promise<CliExecutionResult> {
  const startedAt = Date.now();
  let plan: CliExecutionPlan;
  try {
    plan = buildExecutionPlan(options);
  } catch (error) {
    return toValidationResult(options, error, startedAt);
  }

  try {
    const rawResult = await execa(plan.command, plan.args, buildExecaOptions(plan.options, false));
    return toResult(rawResult, plan.metadata, startedAt);
  } catch (error) {
    return toErrorResult(error, plan.metadata, startedAt);
  }
}

export async function executeCliStreaming(options: CliExecutorOptions): Promise<CliExecutionResult> {
  const startedAt = Date.now();
  let plan: CliExecutionPlan;
  try {
    plan = buildExecutionPlan(options);
  } catch (error) {
    return toValidationResult(options, error, startedAt);
  }

  try {
    const subprocess = execa(plan.command, plan.args, buildExecaOptions(plan.options, true));
    subprocess.stdout?.on('data', (chunk) => options.onOutput?.('stdout', normalizeChunk(chunk)));
    subprocess.stderr?.on('data', (chunk) => options.onOutput?.('stderr', normalizeChunk(chunk)));
    const rawResult = await subprocess;
    return toResult(rawResult, plan.metadata, startedAt);
  } catch (error) {
    return toErrorResult(error, plan.metadata, startedAt);
  }
}
