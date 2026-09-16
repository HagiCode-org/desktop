import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface PageHeaderProps {
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
  actions?: ReactNode;
  summaryTiles?: ReactNode;
}

export function PageHeader({ icon: Icon, titleKey, descriptionKey, actions, summaryTiles }: PageHeaderProps) {
  const { t } = useTranslation(['pages', 'common']);

  return (
    <section className="rounded-[28px] border border-border/80 bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t(titleKey)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t(descriptionKey)}</p>
          </div>
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      {summaryTiles ? <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{summaryTiles}</div> : null}
    </section>
  );
}
