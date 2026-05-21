import fsSync from 'node:fs';
import path from 'node:path';
import type { PathManager } from './path-manager.js';
import type { BundledNodeRuntimePolicyDecision } from './bundled-node-runtime-policy.js';

export interface ToolchainLaunchPlan {
  command: string;
  args: string[];
  shell: boolean;
  usedBundledToolchain: boolean;
  fellBackToSystemPath: boolean;
  bundledCandidatePath: string;
  resolutionSource: 'bundled-desktop' | 'system';
  activationPolicy?: BundledNodeRuntimePolicyDecision;
}

export interface ResolveToolchainLaunchOptions {
  commandName: 'node' | 'npm';
  args?: string[];
  platform?: NodeJS.Platform;
  existsSync?: (path: string) => boolean;
  activationPolicy?: BundledNodeRuntimePolicyDecision;
  pathManager: Pick<PathManager, 'getPortableNodeExecutablePath' | 'getPortableNpmExecutablePath'>;
}

export interface CommandLaunchPlan {
  command: string;
  shell: boolean;
}

function stripWrappingQuotes(command: string): string {
  return command.replace(/^"(.*)"$/, '$1');
}

export function shouldUseShellForCommand(
  command: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== 'win32') {
    return false;
  }

  const normalizedCommand = stripWrappingQuotes(command).toLowerCase();
  // MSIX/AppX launches can reject direct CreateProcess calls for Windows batch
  // wrappers with EACCES/"Access is denied", so always route .cmd/.bat through
  // the shell on Windows.
  return normalizedCommand.endsWith('.cmd') || normalizedCommand.endsWith('.bat');
}

export function detectToolchainCommandName(command: string): 'node' | 'npm' | null {
  const normalizedCommand = stripWrappingQuotes(command);
  const baseName = path.basename(normalizedCommand).toLowerCase();
  if (baseName === 'node' || baseName === 'node.exe') {
    return 'node';
  }
  if (baseName === 'npm' || baseName === 'npm.cmd') {
    return 'npm';
  }
  return null;
}

export function resolveCommandLaunch(
  command: string,
  platform: NodeJS.Platform = process.platform,
): CommandLaunchPlan {
  const normalizedCommand = stripWrappingQuotes(command);

  return {
    command: normalizedCommand,
    shell: shouldUseShellForCommand(normalizedCommand, platform),
  };
}

export function resolveToolchainLaunchPlan(options: ResolveToolchainLaunchOptions): ToolchainLaunchPlan {
  const platform = options.platform ?? process.platform;
  const bundledCandidatePath = options.commandName === 'node'
    ? options.pathManager.getPortableNodeExecutablePath()
    : options.pathManager.getPortableNpmExecutablePath();
  const existsSync = options.existsSync ?? fsSync.existsSync;
  const enabled = options.activationPolicy?.enabled ?? true;
  const command = enabled && existsSync(bundledCandidatePath) ? bundledCandidatePath : options.commandName;

  return {
    command,
    args: [...(options.args ?? [])],
    shell: shouldUseShellForCommand(command, platform),
    usedBundledToolchain: command === bundledCandidatePath,
    fellBackToSystemPath: command !== bundledCandidatePath,
    bundledCandidatePath,
    resolutionSource: command === bundledCandidatePath ? 'bundled-desktop' : 'system',
    activationPolicy: options.activationPolicy,
  };
}
