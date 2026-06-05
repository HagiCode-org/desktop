import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DistributionChannel, DistributionMetadata, DistributionMetadataMode } from '../../types/distribution-mode.js';

export const DISTRIBUTION_METADATA_FILE = 'distribution-metadata.json';

export interface LoadDistributionMetadataOptions {
  cwd?: string;
  moduleDirectory?: string;
  resourcesPath?: string | null;
  readFile?: typeof fs.readFile;
}

export interface DistributionMetadataLoadResult {
  metadata: DistributionMetadata | null;
  sourcePath: string | null;
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeMode(value: unknown): DistributionMetadataMode {
  return value === 'fusion' ? 'fusion' : 'normal';
}

function normalizeChannel(value: unknown): DistributionChannel {
  return value === 'steam' || value === 'win-store' ? value : 'none';
}

export function normalizeDistributionMetadata(value: unknown): DistributionMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const schemaVersion = typeof value.schemaVersion === 'number' && Number.isInteger(value.schemaVersion)
    ? value.schemaVersion
    : 1;
  const channel = normalizeChannel(value.channel);
  const mode = channel !== 'none' ? 'fusion' : normalizeMode(value.mode);
  const extensions = isRecord(value.extensions) ? value.extensions : {};

  return {
    schemaVersion,
    mode,
    channel,
    extensions,
  };
}

export function resolveDistributionMetadataCandidates(
  options: LoadDistributionMetadataOptions = {},
): string[] {
  const moduleDirectory = options.moduleDirectory ?? path.dirname(fileURLToPath(import.meta.url));
  const cwd = options.cwd ?? process.cwd();
  const candidates = new Set<string>();

  if (options.resourcesPath && options.resourcesPath.trim().length > 0) {
    candidates.add(path.resolve(options.resourcesPath, DISTRIBUTION_METADATA_FILE));
  }

  candidates.add(path.resolve(cwd, 'resources', DISTRIBUTION_METADATA_FILE));
  candidates.add(path.resolve(moduleDirectory, '../../../resources', DISTRIBUTION_METADATA_FILE));

  return [...candidates];
}

export async function loadDistributionMetadata(
  options: LoadDistributionMetadataOptions = {},
): Promise<DistributionMetadataLoadResult> {
  const readFile = options.readFile ?? fs.readFile;

  for (const candidate of resolveDistributionMetadataCandidates(options)) {
    try {
      const content = await readFile(candidate, 'utf8');
      const parsed = JSON.parse(content) as unknown;
      const metadata = normalizeDistributionMetadata(parsed);
      if (!metadata) {
        return {
          metadata: null,
          sourcePath: candidate,
          error: `Distribution metadata ${candidate} must be a JSON object.`,
        };
      }

      return {
        metadata,
        sourcePath: candidate,
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        continue;
      }

      return {
        metadata: null,
        sourcePath: candidate,
        error: `Failed to read distribution metadata from ${candidate}: ${message}`,
      };
    }
  }

  return {
    metadata: null,
    sourcePath: null,
    error: null,
  };
}
