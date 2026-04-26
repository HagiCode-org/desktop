import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Loader2, PackageOpen, Trash2 } from 'lucide-react';
import type {
  ManagedNpmPackageId,
  ManagedNpmPackageStatusSnapshot,
  DependencyManagementOperationProgress,
} from '../../../types/dependency-management.js';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  isOperationActive,
  managedPackageRowClassName,
  packageBadgeVariant,
  type BatchSyncState,
} from './dependencyManagementPageModel';

interface PackageDetailsProps {
  item: ManagedNpmPackageStatusSnapshot;
}

export function PackageDetails({ item }: PackageDetailsProps) {
  const { t } = useTranslation('common');

  return (
    <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
      <p>{t('dependencyManagement.package.version')}: {item.version ?? t('dependencyManagement.unavailable')}</p>
      <p>{t('dependencyManagement.package.category')}: {t(`dependencyManagement.categories.${item.definition.category}`)}</p>
      <p className="break-all sm:col-span-2">{t('dependencyManagement.package.packageName')}: {item.definition.packageName}</p>
    </div>
  );
}

interface PackageProgressProps {
  item: ManagedNpmPackageStatusSnapshot;
  progress?: DependencyManagementOperationProgress;
  error?: string;
}

export function PackageProgress({ item, progress, error }: PackageProgressProps) {
  if (isOperationActive(progress)) {
    return (
      <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {progress?.message}
        </div>
        <Progress value={progress?.percentage ?? 20} />
      </div>
    );
  }

  if (progress?.stage === 'completed') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4" />
        {progress.message}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (item.message) {
    return <p className="text-sm text-muted-foreground">{item.message}</p>;
  }

  return null;
}

interface NpmPackageBootstrapCardProps {
  item: ManagedNpmPackageStatusSnapshot;
  progress?: DependencyManagementOperationProgress;
  error?: string;
  actionsDisabled: boolean;
  refreshDisabled: boolean;
  onInstall: (packageId: ManagedNpmPackageId) => void;
  onRefresh: () => void;
}

