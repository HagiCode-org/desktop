import { execa, type Options as ExecaOptions } from 'execa';

export type CliOutputType = 'stdout' | 'stderr';
export type CliFailureKind = 'exit' | 'spawn' | 'timeout' | 'cancelled' | 'unknown';

export interface CliExecutorOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  shell?: boolean | string;
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

function normalizeChunk(chunk: unknown): string {
  return Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
}

function buildCommandMetadata(options: CliExecutorOptions): CliCommandMetadata {
  const args = options.args ?? [];
  const shell = options.shell ?? false;
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
  const metadata = buildCommandMetadata(options);

  try {
    const rawResult = await execa(options.command, options.args ?? [], buildExecaOptions(options, false));
    return toResult(rawResult, metadata, startedAt);
  } catch (error) {
    return toErrorResult(error, metadata, startedAt);
  }
}

export async function executeCliStreaming(options: CliExecutorOptions): Promise<CliExecutionResult> {
  const startedAt = Date.now();
  const metadata = buildCommandMetadata(options);

  try {
    const subprocess = execa(options.command, options.args ?? [], buildExecaOptions(options, true));
    subprocess.stdout?.on('data', (chunk) => options.onOutput?.('stdout', normalizeChunk(chunk)));
    subprocess.stderr?.on('data', (chunk) => options.onOutput?.('stderr', normalizeChunk(chunk)));
    const rawResult = await subprocess;
    return toResult(rawResult, metadata, startedAt);
  } catch (error) {
    return toErrorResult(error, metadata, startedAt);
  }
}

