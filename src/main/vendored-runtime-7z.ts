import fs from 'node:fs/promises';
import { path7za } from '7zip-bin';
import { executeCliStreaming } from './utils/cli-executor.js';

export interface Extract7zArchiveOptions {
  archivePath: string;
  destinationDir: string;
  onProgress?: (percentage: number | undefined, message: string) => void;
}

export function resolveDesktopOwned7zExecutablePath(): string {
  return path7za;
}

function extractPercent(message: string): number | undefined {
  const match = message.match(/(?:^|\s)(\d{1,3})%(?:\s|$)/);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined;
}

export async function extract7zArchive(
  options: Extract7zArchiveOptions,
): Promise<void> {
  await fs.mkdir(options.destinationDir, { recursive: true });

  const result = await executeCliStreaming({
    command: resolveDesktopOwned7zExecutablePath(),
    args: ['x', options.archivePath, `-o${options.destinationDir}`, '-y', '-bb0'],
    shell: false,
    windowsHide: true,
    metadata: {
      component: 'VendoredRuntime7z',
      archivePath: options.archivePath,
      destinationDir: options.destinationDir,
    },
    onOutput: (type, chunk) => {
      const message = chunk.trim();
      if (!message) {
        return;
      }
      const percentage = type === 'stdout' ? extractPercent(message) : undefined;
      options.onProgress?.(percentage, message);
    },
  });

  if (!result.success) {
    const details = (result.stderr || result.stdout || result.error?.message || '7z extraction failed.').trim();
    throw new Error(details);
  }
}
