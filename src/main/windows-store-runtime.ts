import fs from 'node:fs';
import path from 'node:path';

export interface WindowsStoreRuntimeDetectionOptions {
  platform: NodeJS.Platform;
  inheritedFlag?: string | null | undefined;
  processWindowsStore?: boolean;
  execPath?: string | null | undefined;
  isPackaged: boolean;
  defaultApp?: boolean;
}

function normalizeExecutablePath(executablePath: string | null | undefined): string {
  return String(executablePath ?? '').trim().replace(/\//g, '\\');
}

export function looksLikeWindowsStoreInstallPath(executablePath: string | null | undefined): boolean {
  const normalized = normalizeExecutablePath(executablePath);
  if (!normalized) {
    return false;
  }

  return normalized.toLowerCase().includes('\\windowsapps\\');
}

export function looksLikeWindowsStoreDevelopmentPackage(
  executablePath: string | null | undefined,
): boolean {
  const normalized = normalizeExecutablePath(executablePath);
  if (!normalized || looksLikeWindowsStoreInstallPath(normalized)) {
    return false;
  }

  const installRoot = path.dirname(normalized);
  const appxManifestPath = path.join(installRoot, 'AppxManifest.xml');
  if (!fs.existsSync(appxManifestPath)) {
    return false;
  }

  try {
    const manifest = fs.readFileSync(appxManifestPath, 'utf8');
    return /<Identity\b/i.test(manifest)
      && /<Application\b[\s\S]*EntryPoint="Windows\.FullTrustApplication"/i.test(manifest);
  } catch {
    return false;
  }
}

export function isWindowsStoreRuntime(options: WindowsStoreRuntimeDetectionOptions): boolean {
  if (options.platform !== 'win32') {
    return false;
  }

  const inheritedFlag = String(options.inheritedFlag ?? '').trim().toLowerCase();
  if (inheritedFlag === '1' || inheritedFlag === 'true') {
    return true;
  }

  if (!options.isPackaged || Boolean(options.defaultApp)) {
    return false;
  }

  if (Boolean(options.processWindowsStore) && looksLikeWindowsStoreInstallPath(options.execPath)) {
    return true;
  }

  return looksLikeWindowsStoreDevelopmentPackage(options.execPath);
}
