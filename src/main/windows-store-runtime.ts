export interface WindowsStoreRuntimeDetectionOptions {
  platform: NodeJS.Platform;
  inheritedFlag?: string | null | undefined;
  processWindowsStore?: boolean;
  execPath?: string | null | undefined;
  isPackaged: boolean;
  defaultApp?: boolean;
}

export function looksLikeWindowsStoreInstallPath(executablePath: string | null | undefined): boolean {
  const normalized = String(executablePath ?? '').trim();
  if (!normalized) {
    return false;
  }

  return normalized.replace(/\//g, '\\').toLowerCase().includes('\\windowsapps\\');
}

export function isWindowsStoreRuntime(options: WindowsStoreRuntimeDetectionOptions): boolean {
  if (options.platform !== 'win32') {
    return false;
  }

  const inheritedFlag = String(options.inheritedFlag ?? '').trim().toLowerCase();
  if (inheritedFlag === '1' || inheritedFlag === 'true') {
    return true;
  }

  return Boolean(options.processWindowsStore)
    && options.isPackaged
    && !Boolean(options.defaultApp)
    && looksLikeWindowsStoreInstallPath(options.execPath);
}
