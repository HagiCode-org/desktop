import { Boxes, Server } from 'lucide-react';
import { useState } from 'react';
import type { DependencyManagementTabConfig, DependencyManagementTabId } from './types';

export function useDependencyManagementTab() {
  const tabs: DependencyManagementTabConfig[] = [
    { id: 'cliPackages', labelKey: 'dependencyManagement.tabs.cliPackages', icon: Boxes, loader: () => import('./components/CliPackagesTab') },
    { id: 'environment', labelKey: 'dependencyManagement.tabs.environment', icon: Server, loader: () => import('./components/EnvironmentTab') },
  ];
  const [activeTab, setActiveTab] = useState<DependencyManagementTabId>('cliPackages');
  return { activeTab, setActiveTab, tabs };
}
