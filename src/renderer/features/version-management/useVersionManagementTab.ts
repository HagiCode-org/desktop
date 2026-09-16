import { Download, HardDrive, Settings2 } from 'lucide-react';
import { useState } from 'react';
import type { VersionManagementTabConfig, VersionManagementTabId } from './types';

export function useVersionManagementTab() {
  const tabs: VersionManagementTabConfig[] = [
    {
      id: 'newVersions',
      labelKey: 'versionManagement.tabs.newVersions',
      icon: Download,
      loader: () => import('./components/NewVersionsTab'),
    },
    {
      id: 'downloadedVersions',
      labelKey: 'versionManagement.tabs.downloadedVersions',
      icon: HardDrive,
      loader: () => import('./components/DownloadedVersionsTab'),
    },
    {
      id: 'sourceManagement',
      labelKey: 'versionManagement.tabs.sourceManagement',
      icon: Settings2,
      loader: () => import('./components/SourceManagementTab'),
    },
  ];
  const [activeTab, setActiveTab] = useState<VersionManagementTabId>('newVersions');

  return { activeTab, setActiveTab, tabs };
}
