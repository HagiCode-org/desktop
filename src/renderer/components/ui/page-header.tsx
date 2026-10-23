import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface PageHeaderProps {
  icon: LucideIcon;
  titleKey: string;
  actions?: ReactNode;
  summaryTiles?: ReactNode;
}

export function PageHeader({ icon: Icon, titleKey, actions, summaryTiles }: PageHeaderProps) {
  const { t } = useTranslation(['pages', 'common']);

  return (
    <section className="@container rounded-2xl border border-border/80 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-72 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t(titleKey)}</h1>
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {summaryTiles ? <div className="mt-4 grid grid-cols-1 gap-3 @lg:grid-cols-2 @4xl:grid-cols-4">{summaryTiles}</div> : null}
    </section>
  );
}
