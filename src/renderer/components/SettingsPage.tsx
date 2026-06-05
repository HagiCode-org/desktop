import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DependencyManagementModeSettings,
  DebugOptionsSettings,
  OnboardingSettings,
  RuntimeDataPathSettings,
  SharingAccelerationSettings,
  shouldShowSharingAccelerationSettings,
  VersionUpdateSettings,
} from './settings';
import type { DistributionMode } from '../../types/distribution-mode';

interface SettingsPageProps {
  distributionMode: DistributionMode;
}

export default function SettingsPage({ distributionMode }: SettingsPageProps) {
  const { t } = useTranslation('pages');
  const showSharingAccelerationSettings = shouldShowSharingAccelerationSettings(distributionMode);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <section className="rounded-[28px] border border-border/80 bg-card p-6 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {t('settings.title')}
        </h1>
      </section>

      <Tabs defaultValue="onboarding" className="w-full">
        <div className="rounded-3xl border border-border/80 bg-card p-4 shadow-sm lg:flex lg:gap-6">
          <TabsList className="flex h-auto w-full flex-col items-stretch justify-start rounded-2xl border border-border/70 bg-muted/25 p-2 lg:w-60">
            <TabsTrigger
              value="onboarding"
              className="justify-start rounded-xl px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.tabs.onboarding')}
            </TabsTrigger>
            <TabsTrigger
              value="dependencyManagement"
              className="justify-start rounded-xl px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.tabs.dependencyManagement')}
            </TabsTrigger>
            <TabsTrigger
              value="updates"
              className="justify-start rounded-xl px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.tabs.updates')}
            </TabsTrigger>
            <TabsTrigger
              value="runtimeData"
              className="justify-start rounded-xl px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.tabs.runtimeData')}
            </TabsTrigger>
            <TabsTrigger
              value="debugOptions"
              className="justify-start rounded-xl px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.tabs.debugOptions')}
            </TabsTrigger>
            {showSharingAccelerationSettings ? (
              <TabsTrigger
                value="sharingAcceleration"
                className="justify-start rounded-xl px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                {t('settings.tabs.sharingAcceleration')}
              </TabsTrigger>
            ) : null}
          </TabsList>

          <div className="mt-4 min-w-0 flex-1 lg:mt-0">
            <TabsContent value="onboarding" className="mt-0 rounded-2xl border border-border/70 bg-background/40 p-1">
              <OnboardingSettings />
            </TabsContent>

            <TabsContent value="dependencyManagement" className="mt-0 rounded-2xl border border-border/70 bg-background/40 p-1">
              <DependencyManagementModeSettings />
            </TabsContent>

            <TabsContent value="updates" className="mt-0 rounded-2xl border border-border/70 bg-background/40 p-1">
              <VersionUpdateSettings distributionMode={distributionMode} />
            </TabsContent>

            <TabsContent value="runtimeData" className="mt-0 rounded-2xl border border-border/70 bg-background/40 p-1">
              <RuntimeDataPathSettings />
            </TabsContent>

            <TabsContent value="debugOptions" className="mt-0 rounded-2xl border border-border/70 bg-background/40 p-1">
              <DebugOptionsSettings />
            </TabsContent>

            {showSharingAccelerationSettings ? (
              <TabsContent value="sharingAcceleration" className="mt-0 rounded-2xl border border-border/70 bg-background/40 p-1">
                <SharingAccelerationSettings distributionMode={distributionMode} />
              </TabsContent>
            ) : null}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
