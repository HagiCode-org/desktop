import fs from 'node:fs';
import path from 'node:path';
import { electron } from '../electron-api.js';
import type { DesktopVersionInfoPayload } from '../types/version-info.js';

const { app } = electron;

interface DesktopPackageMetadata {
  hagicodeDesktop?: {
    windowsStoreVersion?: unknown;
  };
}

function readDesktopPackageMetadata(): DesktopPackageMetadata | null {
  const packageJsonPath = path.join(app.getAppPath(), 'package.json');

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as DesktopPackageMetadata;
  } catch {
    return null;
  }
}

function resolveWindowsStoreVersion(): string | null {
  const envWindowsStoreVersion = String(process.env.HAGICODE_WINDOWS_STORE_VERSION ?? '').trim();
  if (envWindowsStoreVersion) {
    return envWindowsStoreVersion;
  }

  const packageMetadata = readDesktopPackageMetadata();
  const packageWindowsStoreVersion = typeof packageMetadata?.hagicodeDesktop?.windowsStoreVersion === 'string'
    ? packageMetadata.hagicodeDesktop.windowsStoreVersion.trim()
    : '';
  if (packageWindowsStoreVersion) {
    return packageWindowsStoreVersion;
  }

  return null;
}

export function getDesktopVersionInfo(): DesktopVersionInfoPayload {
  const windowsStoreVersion = resolveWindowsStoreVersion();

  return {
    desktopVersion: app.getVersion(),
    windowsStoreVersion,
  };
}
