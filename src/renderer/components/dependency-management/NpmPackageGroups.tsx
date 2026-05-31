import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Loader2,
  PackageOpen,
  Play,
  RefreshCw,
  Square,
  Trash2,
  Wrench,
} from 'lucide-react';
import type {
  ManagedNpmPackageId,
  ManagedNpmPackageStatusSnapshot,
  DependencyManagementOperationProgress,
  VendoredRuntimeLifecycleAction,
  VendoredRuntimeStatusSnapshot,
} from '../../../types/dependency-management.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  getManagedPackageActionKey,
  getManagedPackageDisplayStatus,
  getManagedPackageRequiredVersion,
  isOperationActive,
  isManagedPackageOutdated,
  managedPackageRowClassName,
  packageBadgeVariant,
  type BatchSyncState,
} from './dependencyManagementPageModel';

function vendoredRuntimeBadgeVariant(item: VendoredRuntimeStatusSnapshot): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (item.installStatus === 'installed') {
    return 'default';
  }
  if (item.installStatus === 'packaged') {
    return 'secondary';
  }
  if (item.installStatus === 'not-installed' || item.installStatus === 'removed') {
    return 'outline';
  }
  return 'destructive';
}

function getVendoredRuntimePrimaryLabel(item: VendoredRuntimeStatusSnapshot): string {
  if (item.primaryAction === 'enable') {
    return 'dependencyManagement.vendoredRuntime.actions.enable';
  }
  if (item.primaryAction === 'start') {
    return 'dependencyManagement.vendoredRuntime.actions.start';
  }
  if (item.primaryAction === 'stop') {
    return 'dependencyManagement.vendoredRuntime.actions.stop';
  }
  if (item.primaryAction === 'repair') {
    return 'dependencyManagement.vendoredRuntime.actions.repair';
  }
  return 'dependencyManagement.vendoredRuntime.actions.reinstallDesktop';
}

function getVendoredRuntimePrimaryIcon(item: VendoredRuntimeStatusSnapshot) {
  if (item.primaryAction === 'enable') {
    return PackageOpen;
  }
  if (item.primaryAction === 'start') {
    return Play;
  }
  if (item.primaryAction === 'stop') {
    return Square;
  }
  if (item.primaryAction === 'repair') {
    return Wrench;
  }
  return RefreshCw;
}

interface VendoredRuntimeCardProps {
  item: VendoredRuntimeStatusSnapshot;
  highlighted?: boolean;
  pendingAction: VendoredRuntimeLifecycleAction | null;
  error?: string | null;
  refreshDisabled: boolean;
  onPrimaryAction: (item: VendoredRuntimeStatusSnapshot) => void;
  onRestart: (runtimeId: VendoredRuntimeStatusSnapshot['id']) => void;
  onRefresh: () => void;
  onOpenLogs: (runtimeId: VendoredRuntimeStatusSnapshot['id']) => void;
  onOpenRuntimeRoot: (runtimeId: VendoredRuntimeStatusSnapshot['id']) => void;
  onOpenUrl?: (url: string) => void;
}

