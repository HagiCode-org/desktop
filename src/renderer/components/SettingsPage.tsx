import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  SettingsFeaturePageLayout,
  SettingsTabContent,
  useSettingsTab,
} from '@/features/settings';
import { shouldShowSharingAccelerationSettings } from './settings';
import type { DistributionModeState } from '../../types/distribution-mode';

interface SettingsPageProps {
  distributionState: DistributionModeState;
}

export default function SettingsPage({ distributionState }: SettingsPageProps) {
  const { t } = useTranslation('pages');
  const showSharingAccelerationSettings = shouldShowSharingAccelerationSettings(distributionState);
  const {
    activeTab,
    setActiveTab,
    tabs,
  } = useSettingsTab({
    distributionState,
    showSharingAccelerationSettings,
  });
  const activeTabConfig = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  if (!activeTabConfig) {
    return null;
  }

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="w-full">
      <SettingsFeaturePageLayout
        title={t('settings.title')}
        navigation={(
          <TabsList className="flex h-auto w-full justify-start gap-2 overflow-x-auto rounded-2xl border border-border/70 bg-muted/25 p-2 md:w-72 md:flex-col md:items-stretch md:overflow-visible">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="justify-start gap-2 rounded-xl px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Icon className="h-4 w-4" />
                  <span>{t(tab.labelKey)}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        )}
        content={<SettingsTabContent activeTab={activeTabConfig} distributionState={distributionState} />}
      />
    </Tabs>
  );
}
