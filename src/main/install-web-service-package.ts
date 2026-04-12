import type { InstallWebServicePackageOptions, InstallWebServicePackageResult } from '../types/version-install.js';
import type { VersionDownloadProgress } from '../types/sharing-acceleration.js';
import type { ActiveRuntimeDescriptor } from '../types/distribution-mode.js';

type ProgressCallback = (progress: VersionDownloadProgress) => void;

interface InstalledVersionSummary {
  id: string;
}

interface ActiveVersionSummary {
  id: string;
}

interface InstallOperationResult {
  success: boolean;
  error?: string;
}

interface VersionSwitchResult {
  success: boolean;
  error?: string;
}

interface MainWindowLike {
  webContents: {
    send: (channel: string, payload: unknown) => void;
  };
}

interface VersionManagerLike {
  getInstalledVersions: () => Promise<InstalledVersionSummary[]>;
  installVersion: (versionId: string, onProgress?: ProgressCallback) => Promise<InstallOperationResult>;
  reinstallVersion: (versionId: string, onProgress?: ProgressCallback) => Promise<InstallOperationResult>;
  switchVersion: (versionId: string) => Promise<VersionSwitchResult>;
  getActiveVersion: () => Promise<ActiveVersionSummary | null>;
  getActiveRuntimeDescriptor: () => Promise<ActiveRuntimeDescriptor | null>;
}

interface WebServiceManagerLike {
  getStatus: () => Promise<{ status: string }>;
  setActiveRuntime: (runtime: ActiveRuntimeDescriptor | null) => void;
}

export interface InstallWebServicePackageDependencies {
  versionManager: VersionManagerLike;
  webServiceManager: WebServiceManagerLike;
  mainWindow: MainWindowLike;
  refreshVersionUpdateSnapshot?: (reason: string) => Promise<unknown>;
}

async function syncActiveRuntime(
  versionManager: VersionManagerLike,
  webServiceManager: WebServiceManagerLike,
): Promise<void> {
  const activeRuntime = await versionManager.getActiveRuntimeDescriptor();
  if (activeRuntime) {
    webServiceManager.setActiveRuntime(activeRuntime);
  }
}

export async function installWebServicePackageWithAutoSwitch(
  deps: InstallWebServicePackageDependencies,
  versionId: string,
  options: InstallWebServicePackageOptions = {},
): Promise<InstallWebServicePackageResult> {
  const onProgress: ProgressCallback = (progress) => {
    deps.mainWindow.webContents.send('version:install-progress', progress);
    deps.mainWindow.webContents.send('package-install-progress', progress);
  };

  const installedVersions = await deps.versionManager.getInstalledVersions();
  const isInstalled = installedVersions.some((version) => version.id === versionId);
  const installResult = isInstalled
    ? await deps.versionManager.reinstallVersion(versionId, onProgress)
    : await deps.versionManager.installVersion(versionId, onProgress);

  if (!installResult.success) {
    const activeVersion = await deps.versionManager.getActiveVersion();
    return {
      success: false,
      autoSwitched: false,
      activeVersionId: activeVersion?.id ?? null,
    };
  }

  await syncActiveRuntime(deps.versionManager, deps.webServiceManager);

  const updatedVersions = await deps.versionManager.getInstalledVersions();
  deps.mainWindow.webContents.send('version:installedVersionsChanged', updatedVersions);

  let autoSwitched = false;
  let switchError: string | undefined;

  if (options.autoSwitchWhenIdle) {
    try {
      const webServiceStatus = await deps.webServiceManager.getStatus();
      if (webServiceStatus.status !== 'running') {
        const switchResult = await deps.versionManager.switchVersion(versionId);
        if (switchResult.success) {
          autoSwitched = true;
          await syncActiveRuntime(deps.versionManager, deps.webServiceManager);
        } else {
          switchError = switchResult.error;
        }
      }
    } catch (error) {
      switchError = error instanceof Error ? error.message : String(error);
    }
  }

  await deps.refreshVersionUpdateSnapshot?.('web-service-package-installed');

  const activeVersion = await deps.versionManager.getActiveVersion();
  return {
    success: true,
    autoSwitched,
    activeVersionId: activeVersion?.id ?? null,
    ...(switchError ? { switchError } : {}),
  };
}
