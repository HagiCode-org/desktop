import { PackageSourceSelector } from '@/components/PackageSourceSelector';
import type { VersionManagementTabProps } from '../types';

export default function SourceManagementTab(_props: VersionManagementTabProps) {
  return (
    <section className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm">
      <PackageSourceSelector />
    </section>
  );
}
