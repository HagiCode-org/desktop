import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { NpmPackageTable } from '@/components/dependency-management/NpmPackageGroups';
import type { DependencyManagementTabProps } from '../types';

export default function CliPackagesTab({
  basePackages, agentCliPackages, baseHighlightedPackageIds, agentCliHighlightedPackageIds,
  selectedPackageIds, onSelectionChange, onGenerateBatchCommand,
  snapshot, onUpdateMirrorSettings, isSavingMirrorSettings, mirrorSaveError,
}: DependencyManagementTabProps) {
  const { t } = useTranslation(['common', 'components']);
  const baseIds = new Set(basePackages.map((item) => item.id));
  const agentIds = new Set(agentCliPackages.map((item) => item.id));
  return (
    <div className="space-y-5">
      <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <span className="text-sm font-medium">{t('dependencyManagement.batch.selectedCount', { count: selectedPackageIds.size, ns: 'components' })}</span>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch
              checked={snapshot.mirrorSettings.enabled}
              onCheckedChange={(enabled) => void onUpdateMirrorSettings(enabled)}
              disabled={isSavingMirrorSettings}
              aria-label={t('dependencyManagement.mirror.toggleLabel')}
            />
            {t('dependencyManagement.mirror.toggleLabel')}
          </label>
          <Button type="button" onClick={onGenerateBatchCommand} disabled={selectedPackageIds.size === 0}>{t('dependencyManagement.batch.generate', { ns: 'components' })}</Button>
        </div>
        {mirrorSaveError ? <p className="basis-full text-sm text-destructive">{mirrorSaveError}</p> : null}
      </CardContent></Card>
      <NpmPackageTable titleKey="dependencyManagement.packageTable.groups.base.title" descriptionKey="dependencyManagement.packageTable.groups.base.description" packages={basePackages} highlightedPackageIds={baseHighlightedPackageIds} selectedIds={[...selectedPackageIds].filter((id) => baseIds.has(id))} onSelectionChange={(ids) => onSelectionChange(ids, 'base')} />
      <NpmPackageTable titleKey="dependencyManagement.packageTable.groups.agentCli.title" descriptionKey="dependencyManagement.packageTable.groups.agentCli.description" packages={agentCliPackages} highlightedPackageIds={agentCliHighlightedPackageIds} selectedIds={[...selectedPackageIds].filter((id) => agentIds.has(id))} onSelectionChange={(ids) => onSelectionChange(ids, 'agent-cli')} />
    </div>
  );
}
