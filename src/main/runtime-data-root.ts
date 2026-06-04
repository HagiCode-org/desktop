import { homedir } from 'node:os';
import path from 'node:path';
import {
  DEFAULT_RUNTIME_DATA_PATH_PRESET,
  normalizeRuntimeDataPathPreset,
} from './config.js';
import type { RuntimeDataPathPreset } from '../types/runtime-data-path.js';

function resolvePortableAbsolutePath(value: string): string | undefined {
  if (path.posix.isAbsolute(value)) {
    return path.posix.normalize(value);
  }

  if (path.win32.isAbsolute(value)) {
    return path.win32.normalize(value);
  }

  return undefined;
}

function resolvePortablePath(value: string): string {
  const trimmed = value.trim();
  const absolutePath = resolvePortableAbsolutePath(trimmed);
  return absolutePath ?? path.resolve(trimmed);
}

function joinPortablePath(rootPath: string, ...segments: string[]): string {
  if (path.posix.isAbsolute(rootPath)) {
    return path.posix.join(rootPath, ...segments);
  }

  if (path.win32.isAbsolute(rootPath)) {
    return path.win32.join(rootPath, ...segments);
  }

  return path.resolve(rootPath, ...segments);
}

export interface ResolveDesktopCanonicalRuntimeDataRootOptions {
  preset?: RuntimeDataPathPreset | null;
  overrideRoot?: string | null;
  userDataPath?: string;
  homeDirectory?: string;
}

export function resolveRuntimeDataRootOverridePath(overrideRoot?: string | null): string | null {
  const normalizedOverride = overrideRoot?.trim();
  if (!normalizedOverride) {
    return null;
  }

  return resolvePortablePath(normalizedOverride);
}

export function resolveDesktopCanonicalRuntimeDataRoot(
  options: ResolveDesktopCanonicalRuntimeDataRootOptions = {},
): string {
  const overrideRoot = resolveRuntimeDataRootOverridePath(options.overrideRoot);
  if (overrideRoot) {
    return overrideRoot;
  }

  const preset = normalizeRuntimeDataPathPreset(options.preset, DEFAULT_RUNTIME_DATA_PATH_PRESET);

  if (preset === 'userData-runtime-data') {
    const userDataPath = options.userDataPath?.trim();
    if (!userDataPath) {
      throw new Error('userDataPath is required when resolving the userData runtime data preset');
    }

    return joinPortablePath(resolvePortablePath(userDataPath), 'runtime-data');
  }

  const resolvedHomeDirectory = options.homeDirectory?.trim()
    ? resolvePortablePath(options.homeDirectory)
    : homedir();

  return joinPortablePath(resolvedHomeDirectory, '.hagicode', 'runtime-data');
}