export function NpmPackageBootstrapCard({
  item,
  progress,
  error,
  actionsDisabled,
  refreshDisabled,
  onInstall,
  onRefresh,
}: NpmPackageBootstrapCardProps) {
  const { t } = useTranslation('common');

  return (
    <Card className="border-primary/40">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{t('dependencyManagement.bootstrap.title')}: {item.definition.displayName}</CardTitle>
            <CardDescription>{t(item.definition.descriptionKey)}</CardDescription>
          </div>
          <Badge variant={packageBadgeVariant(item.status)}>
            {t(`dependencyManagement.packageStatus.${item.status}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <PackageDetails item={item} />
        <PackageProgress item={item} progress={progress} error={error} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onInstall(item.id)} disabled={actionsDisabled}>
            {isOperationActive(progress) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageOpen className="mr-2 h-4 w-4" />}
            {item.status === 'installed' ? t('dependencyManagement.actions.reinstall') : t('dependencyManagement.actions.install')}
          </Button>
          <Button variant="outline" onClick={onRefresh} disabled={refreshDisabled}>
            {t('dependencyManagement.actions.refresh')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface NpmPackageTableProps {
  packages: ManagedNpmPackageStatusSnapshot[];
  selectedPackageIds: ManagedNpmPackageId[];
  selectablePackageIds: ManagedNpmPackageId[];
  selectAllChecked: boolean | 'indeterminate';
  selectedEligibleCount: number;
  batchSyncPackageIds: Set<ManagedNpmPackageId>;
  progressByPackageId: Partial<Record<ManagedNpmPackageId, DependencyManagementOperationProgress>>;
  activeOperation?: DependencyManagementOperationProgress | null;
  operationErrorByPackageId: Partial<Record<ManagedNpmPackageId, string>>;
  hagiscriptGateOpen: boolean;
  actionsDisabled: boolean;
  dependencyGateMessage: string;
  onTogglePackage: (packageId: ManagedNpmPackageId, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onInstallSelected: () => void;
  onRunOperation: (packageId: ManagedNpmPackageId, action: 'install' | 'uninstall') => void;
}

export function NpmPackageTable({
  packages,
  selectedPackageIds,
  selectablePackageIds,
  selectAllChecked,
  selectedEligibleCount,
  batchSyncPackageIds,
  progressByPackageId,
  activeOperation,
  operationErrorByPackageId,
  hagiscriptGateOpen,
  actionsDisabled,
  dependencyGateMessage,
  onTogglePackage,
  onToggleAll,
  onInstallSelected,
  onRunOperation,
}: NpmPackageTableProps) {
  const { t } = useTranslation('common');

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{t('dependencyManagement.packageTable.title')}</CardTitle>
            <CardDescription>{t('dependencyManagement.packageTable.description')}</CardDescription>
          </div>
          <Button onClick={onInstallSelected} disabled={!hagiscriptGateOpen || actionsDisabled || selectedEligibleCount === 0}>
            <PackageOpen className="mr-2 h-4 w-4" />
            {t('dependencyManagement.actions.installSelected')}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('dependencyManagement.selection.selectedCount', { count: selectedEligibleCount })}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hagiscriptGateOpen && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{dependencyGateMessage}</AlertDescription>
          </Alert>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectAllChecked}
                  onCheckedChange={(checked) => onToggleAll(checked === true)}
                  disabled={!hagiscriptGateOpen || actionsDisabled || selectablePackageIds.length === 0}
                  aria-label={t('dependencyManagement.selection.selectAll')}
                />
              </TableHead>
              <TableHead>{t('dependencyManagement.packageTable.tool')}</TableHead>
              <TableHead>{t('dependencyManagement.package.category')}</TableHead>
              <TableHead>{t('dependencyManagement.package.version')}</TableHead>
              <TableHead>{t('dependencyManagement.package.packageName')}</TableHead>
              <TableHead className="text-right">{t('dependencyManagement.packageTable.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.map((item) => {
              const usesBatchSyncPanel = batchSyncPackageIds.has(item.id);
              const itemProgress = usesBatchSyncPanel
                ? undefined
                : progressByPackageId[item.id] ?? (activeOperation?.packageId === item.id ? activeOperation : undefined);
              const isActive = isOperationActive(itemProgress);
              const rowDisabled = actionsDisabled || !hagiscriptGateOpen || item.status === 'unknown';
              const canUninstall = item.status === 'installed' && item.definition.required !== true;
              const error = usesBatchSyncPanel
                ? undefined
                : operationErrorByPackageId[item.id] ?? (item.status === 'unknown' ? item.message : undefined);
              const disabledReason = !hagiscriptGateOpen ? dependencyGateMessage : item.status === 'unknown' ? t('dependencyManagement.disabled.unknown') : undefined;

              return (
                <TableRow
                  key={item.id}
                  data-state={selectedPackageIds.includes(item.id) ? 'selected' : undefined}
                  className={cn(managedPackageRowClassName(item.status), selectedPackageIds.includes(item.id) && 'ring-1 ring-primary/30')}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedPackageIds.includes(item.id)}
                      onCheckedChange={(checked) => onTogglePackage(item.id, checked === true)}
                      disabled={rowDisabled}
                      aria-label={t('dependencyManagement.selection.selectPackage', { name: item.definition.displayName })}
                      aria-describedby={disabledReason ? `${item.id}-disabled-reason` : undefined}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{item.definition.displayName}</div>
                    <div className="text-xs text-muted-foreground">{t(item.definition.descriptionKey)}</div>
                    {disabledReason && <div id={`${item.id}-disabled-reason`} className="sr-only">{disabledReason}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t(`dependencyManagement.categories.${item.definition.category}`)}</Badge>
                  </TableCell>
                  <TableCell>{item.version ?? t('dependencyManagement.unavailable')}</TableCell>
                  <TableCell className="max-w-[220px] break-all text-muted-foreground">{item.definition.packageName}</TableCell>
                  <TableCell className="space-y-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => onRunOperation(item.id, 'install')} disabled={rowDisabled}>
                        {isActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageOpen className="mr-2 h-4 w-4" />}
                        {item.status === 'installed' ? t('dependencyManagement.actions.reinstall') : t('dependencyManagement.actions.install')}
                      </Button>
                      {canUninstall && (
                        <Button size="sm" variant="outline" onClick={() => onRunOperation(item.id, 'uninstall')} disabled={rowDisabled}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('dependencyManagement.actions.uninstall')}
                        </Button>
                      )}
                    </div>
                    {isActive && (
                      <div className="min-w-48 space-y-1 text-left text-xs text-muted-foreground">
                        <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />{itemProgress?.message}</div>
                        <Progress value={itemProgress?.percentage ?? 20} />
                      </div>
                    )}
                    {itemProgress?.stage === 'completed' && (
                      <div className="flex items-center justify-end gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        {itemProgress.message}
                      </div>
                    )}
                    {error && <div className="text-left text-xs text-destructive">{error}</div>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function BatchSyncLogPanel({ batchSyncState }: { batchSyncState: BatchSyncState }) {
  const { t } = useTranslation('common');
  const statusVariant = batchSyncState.status === 'failed'
    ? 'destructive'
    : batchSyncState.status === 'completed'
      ? 'default'
      : 'secondary';

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{t('dependencyManagement.batchLog.title')}</CardTitle>
            <CardDescription>
              {t('dependencyManagement.batchLog.description', { count: batchSyncState.packageIds.length })}
            </CardDescription>
          </div>
          <Badge variant={statusVariant}>{t(`dependencyManagement.batchLog.status.${batchSyncState.status}`)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-h-72 overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-5">
          {batchSyncState.logs.length > 0 ? (
            batchSyncState.logs.map((entry) => (
              <div key={`${entry.timestamp}-${entry.stage}-${entry.message}`} className="whitespace-pre-wrap break-words">
                [{new Date(entry.timestamp).toLocaleTimeString()}] {entry.message}
              </div>
            ))
          ) : (
            <p className="font-sans text-sm text-muted-foreground">{t('dependencyManagement.batchLog.empty')}</p>
          )}
        </div>

        {batchSyncState.status === 'completed' && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            {t('dependencyManagement.batchLog.completed')}
          </div>
        )}

        {batchSyncState.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{batchSyncState.error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
