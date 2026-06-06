import type { ReactNode } from 'react';

interface SettingsPageLayoutProps {
  title: string;
  navigation: ReactNode;
  content: ReactNode;
}

export default function SettingsPageLayout({ title, navigation, content }: SettingsPageLayoutProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <section className="rounded-[28px] border border-border/80 bg-card p-6 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      </section>

      <section className="rounded-3xl border border-border/80 bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:gap-6">
          {navigation}
          <div className="min-w-0 flex-1">{content}</div>
        </div>
      </section>
    </div>
  );
}
