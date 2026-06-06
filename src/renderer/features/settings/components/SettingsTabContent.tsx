import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LoaderCircle } from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import type { DistributionModeState } from '../../../../types/distribution-mode';
import type { SettingsTabConfig } from '../types';

interface SettingsTabContentProps {
  activeTab: SettingsTabConfig;
  distributionState: DistributionModeState;
}

export function SettingsTabContent({ activeTab, distributionState }: SettingsTabContentProps) {
  const { t } = useTranslation('pages');
  const ActiveTabComponent = useMemo(() => lazy(activeTab.loader), [activeTab.loader]);

  return (
    <TabsContent
      key={activeTab.id}
      value={activeTab.id}
      className="mt-0 rounded-2xl border border-border/70 bg-background/40 p-1"
    >
      <Suspense
        fallback={(
          <div className="flex min-h-[320px] items-center justify-center rounded-[20px] border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              <span>{t('settings.loading')}</span>
            </div>
          </div>
        )}
      >
        <ActiveTabComponent distributionState={distributionState} />
      </Suspense>
    </TabsContent>
  );
}
