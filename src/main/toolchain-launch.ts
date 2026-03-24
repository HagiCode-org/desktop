import fsSync from 'node:fs';
import path from 'node:path';
import type { PathManager } from './path-manager.js';

export interface ToolchainLaunchPlan {
  command: string;
  args: string[];
  shell: boolean;
  usedBundledToolchain: boolean;
  fellBackToSystemPath: boolean;
  bundledCandidatePath: string;
}

export interface ResolveToolchainLaunchOptions {
  commandName: 'node' | 'npm';
  args?: string[];
  platform?: NodeJS.Platform;
  existsSync?: (path: string) => boolean;
  pathManager: Pick<PathManager, 'getPortableNodeExecutablePath' | 'getPortableNpmExecutablePath'>;
}

export function shouldUseShellForCommand(
  command: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const normalizedCommand = command.replace(/^"(.*)"$/, '$1');
  return platform === 'win32' && /\.(cmd|bat)$/i.test(normalizedCommand);
}

export function detectToolchainCommandName(command: string): 'node' | 'npm' | null {
  const normalizedCommand = command.replace(/^"(.*)"$/, '$1');
  const baseName = path.basename(normalizedCommand).toLowerCase();
  if (baseName === 'node' || baseName === 'node.exe') {
    return 'node';
  }
  if (baseName === 'npm' || baseName === 'npm.cmd') {
    return 'npm';
  }
  return null;
}

export function resolveToolchainLaunchPlan(options: ResolveToolchainLaunchOptions): ToolchainLaunchPlan {
  const platform = options.platform ?? process.platform;
  const bundledCandidatePath = options.commandName === 'node'
    ? options.pathManager.getPortableNodeExecutablePath()
    : options.pathManager.getPortableNpmExecutablePath();
  const existsSync = options.existsSync ?? fsSync.existsSync;
  const command = existsSync(bundledCandidatePath) ? bundledCandidatePath : options.commandName;

  return {
    command,
    args: [...(options.args ?? [])],
    shell: shouldUseShellForCommand(command, platform),
    usedBundledToolchain: command === bundledCandidatePath,
    fellBackToSystemPath: command !== bundledCandidatePath,
    bundledCandidatePath,
  };
}
