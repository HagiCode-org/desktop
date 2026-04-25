import { useEffect, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Gauge, Loader2, PackageOpen, RefreshCw, Trash2 } from 'lucide-react';
import type {
  ManagedNpmPackageId,
  ManagedNpmPackageStatusSnapshot,
  NpmManagementBridge,
  NpmManagementOperationProgress,
  NpmManagementSnapshot,
} from '../../types/npm-management.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type PageStatus = 'loading' | 'ready' | 'error';
type BatchSyncStatus = 'running' | 'completed' | 'failed';

interface BatchSyncLogEntry {
  timestamp: string;
  stage: NpmManagementOperationProgress['stage'];
  message: string;
  percentage?: number;
}

interface BatchSyncState {
  packageIds: ManagedNpmPackageId[];
  status: BatchSyncStatus;
  logs: BatchSyncLogEntry[];
  error?: string;
}

const NPM_MIRROR_REGISTRY_URL = 'https://registry.npmmirror.com/';

function getNpmManagementBridge(): NpmManagementBridge {
  return (window as Window & {
    electronAPI: {
      npmManagement: NpmManagementBridge;
    };
  }).electronAPI.npmManagement;
}

function packageBadgeVariant(status: ManagedNpmPackageStatusSnapshot['status']) {
  if (status === 'installed') {
    return 'default' as const;
  }
  if (status === 'unknown') {
    return 'destructive' as const;
  }
  return 'secondary' as const;
}

function isOperationActive(progress?: NpmManagementOperationProgress): boolean {
  return progress?.stage === 'started' || progress?.stage === 'output';
}

function buildBatchSyncLogKey(entry: Pick<BatchSyncLogEntry, 'stage' | 'message' | 'percentage'>): string {
  return `${entry.stage}:${entry.message}:${entry.percentage ?? ''}`;
}

function isBatchSyncEvent(batchSyncState: BatchSyncState | null, event: NpmManagementOperationProgress): boolean {
  return Boolean(
    batchSyncState
    && event.operation === 'sync'
    && batchSyncState.packageIds.includes(event.packageId),
  );
}

function managedPackageRowClassName(status: ManagedNpmPackageStatusSnapshot['status']): string {
  return status === 'installed'
    ? 'bg-emerald-500/10 hover:bg-emerald-500/15'
    : 'bg-red-500/10 hover:bg-red-500/15';
}

