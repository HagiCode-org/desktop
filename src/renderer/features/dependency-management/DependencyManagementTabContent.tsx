import { lazy, Suspense, useMemo } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TabsContent } from '@/components/ui/tabs';
import type { DependencyManagementTabConfig, DependencyManagementTabProps } from './types';

export function DependencyManagementTabContent({ activeTab, ...tabProps }: DependencyManagementTabProps & { activeTab: DependencyManagementTabConfig }) {
  const { t } = useTranslation(['pages', 'common']);
  const ActiveTab = useMemo(() => lazy(activeTab.loader), [activeTab.loader]);
  return (
    <TabsContent key={activeTab.id} value={activeTab.id} className="mt-0">
      <Suspense fallback={<div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />{t('settings.loading')}</div>}>
        <ActiveTab {...tabProps} />
      </Suspense>
    </TabsContent>
  );
}
