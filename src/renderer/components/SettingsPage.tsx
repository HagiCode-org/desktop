import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OnboardingSettings } from './settings/OnboardingSettings';
import { DebugSettings } from './settings/DebugSettings';
import { DataDirectorySettings } from './settings/DataDirectorySettings';

export default function SettingsPage() {
  const { t } = useTranslation('pages');

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
              value="debug"
              className="justify-start px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.tabs.debug')}
            </TabsTrigger>
            <TabsTrigger
              value="dataDirectory"
              className="justify-start px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.tabs.dataDirectory')}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-w-0">
            <TabsContent value="onboarding" className="mt-0">
              <OnboardingSettings />
            </TabsContent>

            <TabsContent value="debug" className="mt-0">
              <DebugSettings />
            </TabsContent>

            <TabsContent value="dataDirectory" className="mt-0">
              <DataDirectorySettings />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
