import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import which from 'which';

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
  env?: NodeJS.ProcessEnv;
}

const execFileAsync = promisify(execFile);

async function runShellCommand(command: string, args: string[]): Promise<ManagedCliCommandResult> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    return { exitCode: 0, stdout: String(stdout) };
  } catch (error) {
    const commandError = error as NodeJS.ErrnoException & { stdout?: string | Buffer };
    const exitCode = typeof commandError.code === 'number' ? commandError.code : 1;
    return { exitCode, stdout: String(commandError.stdout ?? '') };
  }
}

async function resolveViaNpmGlobalBin(
  binName: string,
  platform: NodeJS.Platform,
  runCommand: ManagedCliCommandRunner,
): Promise<string | null> {
  const result = await runCommand('npm', ['prefix', '-g']);
  if (result.exitCode !== 0) {
    return null;
  }

  const prefix = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!prefix) {
    return null;
  }

  const binDirectory = platform === 'win32' ? prefix : path.join(prefix, 'bin');
  const names = platform === 'win32'
    ? [`${binName}.cmd`, `${binName}.ps1`, binName]
    : [binName];
  for (const name of names) {
    const candidate = path.join(binDirectory, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function resolveViaPath(binName: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  return which(binName, {
    path: env.PATH ?? env.Path,
    pathExt: env.PATHEXT,
    nothrow: true,
  });
}

/** Prefer an existing managed executable, then npm's global bin (including Windows shims), then PATH. */
export async function resolveManagedCliExecutablePath({
  binName,
  platform,
  staticExecutablePath,
  runCommand = runShellCommand,
  env = process.env,
}: ResolveManagedCliExecutablePathOptions): Promise<string> {
  if (staticExecutablePath && existsSync(staticExecutablePath)) {
    return staticExecutablePath;
  }

  return (await resolveViaNpmGlobalBin(binName, platform, runCommand))
    ?? (await resolveViaPath(binName, env))
    ?? staticExecutablePath;
}