export default function NpmManagementPage() {
  const { t } = useTranslation('common');
  const [snapshot, setSnapshot] = useState<NpmManagementSnapshot | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<Partial<Record<ManagedNpmPackageId, NpmManagementOperationProgress>>>({});
  const [operationError, setOperationError] = useState<Partial<Record<ManagedNpmPackageId, string>>>({});
  const [selectedPackageIds, setSelectedPackageIds] = useState<ManagedNpmPackageId[]>([]);
  const [batchSyncState, setBatchSyncState] = useState<BatchSyncState | null>(null);
  const [mirrorSaveError, setMirrorSaveError] = useState<string | null>(null);
  const [isSavingMirrorSettings, setIsSavingMirrorSettings] = useState(false);
  const [isPending, startTransition] = useTransition();

  const refreshSnapshot = async () => {
    setErrorMessage(null);
    try {
      const nextSnapshot = await getNpmManagementBridge().refresh();
      startTransition(() => {
        setSnapshot(nextSnapshot);
        setPageStatus('ready');
      });
    } catch (error) {
      setPageStatus('error');
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    let disposed = false;

    const loadSnapshot = async () => {
      try {
        const initial = await getNpmManagementBridge().getSnapshot();
        if (!disposed) {
          setSnapshot(initial);
          setPageStatus('ready');
        }
      } catch (error) {
        if (!disposed) {
          setPageStatus('error');
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      }
    };

    const unsubscribe = getNpmManagementBridge().onProgress((event) => {
      setProgress((current) => ({ ...current, [event.packageId]: event }));
      setBatchSyncState((current) => {
        if (!isBatchSyncEvent(current, event)) {
          return current;
        }

        const nextEntry: BatchSyncLogEntry = {
          timestamp: event.timestamp,
          stage: event.stage,
          message: event.message,
          percentage: event.percentage,
        };
        const lastEntry = current.logs[current.logs.length - 1];
        const nextLogs = lastEntry && buildBatchSyncLogKey(lastEntry) === buildBatchSyncLogKey(nextEntry)
          ? current.logs
          : [...current.logs, nextEntry];

        return {
          ...current,
          logs: nextLogs,
          status: event.stage === 'failed' ? 'failed' : current.status,
          error: event.stage === 'failed' ? event.message : current.error,
        };
      });
      if (event.stage === 'failed') {
        setOperationError((current) => ({ ...current, [event.packageId]: event.message }));
      }
      if (event.stage === 'completed') {
        setOperationError((current) => ({ ...current, [event.packageId]: undefined }));
      }
    });

    void loadSnapshot();

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const visibleIds = new Set(snapshot.packages.map((item) => item.id));
    setSelectedPackageIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [snapshot]);

  const runOperation = async (packageId: ManagedNpmPackageId, action: 'install' | 'uninstall') => {
    setOperationError((current) => ({ ...current, [packageId]: undefined }));
    try {
      const result = action === 'install'
        ? await getNpmManagementBridge().install(packageId)
        : await getNpmManagementBridge().uninstall(packageId);
      setSnapshot(result.snapshot);
      if (!result.success) {
        setOperationError((current) => ({ ...current, [packageId]: result.error ?? t('npmManagement.errors.operationFailed') }));
      }
    } catch (error) {
      setOperationError((current) => ({
        ...current,
        [packageId]: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const runBatchInstall = async () => {
    const packageIds = selectedPackageIds;
    if (packageIds.length === 0) {
      return;
    }

    setBatchSyncState({
      packageIds,
      status: 'running',
      logs: [],
    });
    setOperationError((current) => {
      const next = { ...current };
      for (const packageId of packageIds) {
        next[packageId] = undefined;
      }
      return next;
    });

    try {
      const result = await getNpmManagementBridge().syncPackages({ packageIds });
      setSnapshot(result.snapshot);
      if (result.success) {
        setBatchSyncState((current) => current && current.packageIds.every((id) => packageIds.includes(id))
          ? { ...current, status: 'completed', error: undefined }
          : current);
        setSelectedPackageIds([]);
        return;
      }

      setBatchSyncState((current) => current && current.packageIds.every((id) => packageIds.includes(id))
        ? { ...current, status: 'failed', error: result.error ?? t('npmManagement.errors.operationFailed') }
        : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBatchSyncState((current) => current && current.packageIds.every((id) => packageIds.includes(id))
        ? { ...current, status: 'failed', error: message }
        : current);
    }
  };

  const updateMirrorSettings = async (enabled: boolean) => {
    if (!snapshot) {
      return;
    }

    const previousSnapshot = snapshot;
    setMirrorSaveError(null);
    setIsSavingMirrorSettings(true);
    setSnapshot({
      ...snapshot,
      mirrorSettings: {
        enabled,
        registryUrl: enabled ? NPM_MIRROR_REGISTRY_URL : null,
      },
    });

    try {
      const nextSnapshot = await getNpmManagementBridge().setMirrorSettings({ enabled });
      setSnapshot(nextSnapshot);
    } catch (error) {
      setSnapshot(previousSnapshot);
      setMirrorSaveError(error instanceof Error ? error.message : t('npmManagement.mirror.saveFailed'));
    } finally {
      setIsSavingMirrorSettings(false);
    }
  };

  const hagiscript = snapshot?.packages.find((item) => item.id === 'hagiscript');
  const managedPackages = snapshot?.packages.filter((item) => item.id !== 'hagiscript') ?? [];
  const activePackageId = snapshot?.activeOperation?.packageId;
  const environmentAvailable = snapshot?.environment.available ?? false;
  const actionsDisabled = !environmentAvailable || isPending || Boolean(activePackageId);
  const mirrorToggleDisabled = isSavingMirrorSettings || Boolean(activePackageId);
  const mirrorRegistryUrl = snapshot?.mirrorSettings.registryUrl ?? NPM_MIRROR_REGISTRY_URL;
  const hagiscriptGateOpen = hagiscript?.status === 'installed' && Boolean(hagiscript.executablePath);
  const dependencyGateMessage = hagiscript?.status === 'unknown'
    ? t('npmManagement.dependencyGate.unknown')
    : t('npmManagement.dependencyGate.missing');
  const selectablePackageIds = managedPackages
    .filter((item) => hagiscriptGateOpen && !actionsDisabled && item.status !== 'unknown')
    .map((item) => item.id);
  const selectedEligibleIds = selectedPackageIds.filter((id) => selectablePackageIds.includes(id));
  const allEligibleSelected = selectablePackageIds.length > 0 && selectablePackageIds.every((id) => selectedPackageIds.includes(id));
  const selectAllChecked = allEligibleSelected ? true : selectedEligibleIds.length > 0 ? 'indeterminate' : false;
  const batchSyncPackageIds = new Set(batchSyncState?.packageIds ?? []);
  const shouldPromoteHagiscriptCard = Boolean(hagiscript && !hagiscriptGateOpen);

  const togglePackageSelection = (packageId: ManagedNpmPackageId, checked: boolean) => {
    setSelectedPackageIds((current) => checked
      ? Array.from(new Set([...current, packageId]))
      : current.filter((id) => id !== packageId));
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedPackageIds((current) => {
      const currentWithoutEligible = current.filter((id) => !selectablePackageIds.includes(id));
      return checked ? [...currentWithoutEligible, ...selectablePackageIds] : currentWithoutEligible;
    });
  };

  const hagiscriptCard = hagiscript ? (
    <Card className="border-primary/40">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{t('npmManagement.bootstrap.title')}: {hagiscript.definition.displayName}</CardTitle>
            <CardDescription>{t(hagiscript.definition.descriptionKey)}</CardDescription>
          </div>
          <Badge variant={packageBadgeVariant(hagiscript.status)}>
            {t(`npmManagement.packageStatus.${hagiscript.status}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <PackageDetails item={hagiscript} />
        <PackageProgress item={hagiscript} progress={progress[hagiscript.id]} error={operationError[hagiscript.id] ?? (hagiscript.status === 'unknown' ? hagiscript.message : undefined)} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void runOperation(hagiscript.id, 'install')} disabled={actionsDisabled}>
            {isOperationActive(progress[hagiscript.id]) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageOpen className="mr-2 h-4 w-4" />}
            {hagiscript.status === 'installed' ? t('npmManagement.actions.reinstall') : t('npmManagement.actions.install')}
          </Button>
          <Button variant="outline" onClick={() => void refreshSnapshot()} disabled={pageStatus === 'loading' || isPending}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('npmManagement.actions.refresh')}
          </Button>
        </div>
      </CardContent>
    </Card>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card className="border-border/80 shadow-md">
        <CardHeader className="gap-4 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2">
                <PackageOpen className="h-5 w-5" />
                {t('npmManagement.title')}
              </CardTitle>
              <CardDescription>{t('npmManagement.description')}</CardDescription>
            </div>
            <Button variant="outline" onClick={() => void refreshSnapshot()} disabled={pageStatus === 'loading' || isPending}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('npmManagement.actions.refresh')}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {pageStatus === 'loading' && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t('npmManagement.loading')}
          </CardContent>
        </Card>
      )}

      {pageStatus === 'error' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('npmManagement.errors.loadFailed')}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {pageStatus === 'ready' && snapshot && (
        <>
          {shouldPromoteHagiscriptCard && hagiscriptCard}

          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{t('npmManagement.packageTable.title')}</CardTitle>
                  <CardDescription>{t('npmManagement.packageTable.description')}</CardDescription>
                </div>
                <Button onClick={() => void runBatchInstall()} disabled={!hagiscriptGateOpen || actionsDisabled || selectedEligibleIds.length === 0}>
                  <PackageOpen className="mr-2 h-4 w-4" />
                  {t('npmManagement.actions.installSelected')}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {t('npmManagement.selection.selectedCount', { count: selectedEligibleIds.length })}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!hagiscriptGateOpen && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t('npmManagement.dependencyGate.title')}</AlertTitle>
                  <AlertDescription>{dependencyGateMessage}</AlertDescription>
                </Alert>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectAllChecked}
                        onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                        disabled={!hagiscriptGateOpen || actionsDisabled || selectablePackageIds.length === 0}
                        aria-label={t('npmManagement.selection.selectAll')}
                      />
                    </TableHead>
                    <TableHead>{t('npmManagement.packageTable.tool')}</TableHead>
                    <TableHead>{t('npmManagement.package.category')}</TableHead>
                    <TableHead>{t('npmManagement.package.version')}</TableHead>
                    <TableHead>{t('npmManagement.package.packageName')}</TableHead>
                    <TableHead className="text-right">{t('npmManagement.packageTable.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {managedPackages.map((item) => {
                    const usesBatchSyncPanel = batchSyncPackageIds.has(item.id);
                    const itemProgress = usesBatchSyncPanel
                      ? undefined
                      : progress[item.id] ?? (snapshot.activeOperation?.packageId === item.id ? snapshot.activeOperation : undefined);
                    const isActive = isOperationActive(itemProgress);
                    const rowDisabled = actionsDisabled || !hagiscriptGateOpen || item.status === 'unknown';
                    const canUninstall = item.status === 'installed' && item.definition.required !== true;
                    const error = usesBatchSyncPanel
                      ? undefined
                      : operationError[item.id] ?? (item.status === 'unknown' ? item.message : undefined);
                    const disabledReason = !hagiscriptGateOpen ? dependencyGateMessage : item.status === 'unknown' ? t('npmManagement.disabled.unknown') : undefined;

                    return (
                      <TableRow
                        key={item.id}
                        data-state={selectedPackageIds.includes(item.id) ? 'selected' : undefined}
                        className={cn(managedPackageRowClassName(item.status), selectedPackageIds.includes(item.id) && 'ring-1 ring-primary/30')}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedPackageIds.includes(item.id)}
                            onCheckedChange={(checked) => togglePackageSelection(item.id, checked === true)}
                            disabled={rowDisabled}
                            aria-label={t('npmManagement.selection.selectPackage', { name: item.definition.displayName })}
                            aria-describedby={disabledReason ? `${item.id}-disabled-reason` : undefined}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{item.definition.displayName}</div>
                          <div className="text-xs text-muted-foreground">{t(item.definition.descriptionKey)}</div>
                          {disabledReason && <div id={`${item.id}-disabled-reason`} className="sr-only">{disabledReason}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{t(`npmManagement.categories.${item.definition.category}`)}</Badge>
                        </TableCell>
                        <TableCell>{item.version ?? t('npmManagement.unavailable')}</TableCell>
                        <TableCell className="max-w-[220px] break-all text-muted-foreground">{item.definition.packageName}</TableCell>
                        <TableCell className="space-y-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => void runOperation(item.id, 'install')} disabled={rowDisabled}>
                              {isActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageOpen className="mr-2 h-4 w-4" />}
                              {item.status === 'installed' ? t('npmManagement.actions.reinstall') : t('npmManagement.actions.install')}
                            </Button>
                            {canUninstall && (
                              <Button size="sm" variant="outline" onClick={() => void runOperation(item.id, 'uninstall')} disabled={rowDisabled}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t('npmManagement.actions.uninstall')}
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

          {batchSyncState && (
            <BatchSyncLogPanel batchSyncState={batchSyncState} />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gauge className="h-5 w-5" />
                {t('npmManagement.environment.title')}
              </CardTitle>
              <CardDescription>{t('npmManagement.environment.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium">{t('npmManagement.environment.rationaleTitle')}</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>{t('npmManagement.environment.rationale.fixedRuntime')}</li>
                  <li>{t('npmManagement.environment.rationale.isolatedConfig')}</li>
                  <li>{t('npmManagement.environment.rationale.nonIntrusive')}</li>
                </ul>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
              {(['node', 'npm'] as const).map((component) => {
                const item = snapshot.environment[component];
                return (
                  <div key={component} className="rounded-lg border p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="font-medium uppercase">{component}</span>
                      <Badge variant={item.status === 'available' ? 'default' : 'destructive'}>
                        {t(`npmManagement.environment.status.${item.status}`)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{t('npmManagement.environment.version')}: {item.version ?? t('npmManagement.unavailable')}</p>
                    <p className="break-all text-sm text-muted-foreground">{item.executablePath}</p>
                    {item.message && <p className="mt-2 text-sm text-destructive">{item.message}</p>}
                  </div>
                );
              })}
              <div className="rounded-lg border p-4 md:col-span-2">
                <p className="text-sm font-medium">{t('npmManagement.environment.toolchainRoot')}</p>
                <p className="break-all text-sm text-muted-foreground">{snapshot.environment.toolchainRoot}</p>
                <p className="mt-3 text-sm font-medium">{t('npmManagement.environment.globalPrefix')}</p>
                <p className="break-all text-sm text-muted-foreground">{snapshot.environment.npmGlobalPrefix}</p>
              </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('npmManagement.mirror.title')}</CardTitle>
              <CardDescription>{t('npmManagement.mirror.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t('npmManagement.mirror.toggleLabel')}</span>
                    <Badge variant={snapshot.mirrorSettings.enabled ? 'default' : 'secondary'}>
                      {isSavingMirrorSettings
                        ? t('npmManagement.mirror.saving')
                        : snapshot.mirrorSettings.enabled
                          ? t('npmManagement.mirror.enabled')
                          : t('npmManagement.mirror.disabled')}
                    </Badge>
                  </div>
                  <p className="break-all text-sm text-muted-foreground">
                    {t('npmManagement.mirror.registryUrl')}: {mirrorRegistryUrl}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {snapshot.mirrorSettings.enabled
                      ? t('npmManagement.mirror.enabledHelp')
                      : t('npmManagement.mirror.disabledHelp')}
                  </p>
                </div>
                <Switch
                  checked={snapshot.mirrorSettings.enabled}
                  onCheckedChange={(enabled) => void updateMirrorSettings(enabled)}
                  disabled={mirrorToggleDisabled}
                  aria-label={t('npmManagement.mirror.toggleLabel')}
                />
              </div>

              {mirrorSaveError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t('npmManagement.mirror.saveFailed')}</AlertTitle>
                  <AlertDescription>{mirrorSaveError}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {!shouldPromoteHagiscriptCard && hagiscriptCard}
        </>
      )}
    </div>
  );
}

function PackageDetails({ item }: { item: ManagedNpmPackageStatusSnapshot }) {
  const { t } = useTranslation('common');

  return (
    <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
      <p>{t('npmManagement.package.version')}: {item.version ?? t('npmManagement.unavailable')}</p>
      <p>{t('npmManagement.package.category')}: {t(`npmManagement.categories.${item.definition.category}`)}</p>
      <p className="break-all sm:col-span-2">{t('npmManagement.package.packageName')}: {item.definition.packageName}</p>
    </div>
  );
}

function PackageProgress({
  item,
  progress,
  error,
}: {
  item: ManagedNpmPackageStatusSnapshot;
  progress?: NpmManagementOperationProgress;
  error?: string;
}) {
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

function BatchSyncLogPanel({ batchSyncState }: { batchSyncState: BatchSyncState }) {
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
            <CardTitle className="text-lg">{t('npmManagement.batchLog.title')}</CardTitle>
            <CardDescription>
              {t('npmManagement.batchLog.description', { count: batchSyncState.packageIds.length })}
            </CardDescription>
          </div>
          <Badge variant={statusVariant}>{t(`npmManagement.batchLog.status.${batchSyncState.status}`)}</Badge>
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
            <p className="font-sans text-sm text-muted-foreground">{t('npmManagement.batchLog.empty')}</p>
          )}
        </div>

        {batchSyncState.status === 'completed' && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            {t('npmManagement.batchLog.completed')}
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
