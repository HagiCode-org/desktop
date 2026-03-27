import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OnboardingSettings } from './settings/OnboardingSettings';
import { DataDirectorySettings } from './settings/DataDirectorySettings';
import { RemoteModeSettings } from './settings/RemoteModeSettings';
import { GitHubOAuthSettings } from './settings/GitHubOAuthSettings';
import { SharingAccelerationSettings } from './settings/SharingAccelerationSettings';
import { shouldShowSharingAccelerationSettings } from './settings';
import type { DistributionMode } from '../../types/distribution-mode';

interface SettingsPageProps {
  distributionMode: DistributionMode;
}

export default function SettingsPage({ distributionMode }: SettingsPageProps) {
  const { t } = useTranslation('pages');
  const showSharingAccelerationSettings = shouldShowSharingAccelerationSettings(distributionMode);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">
          {t('settings.title')}
        </h1>
      </div>

      <Tabs defaultValue="onboarding" className="w-full">
        <div className="flex gap-8">
          <TabsList className="flex flex-col h-auto w-52 justify-start items-stretch bg-muted/30 p-2 rounded-lg">
            <TabsTrigger
              value="onboarding"
              className="justify-start px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.tabs.onboarding')}
            </TabsTrigger>
            <TabsTrigger
              value="remoteMode"
              className="justify-start px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.tabs.remoteMode')}
            </TabsTrigger>
            <TabsTrigger
              value="dataDirectory"
              className="justify-start px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.tabs.dataDirectory')}
            </TabsTrigger>
            {showSharingAccelerationSettings ? (
              <TabsTrigger
                value="sharingAcceleration"
                className="justify-start px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                {t('settings.tabs.sharingAcceleration')}
              </TabsTrigger>
            ) : null}
            <TabsTrigger
              value="githubIntegration"
              className="justify-start px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.tabs.githubIntegration')}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-w-0">
            <TabsContent value="onboarding" className="mt-0">
              <OnboardingSettings />
            </TabsContent>

            <TabsContent value="remoteMode" className="mt-0">
              <RemoteModeSettings />
            </TabsContent>

            <TabsContent value="dataDirectory" className="mt-0">
              <DataDirectorySettings />
            </TabsContent>

            {showSharingAccelerationSettings ? (
              <TabsContent value="sharingAcceleration" className="mt-0">
                <SharingAccelerationSettings distributionMode={distributionMode} />
              </TabsContent>
            ) : null}

            <TabsContent value="githubIntegration" className="mt-0">
              <GitHubOAuthSettings />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
