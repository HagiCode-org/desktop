import type { LucideIcon } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

export type VersionManagementTabId = 'newVersions' | 'downloadedVersions' | 'sourceManagement';

export type VersionManagementTabLoader = () => Promise<{
  default: ComponentType<VersionManagementTabProps>;
}>;

export interface VersionManagementTabConfig {
  id: VersionManagementTabId;
  labelKey: string;
  icon: LucideIcon;
  loader: VersionManagementTabLoader;
}

export interface VersionManagementTabProps {
  availableVersions: Version[];
  installedVersions: InstalledVersion[];
  getPlatformLabel: (platform: string) => string;
  renderInstallTelemetry: (versionId: string) => ReactNode;
  getInstallProgressText: () => string;
  onRefresh: () => void;
  onReinstall: (versionId: string) => void;
  onOpenLogs: (versionId: string) => void;
  onSwitch: (versionId: string) => void;
  onUninstall: (versionId: string) => void;
  onStartOnboarding: () => void;
  switching: string | null;
  uninstalling: string | null;
  isInstalling: boolean;
  installProgress: { progress: number; stage: string } | null;
  getVersionStatus: (version: InstalledVersion) => ReactNode;
  formatDate: (dateString: string) => string;
  isDesktopIncompatible: (version: InstalledVersion) => boolean;
  getDesktopCompatibility: (version: InstalledVersion) => InstalledVersion['validation'] extends infer V ? V extends { desktopCompatibility?: infer C } ? C | undefined : never : never;
}

export interface Version {
  id: string;
  version: string;
  platform: string;
  packageFilename: string;
  sourceType?: 'local-folder' | 'http-index';
  assetKind?: string;
  hybrid?: {
    torrentFirst: boolean;
    eligible: boolean;
    legacyHttpFallback: boolean;
    isLatestDesktopAsset: boolean;
    isLatestWebAsset: boolean;
    serviceScope: 'latest-desktop' | 'latest-server' | 'local-cache';
  };
}

export interface InstalledVersion {
  id: string;
  version: string;
  platform: string;
  packageFilename: string;
  installedPath: string;
  installedAt: string;
  status: 'installed-ready' | 'payload-invalid' | 'runtime-incompatible' | 'desktop-incompatible';
  isActive: boolean;
  runtimeSource?: 'installed-version' | 'portable-fixed';
  isReadOnly?: boolean;
  validation?: {
    startable: boolean;
    message?: string;
    desktopCompatibility?: {
      declared: boolean;
      compatible: boolean;
      requiredVersion?: string;
      currentVersion: string;
      message?: string;
      reason?: string;
    };
  };
}
