import type { ReactNode } from 'react';
import { PageShell } from '@/components/ui/page-shell';

interface SettingsPageLayoutProps {
  title: string;
  navigation: ReactNode;
  content: ReactNode;
}

export default function SettingsPageLayout({ title, navigation, content }: SettingsPageLayoutProps) {
  return (
    <PageShell>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>

      <div className="flex flex-col gap-4 @4xl:flex-row @4xl:gap-6">
        {navigation}
        <div className="@container min-w-0 flex-1">{content}</div>
      </div>
    </PageShell>
  );
}
