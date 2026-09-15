import path from 'node:path';

export interface CommandLaunchPlan {
  command: string;
  shell: boolean;
}

function stripWrappingQuotes(command: string): string {
  return command.replace(/^"(.*)"$/, '$1');
}

function quoteShellCommandIfNeeded(
  command: string,
  shell: boolean,
  platform: NodeJS.Platform,
): string {
  if (platform !== 'win32' || !shell || !/\s/.test(command)) {
    return command;
  }

  return `"${command}"`;
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
  const shell = shouldUseShellForCommand(normalizedCommand, platform);

  return {
    command: quoteShellCommandIfNeeded(normalizedCommand, shell, platform),
    shell,
  };
}
