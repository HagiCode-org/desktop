import { homedir } from 'node:os';
import path from 'node:path';

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
  overrideRoot?: string | null;
  homeDirectory?: string;
}

export function resolveDesktopCanonicalRuntimeDataRoot(
  options: ResolveDesktopCanonicalRuntimeDataRootOptions = {},
): string {
  const overrideRoot = options.overrideRoot?.trim();
  if (overrideRoot) {
    return resolvePortablePath(overrideRoot);
  }

  const resolvedHomeDirectory = options.homeDirectory?.trim()
    ? resolvePortablePath(options.homeDirectory)
    : homedir();

  return joinPortablePath(resolvedHomeDirectory, '.hagicode', 'runtime-data');
}
