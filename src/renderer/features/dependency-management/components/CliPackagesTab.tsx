import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NpmPackageTable } from '@/components/dependency-management/NpmPackageGroups';
import type { DependencyManagementTabProps } from '../types';

export default function CliPackagesTab({
  basePackages, agentCliPackages, baseHighlightedPackageIds, agentCliHighlightedPackageIds,
  selectedPackageIds, onSelectionChange, onGenerateBatchCommand,
}: DependencyManagementTabProps) {
  const { t } = useTranslation(['pages', 'components']);
  const baseIds = new Set(basePackages.map((item) => item.id));
  const agentIds = new Set(agentCliPackages.map((item) => item.id));
  return (
    <div className="space-y-5">
      <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <span className="text-sm font-medium">{t('dependencyManagement.batch.selectedCount', { count: selectedPackageIds.size, ns: 'components' })}</span>
        <Button type="button" onClick={onGenerateBatchCommand} disabled={selectedPackageIds.size === 0}>{t('dependencyManagement.batch.generate', { ns: 'components' })}</Button>
      </CardContent></Card>
      <NpmPackageTable titleKey="dependencyManagement.packageTable.groups.base.title" descriptionKey="dependencyManagement.packageTable.groups.base.description" packages={basePackages} highlightedPackageIds={baseHighlightedPackageIds} selectedIds={[...selectedPackageIds].filter((id) => baseIds.has(id))} onSelectionChange={(ids) => onSelectionChange(ids, 'base')} />
      <NpmPackageTable titleKey="dependencyManagement.packageTable.groups.agentCli.title" descriptionKey="dependencyManagement.packageTable.groups.agentCli.description" packages={agentCliPackages} highlightedPackageIds={agentCliHighlightedPackageIds} selectedIds={[...selectedPackageIds].filter((id) => agentIds.has(id))} onSelectionChange={(ids) => onSelectionChange(ids, 'agent-cli')} />
    </div>
  );
}
