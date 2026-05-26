import fs from 'node:fs/promises';
import log from 'electron-log';
import { path7za } from '7zip-bin';
import { executeCliStreaming } from './utils/cli-executor.js';

export interface Extract7zArchiveOptions {
  runtimeId?: string;
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

function splitLogLines(value: string, maxLines = 40): string[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= maxLines) {
    return lines;
  }
  return [
    ...lines.slice(0, maxLines),
    `... truncated ${lines.length - maxLines} additional lines`,
  ];
}

export async function extract7zArchive(
  options: Extract7zArchiveOptions,
): Promise<void> {
  await fs.mkdir(options.destinationDir, { recursive: true });

  const executablePath = resolveDesktopOwned7zExecutablePath();
  log.info('[VendoredRuntime7z] starting extraction', {
    runtimeId: options.runtimeId ?? 'unknown',
    archivePath: options.archivePath,
    destinationDir: options.destinationDir,
    executablePath,
  });

  const result = await executeCliStreaming({
    command: executablePath,
    args: ['x', options.archivePath, `-o${options.destinationDir}`, '-y', '-bb1'],
    shell: false,
    windowsHide: true,
    metadata: {
      component: 'VendoredRuntime7z',
      runtimeId: options.runtimeId ?? 'unknown',
      archivePath: options.archivePath,
      destinationDir: options.destinationDir,
    },
    onOutput: (type, chunk) => {
      const lines = chunk
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const message of lines) {
        const percentage = type === 'stdout' ? extractPercent(message) : undefined;
        log.info('[VendoredRuntime7z] output', {
          runtimeId: options.runtimeId ?? 'unknown',
          stream: type,
          percentage,
          message,
        });
        options.onProgress?.(percentage, message);
      }
    },
  });

  if (!result.success) {
    const details = (result.stderr || result.stdout || result.error?.message || '7z extraction failed.').trim();
    log.warn('[VendoredRuntime7z] extraction failed', {
      runtimeId: options.runtimeId ?? 'unknown',
      archivePath: options.archivePath,
      destinationDir: options.destinationDir,
      exitCode: result.exitCode,
      signal: result.signal,
      durationMs: result.durationMs,
      stdout: splitLogLines(result.stdout),
      stderr: splitLogLines(result.stderr),
      error: result.error?.message,
    });
    throw new Error(details);
  }

  log.info('[VendoredRuntime7z] extraction completed', {
    runtimeId: options.runtimeId ?? 'unknown',
    archivePath: options.archivePath,
    destinationDir: options.destinationDir,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
  });
}
