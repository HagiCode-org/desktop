import { lazy, Suspense, useMemo } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TabsContent } from '@/components/ui/tabs';
import type { VersionManagementTabConfig, VersionManagementTabProps } from './types';

interface VersionManagementTabContentProps extends VersionManagementTabProps {
  activeTab: VersionManagementTabConfig;
}

export function VersionManagementTabContent({
  activeTab,
  ...tabProps
}: VersionManagementTabContentProps) {
  const { t } = useTranslation('pages');
  const ActiveTabComponent = useMemo(() => lazy(activeTab.loader), [activeTab.loader]);

  return (
    <TabsContent key={activeTab.id} value={activeTab.id} className="mt-0">
      <Suspense fallback={(
        <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            <span>{t('settings.loading')}</span>
          </div>
        </div>
      )}
      >
        <ActiveTabComponent {...tabProps} />
      </Suspense>
    </TabsContent>
  );
}
