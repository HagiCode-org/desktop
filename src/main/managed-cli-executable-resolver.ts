import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export interface ManagedCliCommandResult {
  exitCode: number;
  stdout: string;
}

export type ManagedCliCommandRunner = (
  command: string,
  args: string[],
) => Promise<ManagedCliCommandResult>;

export interface ResolveManagedCliExecutablePathOptions {
  binName: string;
  platform: NodeJS.Platform;
  staticExecutablePath: string;
  runCommand?: ManagedCliCommandRunner;
}

const execFileAsync = promisify(execFile);

async function runShellCommand(command: string, args: string[]): Promise<ManagedCliCommandResult> {
  try {
    const { stdout } = await execFileAsync(command, args, { encoding: 'utf8' });
    return { exitCode: 0, stdout: String(stdout) };
  } catch (error) {
    const commandError = error as NodeJS.ErrnoException & { stdout?: string | Buffer };
    const exitCode = typeof commandError.code === 'number' ? commandError.code : 1;
    return { exitCode, stdout: String(commandError.stdout ?? '') };
  }
}

export async function resolveManagedCliExecutablePath({
  binName,
  platform,
  staticExecutablePath,
  runCommand = runShellCommand,
}: ResolveManagedCliExecutablePathOptions): Promise<string> {
  if (platform === 'win32') {
    return staticExecutablePath;
  }

  const result = await runCommand('sh', ['-c', `which ${binName}`]);
  const resolvedPath = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return resolvedPath ?? staticExecutablePath;
}
