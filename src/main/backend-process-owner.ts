import {
  execFile as execFileCallback,
  spawn as spawnChild,
  type ChildProcess,
  type SpawnOptions,
} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export interface BackendProcessIdentity {
  pid: number;
  executablePath: string;
  creationIdentity: string;
  commandLine: string;
  runtimeIdentity: string;
  runtimeRoot: string;
  serviceDllPath: string;
  port: number;
  writtenAt: string;
}

export interface BackendProcessLaunch {
  executablePath: string;
  args: string[];
  workingDirectory: string;
  env: NodeJS.ProcessEnv;
  runtimeIdentity: string;
  runtimeRoot: string;
  serviceDllPath: string;
  port: number;
}

export interface BackendProcessSnapshot {
  pid: number;
  startTime: number;
  identity: BackendProcessIdentity;
  isAlive(): boolean;
  waitForExit(timeoutMs: number): Promise<boolean>;
}

export interface BackendProcessOwnerDependencies {
  spawn?: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
  inspectProcess?: (pid: number, platform: NodeJS.Platform) => Promise<InspectedProcess | null>;
  signalProcessTree?: (pid: number, signal: 'SIGTERM' | 'SIGKILL', platform: NodeJS.Platform) => Promise<void>;
  platform?: NodeJS.Platform;
  onOutput?: (stream: 'stdout' | 'stderr', text: string) => void;
  onError?: (message: string, error?: unknown) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

interface InspectedProcess {
  executablePath: string;
  creationIdentity: string;
  commandLine: string;
}

interface OwnedChild {
  child: ChildProcess;
  identity: BackendProcessIdentity;
  startTime: number;
  exitPromise: Promise<void>;
  exited: boolean;
}

export class BackendProcessOwner {
  private readonly stateFilePath: string;
  private readonly spawnProcess: NonNullable<BackendProcessOwnerDependencies['spawn']>;
  private readonly inspectProcess: NonNullable<BackendProcessOwnerDependencies['inspectProcess']>;
  private readonly signalProcessTree: NonNullable<BackendProcessOwnerDependencies['signalProcessTree']>;
  private readonly platform: NodeJS.Platform;
  private readonly onOutput: NonNullable<BackendProcessOwnerDependencies['onOutput']>;
  private readonly onError: NonNullable<BackendProcessOwnerDependencies['onError']>;
  private readonly onExit: NonNullable<BackendProcessOwnerDependencies['onExit']>;
  private active: OwnedChild | null = null;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(stateFilePath: string, dependencies: BackendProcessOwnerDependencies = {}) {
    this.stateFilePath = stateFilePath;
    this.spawnProcess = dependencies.spawn ?? spawnChild;
    this.inspectProcess = dependencies.inspectProcess ?? inspectProcess;
    this.signalProcessTree = dependencies.signalProcessTree ?? signalProcessTree;
    this.platform = dependencies.platform ?? process.platform;
    this.onOutput = dependencies.onOutput ?? (() => undefined);
    this.onError = dependencies.onError ?? (() => undefined);
    this.onExit = dependencies.onExit ?? (() => undefined);
  }