export function VendoredRuntimeCard({
  item,
  highlighted = false,
  pendingAction,
  error,
  refreshDisabled,
  onPrimaryAction,
  onRestart,
  onRefresh,
  onOpenLogs,
  onOpenRuntimeRoot,
  onOpenUrl,
}: VendoredRuntimeCardProps) {
  const { t } = useTranslation('common');
  const PrimaryIcon = getVendoredRuntimePrimaryIcon(item);
  const activationInProgress = item.status === 'extracting';
  const isActionRunning = pendingAction !== null || activationInProgress;
  const primaryActionDisabled = item.primaryAction === 'reinstall-desktop' || item.primaryAction === 'none';
  const diagnostics = error ? [error, ...item.diagnostics] : item.diagnostics;

  return (
    <Card className={cn('border-border/80', highlighted && 'ring-1 ring-inset ring-amber-500/50 bg-amber-500/5')}>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg">{item.definition.displayName}</CardTitle>
            <CardDescription>{t(item.definition.descriptionKey)}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={vendoredRuntimeBadgeVariant(item)}>
              {t(`dependencyManagement.vendoredRuntime.installStatus.${item.installStatus}`)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <p>{t('dependencyManagement.package.version')}: {item.version ?? t('dependencyManagement.unavailable')}</p>
          <p>{t('dependencyManagement.vendoredRuntime.managedByDesktop')}</p>
          <p>{t('dependencyManagement.vendoredRuntime.runtimeState')}: {t(`dependencyManagement.vendoredRuntime.status.${item.status}`)}</p>
          <p className="break-all sm:col-span-2">{t('dependencyManagement.vendoredRuntime.runtimeRoot')}: {item.runtimeRoot}</p>
          <p className="break-all sm:col-span-2">{t('dependencyManagement.vendoredRuntime.packagedRoot')}: {item.packagedRoot}</p>
          {item.packagedArchivePath ? (
            <p className="break-all sm:col-span-2">{t('dependencyManagement.vendoredRuntime.packagedArchivePath')}: {item.packagedArchivePath}</p>
          ) : null}
          {item.packagedMarkerPath ? (
            <p className="break-all sm:col-span-2">{t('dependencyManagement.vendoredRuntime.packagedMarkerPath')}: {item.packagedMarkerPath}</p>
          ) : null}
          {item.metadataPath ? (
            <p className="break-all sm:col-span-2">{t('dependencyManagement.vendoredRuntime.metadataPath')}: {item.metadataPath}</p>
          ) : null}
          <p className="break-all sm:col-span-2">{t('dependencyManagement.vendoredRuntime.healthUrl')}: {item.health.url ?? t('dependencyManagement.unavailable')}</p>
        </div>

        <Alert className={item.installStatus === 'installed' ? 'border-emerald-500/30 bg-emerald-500/5' : undefined}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t(`dependencyManagement.vendoredRuntime.installStatus.${item.installStatus}`)}</AlertTitle>
          <AlertDescription>{item.message ?? t(`dependencyManagement.vendoredRuntime.primaryDescriptions.${item.installStatus}`)}</AlertDescription>
        </Alert>

        {item.activation && item.status === 'extracting' ? (
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>{t(`dependencyManagement.vendoredRuntime.activationStage.${item.activation.stage}`)}</span>
              <span>{item.activation.percentage ?? 0}%</span>
            </div>
            <Progress value={item.activation.percentage ?? 0} />
          </div>
        ) : null}

        {diagnostics.length > 0 ? (
          <Alert variant={item.installStatus === 'installed' ? 'default' : 'destructive'}>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('dependencyManagement.vendoredRuntime.diagnostics')}</AlertTitle>
            <AlertDescription>
              <div className="space-y-1">
                {diagnostics.slice(0, 4).map((diagnostic) => (
                  <p key={diagnostic}>{diagnostic}</p>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {item.primaryAction === 'reinstall-desktop' ? (
          <p className="text-sm text-muted-foreground">{t('dependencyManagement.vendoredRuntime.reinstallHint')}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onPrimaryAction(item)} disabled={refreshDisabled || isActionRunning || primaryActionDisabled}>
            {isActionRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PrimaryIcon className="mr-2 h-4 w-4" />}
            {t(getVendoredRuntimePrimaryLabel(item))}
          </Button>
          <Button variant="outline" onClick={() => onRestart(item.id)} disabled={refreshDisabled || isActionRunning || item.installStatus !== 'installed'}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('dependencyManagement.vendoredRuntime.actions.restart')}
          </Button>
          <Button variant="outline" onClick={() => onOpenLogs(item.id)} disabled={isActionRunning}>
            <FolderOpen className="mr-2 h-4 w-4" />
            {t('dependencyManagement.vendoredRuntime.actions.openLogs')}
          </Button>
          <Button variant="outline" onClick={() => onOpenRuntimeRoot(item.id)} disabled={isActionRunning}>
            <FolderOpen className="mr-2 h-4 w-4" />
            {t('dependencyManagement.vendoredRuntime.actions.openRuntimeRoot')}
          </Button>
          {item.health.url ? (
            <Button variant="outline" onClick={() => onOpenUrl?.(item.health.url)} disabled={!onOpenUrl || isActionRunning}>
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('dependencyManagement.vendoredRuntime.actions.openUrl')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onRefresh} disabled={refreshDisabled || isActionRunning}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('dependencyManagement.actions.refresh')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface PackageDetailsProps {
  item: ManagedNpmPackageStatusSnapshot;
}

export function PackageDetails({ item }: PackageDetailsProps) {
  const { t } = useTranslation('common');
  const requiredVersion = getManagedPackageRequiredVersion(item);
  const outdated = isManagedPackageOutdated(item);

  return (
    <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
      <p>{t('dependencyManagement.package.version')}: {item.version ?? t('dependencyManagement.unavailable')}</p>
      {requiredVersion ? <p>{t('dependencyManagement.package.requiredVersion')}: {requiredVersion}</p> : null}
      <p>{t('dependencyManagement.package.category')}: {t(`dependencyManagement.categories.${item.definition.category}`)}</p>
      <p className="break-all sm:col-span-2">{t('dependencyManagement.package.packageName')}: {item.definition.packageName}</p>
      {outdated ? (
        <p className="text-amber-700 dark:text-amber-300 sm:col-span-2">
          {t('dependencyManagement.package.versionMismatch', {
            current: item.version ?? t('dependencyManagement.unavailable'),
            required: requiredVersion ?? item.definition.installSpec,
          })}
        </p>
      ) : null}
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

interface NpmPackageTableProps {
  titleKey?: string;
  descriptionKey?: string;
  packages: ManagedNpmPackageStatusSnapshot[];
  highlightedPackageIds?: ManagedNpmPackageId[];
  selectedPackageIds: ManagedNpmPackageId[];
  selectablePackageIds: ManagedNpmPackageId[];
  selectAllChecked: boolean | 'indeterminate';
  selectedEligibleCount: number;
  batchSyncPackageIds: Set<ManagedNpmPackageId>;
  isBatchSyncRunning: boolean;
  progressByPackageId: Partial<Record<ManagedNpmPackageId, DependencyManagementOperationProgress>>;
  activeOperation?: DependencyManagementOperationProgress | null;
  operationErrorByPackageId: Partial<Record<ManagedNpmPackageId, string>>;
  actionsDisabled: boolean;
  onTogglePackage: (packageId: ManagedNpmPackageId, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onInstallSelected: () => void;
  onRunOperation: (packageId: ManagedNpmPackageId, action: 'install' | 'uninstall') => void;
}

export function NpmPackageTable({
  titleKey = 'dependencyManagement.packageTable.title',
  descriptionKey = 'dependencyManagement.packageTable.description',
  packages,
  highlightedPackageIds = [],
  selectedPackageIds,
  selectablePackageIds,
  selectAllChecked,
  selectedEligibleCount,
  batchSyncPackageIds,
  isBatchSyncRunning,
  progressByPackageId,
  activeOperation,
  operationErrorByPackageId,
  actionsDisabled,
  onTogglePackage,
  onToggleAll,
  onInstallSelected,
  onRunOperation,
}: NpmPackageTableProps) {
  const { t } = useTranslation('common');
  const highlightedPackageIdSet = new Set(highlightedPackageIds);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{t(titleKey)}</CardTitle>
            <CardDescription>{t(descriptionKey)}</CardDescription>
          </div>
          <Button onClick={onInstallSelected} disabled={actionsDisabled || isBatchSyncRunning || selectedEligibleCount === 0}>
            {isBatchSyncRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageOpen className="mr-2 h-4 w-4" />}
            {isBatchSyncRunning ? t('dependencyManagement.actions.installSelectedRunning') : t('dependencyManagement.actions.installSelected')}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('dependencyManagement.selection.selectedCount', { count: selectedEligibleCount })}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-20 px-3 text-center">
                <div className="flex justify-center">
                  <Checkbox
                    checked={selectAllChecked}
                    onCheckedChange={(checked) => onToggleAll(checked === true)}
                    disabled={actionsDisabled || selectablePackageIds.length === 0}
                    aria-label={t('dependencyManagement.selection.selectAll')}
                    className="h-6 w-6 rounded-md border-2 shadow-sm"
                  />
                </div>
              </TableHead>
              <TableHead className="min-w-[240px]">{t('dependencyManagement.packageTable.tool')}</TableHead>
              <TableHead>{t('dependencyManagement.package.category')}</TableHead>
              <TableHead>{t('dependencyManagement.package.version')}</TableHead>
              <TableHead className="min-w-[220px]">{t('dependencyManagement.package.packageName')}</TableHead>
              <TableHead className="min-w-[220px] text-right">{t('dependencyManagement.packageTable.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.map((item) => {
              const usesBatchSyncPanel = batchSyncPackageIds.has(item.id);
              const itemProgress = progressByPackageId[item.id]
                ?? (activeOperation?.packageId === item.id ? activeOperation : undefined);
              const isActive = isOperationActive(itemProgress);
              const isHighlighted = highlightedPackageIdSet.has(item.id);
              const displayStatus = getManagedPackageDisplayStatus(item);
              const actionKey = getManagedPackageActionKey(item);
              const requiredVersion = getManagedPackageRequiredVersion(item);
              const rowDisabled = actionsDisabled || item.status === 'unknown';
              const canUninstall = item.status === 'installed' && item.definition.required !== true;
              const error = usesBatchSyncPanel
                ? undefined
                : operationErrorByPackageId[item.id] ?? (item.status === 'unknown' ? item.message : undefined);
              const disabledReason = item.status === 'unknown' ? t('dependencyManagement.disabled.unknown') : undefined;

              return (
                <TableRow
                  key={item.id}
                  data-state={selectedPackageIds.includes(item.id) ? 'selected' : undefined}
                  className={cn(
                    managedPackageRowClassName(item),
                    isHighlighted && 'ring-1 ring-inset ring-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15',
                    selectedPackageIds.includes(item.id) && 'ring-1 ring-primary/30',
                  )}
                >
                  <TableCell className="w-20 px-3 align-top">
                    <div className="flex justify-center pt-1">
                      <Checkbox
                        checked={selectedPackageIds.includes(item.id)}
                        onCheckedChange={(checked) => onTogglePackage(item.id, checked === true)}
                        disabled={rowDisabled}
                        aria-label={t('dependencyManagement.selection.selectPackage', { name: item.definition.displayName })}
                        aria-describedby={disabledReason ? `${item.id}-disabled-reason` : undefined}
                        className="h-6 w-6 rounded-md border-2 shadow-sm"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{item.definition.displayName}</div>
                      <Badge variant={packageBadgeVariant(item)}>
                        {t(`dependencyManagement.packageStatus.${displayStatus}`)}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{t(item.definition.descriptionKey)}</div>
                    {disabledReason && <div id={`${item.id}-disabled-reason`} className="sr-only">{disabledReason}</div>}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="secondary">{t(`dependencyManagement.categories.${item.definition.category}`)}</Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    <div>{item.version ?? t('dependencyManagement.unavailable')}</div>
                    {displayStatus === 'outdated' ? (
                      <div className="text-xs text-amber-700 dark:text-amber-300">
                        {t('dependencyManagement.package.versionMismatch', {
                          current: item.version ?? t('dependencyManagement.unavailable'),
                          required: requiredVersion ?? item.definition.installSpec,
                        })}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[220px] break-all align-top text-muted-foreground">{item.definition.packageName}</TableCell>
                  <TableCell className="space-y-2 align-top text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => onRunOperation(item.id, 'install')} disabled={rowDisabled}>
                        {isActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageOpen className="mr-2 h-4 w-4" />}
                        {t(`dependencyManagement.actions.${actionKey}`)}
                      </Button>
                      {canUninstall && (
                        <Button size="sm" variant="outline" onClick={() => onRunOperation(item.id, 'uninstall')} disabled={rowDisabled}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('dependencyManagement.actions.uninstall')}
                        </Button>
                      )}
                    </div>
                    {!usesBatchSyncPanel && isActive && (
                      <div className="min-w-48 space-y-1 text-left text-xs text-muted-foreground">
                        <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />{itemProgress?.message}</div>
                        <Progress value={itemProgress?.percentage ?? 20} />
                      </div>
                    )}
                    {!usesBatchSyncPanel && itemProgress?.stage === 'completed' && (
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

export const BatchSyncLogPanel = forwardRef<HTMLDivElement, { batchSyncState: BatchSyncState }>(function BatchSyncLogPanel({ batchSyncState }, ref) {
  const { t } = useTranslation('common');
  const statusVariant = batchSyncState.status === 'failed'
    ? 'destructive'
    : batchSyncState.status === 'completed'
      ? 'default'
      : 'secondary';

  return (
    <Card ref={ref}>
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
});
