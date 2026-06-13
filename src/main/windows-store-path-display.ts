import { homedir } from 'node:os';
import path from 'node:path';
import type { PathDisplayInfo } from '../types/path-display.js';

const WINDOWS_APPS_SEGMENT = '\\windowsapps\\';

export interface ResolveWindowsStorePathDisplayOptions {
  isWindowsStore?: boolean;
  platform?: NodeJS.Platform;
  execPath?: string | null;
  packageFamilyName?: string | null;
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string | null;
}

function normalizeWindowsPath(targetPath: string): string {
  return path.win32.resolve(targetPath.trim().replace(/\//g, '\\'));
}

function isPathWithinWindowsRoot(targetPath: string, rootPath: string): boolean {
  const relativePath = path.win32.relative(rootPath, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.win32.isAbsolute(relativePath));
}

function resolveWindowsAppDataRoots(
  env: NodeJS.ProcessEnv,
  homeDirectory?: string | null,
): { localAppDataPath: string; roamingAppDataPath: string } {
  const resolvedHomeDirectory = homeDirectory?.trim() || homedir();
  const localAppDataPath = env.LOCALAPPDATA?.trim()
    || path.win32.join(resolvedHomeDirectory, 'AppData', 'Local');
  const roamingAppDataPath = env.APPDATA?.trim()
    || path.win32.join(resolvedHomeDirectory, 'AppData', 'Roaming');

  return {
    localAppDataPath: normalizeWindowsPath(localAppDataPath),
    roamingAppDataPath: normalizeWindowsPath(roamingAppDataPath),
  };
}

function resolveWindowsStorePackageFullName(executablePath: string | null | undefined): string | null {
  const normalizedExecutablePath = String(executablePath ?? '').trim();
  if (!normalizedExecutablePath) {
    return null;
  }

  const windowsPath = normalizedExecutablePath.replace(/\//g, '\\');
  const markerIndex = windowsPath.toLowerCase().indexOf(WINDOWS_APPS_SEGMENT);
  if (markerIndex < 0) {
    return null;
  }

  const relativePath = windowsPath.slice(markerIndex + WINDOWS_APPS_SEGMENT.length);
  const packageFullName = relativePath.split('\\', 1)[0]?.trim();
  return packageFullName || null;
}

export function resolveWindowsStorePackageFamilyName(
  executablePath: string | null | undefined,
): string | null {
  const packageFullName = resolveWindowsStorePackageFullName(executablePath);
  if (!packageFullName) {
    return null;
  }

  const fullNameParts = packageFullName.split('_').filter(Boolean);
  if (fullNameParts.length < 2) {
    return null;
  }

  const packageName = fullNameParts[0]?.trim();
  const publisherId = fullNameParts[fullNameParts.length - 1]?.trim();
  if (!packageName || !publisherId) {
    return null;
  }

  return `${packageName}_${publisherId}`;
}

export function resolveWindowsStoreVirtualizedPhysicalPath(
  logicalPath: string,
  options: ResolveWindowsStorePathDisplayOptions = {},
): string | null {
  if ((options.platform ?? process.platform) !== 'win32' || !options.isWindowsStore) {
    return null;
  }

  const normalizedLogicalPath = String(logicalPath ?? '').trim();
  if (!normalizedLogicalPath) {
    return null;
  }

  const packageFamilyName = options.packageFamilyName?.trim()
    || resolveWindowsStorePackageFamilyName(options.execPath ?? process.execPath);
  if (!packageFamilyName) {
    return null;
  }

  const resolvedLogicalPath = normalizeWindowsPath(normalizedLogicalPath);
  const { localAppDataPath, roamingAppDataPath } = resolveWindowsAppDataRoots(
    options.env ?? process.env,
    options.homeDirectory,
  );
  const packageStorageRoot = path.win32.join(localAppDataPath, 'Packages', packageFamilyName);

  if (isPathWithinWindowsRoot(resolvedLogicalPath, packageStorageRoot)) {
    return null;
  }

  if (isPathWithinWindowsRoot(resolvedLogicalPath, roamingAppDataPath)) {
    return path.win32.join(
      packageStorageRoot,
      'LocalCache',
      'Roaming',
      path.win32.relative(roamingAppDataPath, resolvedLogicalPath),
    );
  }

  if (isPathWithinWindowsRoot(resolvedLogicalPath, localAppDataPath)) {
    const relativePath = path.win32.relative(localAppDataPath, resolvedLogicalPath);
    if (relativePath.toLowerCase().startsWith('packages\\')) {
      return null;
    }

    return path.win32.join(packageStorageRoot, 'LocalCache', 'Local', relativePath);
  }

  return null;
}

export function createPathDisplayInfo(
  logicalPath: string,
  options: ResolveWindowsStorePathDisplayOptions = {},
): PathDisplayInfo {
  const physicalPath = resolveWindowsStoreVirtualizedPhysicalPath(logicalPath, options);
  return {
    logicalPath,
    displayPath: physicalPath ?? logicalPath,
    physicalPath,
    virtualizationKind: physicalPath ? 'windows-store-appdata' : 'none',
  };
}
