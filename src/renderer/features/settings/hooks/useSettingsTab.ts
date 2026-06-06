import { BellRing, Bug, Gauge, Languages, Palette, Rocket, Settings2, SlidersHorizontal, Upload, HardDrive } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DistributionModeState } from '../../../../types/distribution-mode';
import type { SettingsTabConfig, SettingsTabId } from '../types';

interface UseSettingsTabOptions {
  distributionState: DistributionModeState;
  showSharingAccelerationSettings: boolean;
}

export function useSettingsTab({ distributionState, showSharingAccelerationSettings }: UseSettingsTabOptions) {
  const tabs = useMemo<SettingsTabConfig[]>(() => {
    const baseTabs: SettingsTabConfig[] = [
      {
        id: 'notification',
        labelKey: 'settings.tabs.notification',
        icon: BellRing,
        loader: () => import('../components/tabs/NotificationTab').then((module) => ({ default: module.NotificationTab })),
      },
      {
        id: 'onboarding',
        labelKey: 'settings.tabs.onboarding',
        icon: Rocket,
        loader: () => import('../components/tabs/builtInTabs').then((module) => ({ default: module.OnboardingSettingsTab })),
      },
      {
        id: 'dependencyManagement',
        labelKey: 'settings.tabs.dependencyManagement',
        icon: Gauge,
        loader: () => import('../components/tabs/builtInTabs').then((module) => ({ default: module.DependencyManagementSettingsTab })),
      },
      {
        id: 'updates',
        labelKey: 'settings.tabs.updates',
        icon: Upload,
        loader: () => import('../components/tabs/builtInTabs').then((module) => ({ default: module.VersionUpdateSettingsTab })),
      },
      {
        id: 'runtimeData',
        labelKey: 'settings.tabs.runtimeData',
        icon: HardDrive,
        loader: () => import('../components/tabs/builtInTabs').then((module) => ({ default: module.RuntimeDataSettingsTab })),
      },
      {
        id: 'debugOptions',
        labelKey: 'settings.tabs.debugOptions',
        icon: Bug,
        loader: () => import('../components/tabs/builtInTabs').then((module) => ({ default: module.DebugOptionsSettingsTab })),
      },
      {
        id: 'language',
        labelKey: 'settings.tabs.language',
        icon: Languages,
        loader: () => import('../components/tabs/builtInTabs').then((module) => ({ default: module.LanguageSettingsTab })),
      },
      {
        id: 'theme',
        labelKey: 'settings.tabs.theme',
        icon: Palette,
        loader: () => import('../components/tabs/placeholder').then((module) => ({ default: module.ThemeSettingsPlaceholderTab })),
      },
      {
        id: 'advanced',
        labelKey: 'settings.tabs.advanced',
        icon: Settings2,
        loader: () => import('../components/tabs/placeholder').then((module) => ({ default: module.AdvancedSettingsPlaceholderTab })),
      },
    ];

    if (showSharingAccelerationSettings) {
      baseTabs.splice(6, 0, {
        id: 'sharingAcceleration',
        labelKey: 'settings.tabs.sharingAcceleration',
        icon: SlidersHorizontal,
        loader: () => import('../components/tabs/builtInTabs').then((module) => ({ default: module.SharingAccelerationSettingsTab })),
      });
    }

    return baseTabs;
  }, [showSharingAccelerationSettings]);

  const [activeTab, setActiveTab] = useState<SettingsTabId>(tabs[0]?.id ?? 'notification');

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id ?? 'notification');
    }
  }, [activeTab, tabs]);

  return {
    activeTab,
    distributionState,
    setActiveTab,
    tabs,
  };
}
