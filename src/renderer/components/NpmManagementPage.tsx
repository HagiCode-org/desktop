import { useEffect, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Gauge, Loader2, PackageOpen, RefreshCw } from 'lucide-react';
import type {
  ManagedNpmPackageId,
  NpmManagementBridge,
  NpmManagementOperationProgress,
  NpmManagementSnapshot,
} from '../../types/npm-management.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  appendBatchSyncLog,
  getSelectablePackageIds,
  getSelectAllChecked,
  getSelectedEligiblePackageIds,
  isBatchSyncEvent,
  type BatchSyncState,
  updateSelectAllPackageIds,
  updateSelectedPackageIds,
} from './npm-management/npmManagementPageModel';
import { BatchSyncLogPanel, NpmPackageBootstrapCard, NpmPackageTable } from './npm-management/NpmPackageGroups';

type PageStatus = 'loading' | 'ready' | 'error';

const NPM_MIRROR_REGISTRY_URL = 'https://registry.npmmirror.com/';

function getNpmManagementBridge(): NpmManagementBridge {
  return (window as Window & {
    electronAPI: {
      npmManagement: NpmManagementBridge;
    };
  }).electronAPI.npmManagement;
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

        return appendBatchSyncLog(current, event);
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
  const selectablePackageIds = getSelectablePackageIds(managedPackages, { hagiscriptGateOpen, actionsDisabled });
  const selectedEligibleIds = getSelectedEligiblePackageIds(selectedPackageIds, selectablePackageIds);
  const selectAllChecked = getSelectAllChecked(selectedPackageIds, selectablePackageIds);
  const batchSyncPackageIds = new Set(batchSyncState?.packageIds ?? []);
  const shouldPromoteHagiscriptCard = Boolean(hagiscript && !hagiscriptGateOpen);

  const togglePackageSelection = (packageId: ManagedNpmPackageId, checked: boolean) => {
    setSelectedPackageIds((current) => updateSelectedPackageIds(current, packageId, checked));
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedPackageIds((current) => updateSelectAllPackageIds(current, selectablePackageIds, checked));
  };

  const hagiscriptCard = hagiscript ? (
    <NpmPackageBootstrapCard
      item={hagiscript}
      progress={progress[hagiscript.id]}
      error={operationError[hagiscript.id] ?? (hagiscript.status === 'unknown' ? hagiscript.message : undefined)}
      actionsDisabled={actionsDisabled}
      refreshDisabled={pageStatus === 'loading' || isPending}
      onInstall={(packageId) => void runOperation(packageId, 'install')}
      onRefresh={() => void refreshSnapshot()}
    />
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

          <NpmPackageTable
            packages={managedPackages}
            selectedPackageIds={selectedPackageIds}
            selectablePackageIds={selectablePackageIds}
            selectAllChecked={selectAllChecked}
            selectedEligibleCount={selectedEligibleIds.length}
            batchSyncPackageIds={batchSyncPackageIds}
            progressByPackageId={progress}
            activeOperation={snapshot.activeOperation}
            operationErrorByPackageId={operationError}
            hagiscriptGateOpen={hagiscriptGateOpen}
            actionsDisabled={actionsDisabled}
            dependencyGateMessage={dependencyGateMessage}
            onTogglePackage={togglePackageSelection}
            onToggleAll={toggleSelectAll}
            onInstallSelected={() => void runBatchInstall()}
            onRunOperation={(packageId, action) => void runOperation(packageId, action)}
          />

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
                <p className="mt-2 text-sm text-muted-foreground">{t('npmManagement.environment.managedNotice')}</p>
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
