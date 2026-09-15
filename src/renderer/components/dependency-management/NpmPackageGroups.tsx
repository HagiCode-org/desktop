import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ExternalLink,
  FolderOpen,
  Loader2,
  PackageOpen,
  Play,
  RefreshCw,
  Square,
  Wrench,
} from 'lucide-react';
import type {
  ManagedNpmPackageStatusSnapshot,
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
import { buildManagedPackageGlobalInstallCommand } from '../../../shared/npm-managed-packages.js';
import {
  getManagedPackageDisplayStatus,
  getManagedPackageRequiredVersion,
  isManagedPackageOutdated,
  managedPackageRowClassName,
  packageBadgeVariant,
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
  refreshLoading?: boolean;
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
  refreshLoading = false,
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
            <RefreshCw className={cn('mr-2 h-4 w-4', refreshLoading && 'animate-spin')} />
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

interface NpmPackageTableProps {
  titleKey?: string;
  descriptionKey?: string;
  packages: ManagedNpmPackageStatusSnapshot[];
  highlightedPackageIds?: string[];
  showSuggestedCommand?: boolean;
  suggestedCommandRegistryUrl?: string | null;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function NpmPackageTable({
  titleKey = 'dependencyManagement.packageTable.title',
  descriptionKey = 'dependencyManagement.packageTable.description',
  packages,
  highlightedPackageIds = [],
  showSuggestedCommand = true,
  suggestedCommandRegistryUrl = null,
  selectedIds,
  onSelectionChange,
}: NpmPackageTableProps) {
  const { t } = useTranslation(['common', 'pages']);
  const highlightedPackageIdSet = new Set(highlightedPackageIds);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{t(titleKey)}</CardTitle>
            <CardDescription>{t(descriptionKey)}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead className="min-w-[240px]">{t('dependencyManagement.packageTable.tool')}</TableHead>
              <TableHead>{t('dependencyManagement.package.category')}</TableHead>
              <TableHead>{t('dependencyManagement.package.version')}</TableHead>
              <TableHead className="min-w-[220px]">{t('dependencyManagement.package.packageName')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.map((item) => {
              const isHighlighted = highlightedPackageIdSet.has(item.id);
              const displayStatus = getManagedPackageDisplayStatus(item);
              const requiredVersion = getManagedPackageRequiredVersion(item);
              const globalInstallCommand = buildManagedPackageGlobalInstallCommand(
                item.definition,
                suggestedCommandRegistryUrl,
              );

              return (
                <TableRow
                  key={item.id}
                  className={cn(
                    managedPackageRowClassName(item),
                    isHighlighted && 'ring-1 ring-inset ring-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15',
                  )}
                >
                  <TableCell className="align-top">
                    <Checkbox
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={(checked) => {
                        const nextIds = checked
                          ? [...selectedIds, item.id]
                          : selectedIds.filter((id) => id !== item.id);
                        onSelectionChange(nextIds);
                      }}
                      aria-label={item.definition.displayName}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{item.definition.displayName}</div>
                      {item.definition.required === true ? (
                        <Badge variant="outline" title={t('dependencyManagement.batch.requiredLabel')}>
                          ★ {t('dependencyManagement.batch.requiredLabel')}
                        </Badge>
                      ) : null}
                      <Badge variant={packageBadgeVariant(item)}>
                        {t(`dependencyManagement.packageStatus.${displayStatus}`)}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{t(item.definition.descriptionKey)}</div>
                    {showSuggestedCommand ? (
                      <div className="mt-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-left">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {t('dependencyManagement.details.manualCommand', { ns: 'pages' })}
                        </div>
                        <code className="mt-1 block break-all font-mono text-xs text-foreground">{globalInstallCommand}</code>
                      </div>
                    ) : null}
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
