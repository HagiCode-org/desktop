import { PackageSourceSelector } from '@/components/PackageSourceSelector';
import type { VersionManagementTabProps } from '../types';

export default function SourceManagementTab(_props: VersionManagementTabProps) {
  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5">
      <PackageSourceSelector />
    </section>
  );
}