  async start(launch: BackendProcessLaunch): Promise<BackendProcessSnapshot> {
    return await this.runExclusive(async () => {
      if (this.active && !this.active.exited) {
        if (this.active.identity.runtimeIdentity === launch.runtimeIdentity
          && samePath(this.active.identity.serviceDllPath, launch.serviceDllPath, this.platform)) {
          return this.createSnapshot(this.active);
        }
        throw new Error('A different Desktop-owned backend is already running; stop it before launching another runtime.');
      }

      await this.reconcileOrphanInternal();
      const child = this.spawnProcess(launch.executablePath, launch.args, {
        cwd: launch.workingDirectory,
        env: launch.env,
        shell: false,
        detached: this.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let resolveExit!: () => void;
      const exitPromise = new Promise<void>((resolve) => {
        resolveExit = resolve;
      });
      const owned: OwnedChild = {
        child,
        identity: {
          pid: 0,
          executablePath: path.resolve(launch.executablePath),
          creationIdentity: '',
          commandLine: '',
          runtimeIdentity: launch.runtimeIdentity,
          runtimeRoot: path.resolve(launch.runtimeRoot),
          serviceDllPath: path.resolve(launch.serviceDllPath),
          port: launch.port,
          writtenAt: new Date().toISOString(),
        },
        startTime: Date.now(),
        exitPromise,
        exited: false,
      };
      this.active = owned;

      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (text: string) => this.onOutput('stdout', text));
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (text: string) => this.onOutput('stderr', text));
      child.once('exit', (code, signal) => {
        owned.exited = true;
        resolveExit();
        this.onExit(code, signal);
      });

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        child.once('spawn', () => {
          settled = true;
          resolve();
        });
        child.once('error', (error) => {
          this.onError(`Backend process failed to launch: ${error.message}`, error);
          if (!settled) {
            settled = true;
            reject(error);
          }
        });
      }).catch(async (error: unknown) => {
        if (this.active === owned) {
          this.active = null;
        }
        throw error;
      });

      const pid = child.pid;
      if (!pid || owned.exited) {
        throw new Error('Backend process exited before Desktop could establish ownership.');
      }

      try {
        const inspected = await this.inspectProcess(pid, this.platform);
        if (!inspected || !matchesLaunch(inspected, launch, this.platform)) {
          throw new Error('Desktop could not verify the launched backend process identity.');
        }

        owned.identity = {
          ...owned.identity,
          pid,
          executablePath: path.resolve(inspected.executablePath),
          creationIdentity: inspected.creationIdentity,
          commandLine: inspected.commandLine,
          writtenAt: new Date().toISOString(),
        };
        if (owned.exited) {
          throw new Error('Backend process exited before ownership could be persisted.');
        }

        await this.writeIdentity(owned.identity);
        if (owned.exited) {
          await this.clearIdentityIfOwned(owned.identity);
          throw new Error('Backend process exited while Desktop persisted its ownership identity.');
        }
        return this.createSnapshot(owned);
      } catch (error) {
        await this.terminateKnownChild(owned);
        if (this.active === owned) {
          this.active = null;
        }
        throw error;
      }
    });
  }

  async reconcileOrphan(): Promise<void> {
    await this.runExclusive(async () => {
      await this.reconcileOrphanInternal();
    });
  }

  async stop(timeoutMs: number): Promise<boolean> {
    return await this.runExclusive(async () => {
      if (!this.active || this.active.exited) {
        if (this.active) {
          await this.clearIdentityIfOwned(this.active.identity);
          this.active = null;
        }
        return true;
      }

      const owned = this.active;
      const beforeSignal = await this.inspectProcess(owned.identity.pid, this.platform);
      if (!beforeSignal) {
        owned.exited = true;
        await this.clearIdentityIfOwned(owned.identity);
        if (this.active === owned) {
          this.active = null;
        }
        return true;
      }
      if (!matchesIdentity(beforeSignal, owned.identity, this.platform)) {
        throw new Error('Refusing to stop the backend because its process identity no longer matches Desktop ownership.');
      }

      await this.signalProcessTree(owned.identity.pid, 'SIGTERM', this.platform);
      if (await this.waitForOwnedExit(owned, timeoutMs)) {
        await this.clearIdentityIfOwned(owned.identity);
        if (this.active === owned) {
          this.active = null;
        }
        return true;
      }

      const beforeForce = await this.inspectProcess(owned.identity.pid, this.platform);
      if (!beforeForce) {
        await this.clearIdentityIfOwned(owned.identity);
        if (this.active === owned) {
          this.active = null;
        }
        return true;
      }
      if (!matchesIdentity(beforeForce, owned.identity, this.platform)) {
        throw new Error('Backend identity changed while waiting for graceful shutdown; refusing forced termination.');
      }
      await this.signalProcessTree(owned.identity.pid, 'SIGKILL', this.platform);
      const stopped = await this.waitForOwnedExit(owned, Math.min(timeoutMs, 2_000));
      if (!stopped) {
        throw new Error(`Backend process ${owned.identity.pid} did not exit after forced termination.`);
      }

      await this.clearIdentityIfOwned(owned.identity);
      if (this.active === owned) {
        this.active = null;
      }
      return true;
    });
  }

  get snapshot(): BackendProcessSnapshot | null {
    return this.active && !this.active.exited ? this.createSnapshot(this.active) : null;
  }

  private async reconcileOrphanInternal(): Promise<void> {
    let record: BackendProcessIdentity | null;
    try {
      record = await this.readIdentity();
    } catch (error) {
      this.onError('Unable to read Desktop backend process identity; startup is blocked until ownership can be reconciled.', error);
      throw error;
    }

    if (!record) {
      return;
    }

    const inspected = await this.inspectProcess(record.pid, this.platform);
    if (!inspected) {
      await this.clearIdentityIfOwned(record);
      return;
    }
    if (!matchesIdentity(inspected, record, this.platform)) {
      this.onError(`Stored backend PID ${record.pid} no longer matches its saved executable or creation identity; it was not signaled.`);
      await this.clearIdentityIfOwned(record);
      return;
    }

    const beforeSignal = await this.inspectProcess(record.pid, this.platform);
    if (!beforeSignal || !matchesIdentity(beforeSignal, record, this.platform)) {
      if (!beforeSignal) {
        await this.clearIdentityIfOwned(record);
        return;
      }
      throw new Error(`Backend PID ${record.pid} changed identity during orphan reconciliation; refusing to signal it.`);
    }

    await this.signalProcessTree(record.pid, 'SIGTERM', this.platform);
    if (await this.waitForIdentityExit(record, 10_000)) {
      await this.clearIdentityIfOwned(record);
      return;
    }

    const beforeForce = await this.inspectProcess(record.pid, this.platform);
    if (!beforeForce) {
      await this.clearIdentityIfOwned(record);
      return;
    }
    if (!matchesIdentity(beforeForce, record, this.platform)) {
      throw new Error(`Backend PID ${record.pid} changed identity before forced cleanup; refusing to signal it.`);
    }
    await this.signalProcessTree(record.pid, 'SIGKILL', this.platform);
    if (!await this.waitForIdentityExit(record, 2_000)) {
      throw new Error(`Verified orphaned backend PID ${record.pid} did not exit after forced termination.`);
    }
    await this.clearIdentityIfOwned(record);
  }

  private async waitForOwnedExit(owned: OwnedChild, timeoutMs: number): Promise<boolean> {
    if (owned.exited) {
      return true;
    }
    let timer: NodeJS.Timeout | undefined;
    return await Promise.race([
      owned.exitPromise.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]).finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
    });
  }

  private async waitForIdentityExit(identity: BackendProcessIdentity, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const inspected = await this.inspectProcess(identity.pid, this.platform);
      if (!inspected || !matchesIdentity(inspected, identity, this.platform)) {
        return true;
      }
      await delay(100);
    }
    const inspected = await this.inspectProcess(identity.pid, this.platform);
    return !inspected || !matchesIdentity(inspected, identity, this.platform);
  }

  private async terminateKnownChild(owned: OwnedChild): Promise<void> {
    if (owned.exited || !owned.child.pid) {
      return;
    }
    await this.signalProcessTree(owned.child.pid, 'SIGKILL', this.platform);
    await this.waitForOwnedExit(owned, 2_000);
  }

  private createSnapshot(owned: OwnedChild): BackendProcessSnapshot {
    return {
      pid: owned.identity.pid,
      startTime: owned.startTime,
      identity: { ...owned.identity },
      isAlive: () => !owned.exited,
      waitForExit: async (timeoutMs) => await this.waitForOwnedExit(owned, timeoutMs),
    };
  }

  private async readIdentity(): Promise<BackendProcessIdentity | null> {
    let contents: string;
    try {
      contents = await fs.readFile(this.stateFilePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }

    let value: unknown;
    try {
      value = JSON.parse(contents);
    } catch {
      await this.removeIdentityFile();
      this.onError('Discarded malformed Desktop backend process identity metadata.');
      return null;
    }

    if (!isBackendProcessIdentity(value)) {
      await this.removeIdentityFile();
      this.onError('Discarded incomplete Desktop backend process identity metadata.');
      return null;
    }
    return value;
  }

  private async writeIdentity(identity: BackendProcessIdentity): Promise<void> {
    await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });
    const temporaryPath = `${this.stateFilePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, this.stateFilePath);
  }

  private async clearIdentityIfOwned(identity: BackendProcessIdentity): Promise<void> {
    const current = await this.readIdentity();
    if (current && current.pid === identity.pid
      && current.creationIdentity === identity.creationIdentity
      && samePath(current.executablePath, identity.executablePath, this.platform)) {
      await this.removeIdentityFile();
    }
  }

  private async removeIdentityFile(): Promise<void> {
    try {
      await fs.unlink(this.stateFilePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return await result;
  }
}

function isBackendProcessIdentity(value: unknown): value is BackendProcessIdentity {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<BackendProcessIdentity>;
  return Number.isInteger(record.pid) && (record.pid ?? 0) > 0
    && typeof record.executablePath === 'string'
    && typeof record.creationIdentity === 'string'
    && typeof record.commandLine === 'string'
    && typeof record.runtimeIdentity === 'string'
    && typeof record.runtimeRoot === 'string'
    && typeof record.serviceDllPath === 'string'
    && Number.isInteger(record.port)
    && typeof record.writtenAt === 'string';
}

function matchesLaunch(
  inspected: InspectedProcess,
  launch: BackendProcessLaunch,
  platform: NodeJS.Platform,
): boolean {
  return samePath(inspected.executablePath, launch.executablePath, platform)
    && includesPath(inspected.commandLine, launch.serviceDllPath, platform);
}

function matchesIdentity(
  inspected: InspectedProcess,
  expected: BackendProcessIdentity,
  platform: NodeJS.Platform,
): boolean {
  return samePath(inspected.executablePath, expected.executablePath, platform)
    && inspected.creationIdentity === expected.creationIdentity
    && includesPath(inspected.commandLine, expected.serviceDllPath, platform);
}

function samePath(left: string, right: string, platform: NodeJS.Platform): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function includesPath(commandLine: string, targetPath: string, platform: NodeJS.Platform): boolean {
  const haystack = platform === 'win32' ? commandLine.toLowerCase() : commandLine;
  const needle = platform === 'win32' ? path.resolve(targetPath).toLowerCase() : path.resolve(targetPath);
  return haystack.includes(needle);
}

async function inspectProcess(pid: number, platform: NodeJS.Platform): Promise<InspectedProcess | null> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  if (platform === 'linux') {
    return await inspectLinuxProcess(pid);
  }
  if (platform === 'darwin') {
    return await inspectMacProcess(pid);
  }
  if (platform === 'win32') {
    return await inspectWindowsProcess(pid);
  }
  throw new Error(`Backend process inspection is unsupported on ${platform}.`);
}

async function inspectLinuxProcess(pid: number): Promise<InspectedProcess | null> {
  const processRoot = `/proc/${pid}`;
  await fs.access('/proc');
  try {
    const [stat, executablePath, rawCommandLine] = await Promise.all([
      fs.readFile(path.join(processRoot, 'stat'), 'utf8'),
      fs.readlink(path.join(processRoot, 'exe')),
      fs.readFile(path.join(processRoot, 'cmdline')),
    ]);
    const closingParen = stat.lastIndexOf(')');
    const fields = closingParen >= 0 ? stat.slice(closingParen + 2).trim().split(/\s+/) : [];
    const creationIdentity = fields[19];
    if (!creationIdentity) {
      throw new Error(`Unable to read process creation identity for PID ${pid}.`);
    }
    return {
      executablePath,
      creationIdentity,
      commandLine: rawCommandLine.toString('utf8').replace(/\0/g, ' ').trim(),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ESRCH') {
      return null;
    }
    throw error;
  }
}

async function inspectMacProcess(pid: number): Promise<InspectedProcess | null> {
  try {
    const [creation, command, executable] = await Promise.all([
      execFile('ps', ['-p', String(pid), '-o', 'lstart='], { timeout: 5_000 }),
      execFile('ps', ['-p', String(pid), '-o', 'command='], { timeout: 5_000 }),
      execFile('lsof', ['-a', '-p', String(pid), '-d', 'txt', '-Fn'], { timeout: 5_000 }),
    ]);
    const executablePath = executable.stdout
      .split(/\r?\n/)
      .find((line) => line.startsWith('n/'))
      ?.slice(1);
    if (!creation.stdout.trim() || !command.stdout.trim()) {
      return null;
    }
    if (!executablePath) {
      throw new Error(`Unable to verify the executable path for live macOS process ${pid}.`);
    }
    return {
      executablePath,
      creationIdentity: creation.stdout.trim(),
      commandLine: command.stdout.trim(),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return null;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/no such process/i.test(message)) {
      return null;
    }
    throw error;
  }
}

async function inspectWindowsProcess(pid: number): Promise<InspectedProcess | null> {
  const command = [
    `$item = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'`,
    'if ($null -ne $item) {',
    '$item | Select-Object ProcessId, CreationDate, ExecutablePath, CommandLine | ConvertTo-Json -Compress',
    '}',
  ].join('; ');
  const result = await execFile('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    command,
  ], { timeout: 5_000 });
  if (!result.stdout.trim()) {
    return null;
  }
  const parsed = JSON.parse(result.stdout) as {
    CreationDate?: string;
    ExecutablePath?: string;
    CommandLine?: string;
  };
  if (!parsed.ExecutablePath || !parsed.CreationDate || !parsed.CommandLine) {
    throw new Error(`Unable to verify the executable and creation identity for live Windows process ${pid}.`);
  }
  return {
    executablePath: parsed.ExecutablePath,
    creationIdentity: parsed.CreationDate,
    commandLine: parsed.CommandLine,
  };
}

async function signalProcessTree(
  pid: number,
  signal: 'SIGTERM' | 'SIGKILL',
  platform: NodeJS.Platform,
): Promise<void> {
  if (platform === 'win32') {
    const args = ['/PID', String(pid), '/T', ...(signal === 'SIGKILL' ? ['/F'] : [])];
    try {
      await execFile('taskkill.exe', args, { timeout: 5_000 });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const message = error instanceof Error ? error.message : String(error);
      if (code !== 'ESRCH' && !/not found|no instance|not running/i.test(message)) {
        throw error;
      }
    }
    return;
  }

  try {
    process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error;
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
