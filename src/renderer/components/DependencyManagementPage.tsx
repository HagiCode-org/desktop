import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ExternalLink, Gauge, Loader2, PackageOpen, RefreshCw } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type {
  ManagedNpmPackageId,
  DependencyManagementBridge,
  DependencyManagementOperationProgress,
  DependencyManagementSnapshot,
  VendoredRuntimeId,
  VendoredRuntimeLifecycleAction,
  VendoredRuntimeStatusSnapshot,
} from '../../types/dependency-management.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  appendBatchSyncLog,
  evaluateDependencyRepairIntent,
  getSelectablePackageIds,
  getSelectAllChecked,
  getSelectedEligiblePackageIds,
  isBatchSyncEvent,
  pruneSelectedPackageIds,
  prioritizePackagesForRepair,
  prioritizeVendoredRuntimesForRepair,
  type BatchSyncState,
  updateSelectAllPackageIds,
  updateSelectedPackageIds,
} from './dependency-management/dependencyManagementPageModel';
import {
  BatchSyncLogPanel,
  NpmPackageTable,
  VendoredRuntimeCard,
} from './dependency-management/NpmPackageGroups';
import { setDependencyManagementIntent, switchView } from '@/store/slices/viewSlice';
import type { AppDispatch, RootState } from '@/store';

type PageStatus = 'loading' | 'ready' | 'error';
type RepairCompletionState = 'idle' | 'checking' | 'incomplete' | 'failed';

const NPM_MIRROR_REGISTRY_URL = 'https://registry.npmmirror.com/';

function getDependencyManagementBridge(): DependencyManagementBridge {
  return (window as Window & {
    electronAPI: {
      dependencyManagement: DependencyManagementBridge;
    };
  }).electronAPI.dependencyManagement;
}

export default function DependencyManagementPage() {
  const { t } = useTranslation('common');
  const dispatch = useDispatch<AppDispatch>();
  const repairIntent = useSelector((state: RootState) => state.view.dependencyManagementIntent);
  const [snapshot, setSnapshot] = useState<DependencyManagementSnapshot | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<Partial<Record<ManagedNpmPackageId, DependencyManagementOperationProgress>>>({});
  const [operationError, setOperationError] = useState<Partial<Record<ManagedNpmPackageId, string>>>({});
  const [selectedPackageIds, setSelectedPackageIds] = useState<ManagedNpmPackageId[]>([]);
  const [batchSyncState, setBatchSyncState] = useState<BatchSyncState | null>(null);
  const [runtimeActionState, setRuntimeActionState] = useState<Partial<Record<VendoredRuntimeId, VendoredRuntimeLifecycleAction>>>({});
  const [runtimeOperationError, setRuntimeOperationError] = useState<Partial<Record<VendoredRuntimeId, string>>>({});
  const [mirrorSaveError, setMirrorSaveError] = useState<string | null>(null);
  const [isSavingMirrorSettings, setIsSavingMirrorSettings] = useState(false);
  const [repairCompletionState, setRepairCompletionState] = useState<RepairCompletionState>('idle');
  const [isPending, startTransition] = useTransition();
  const batchLogPanelRef = useRef<HTMLDivElement | null>(null);

  const openNodeEnvironmentFaq = () => {
    void window.electronAPI.openExternal(t('dependencyManagement.environment.faqUrl'));
  };

  const applySnapshot = (nextSnapshot: DependencyManagementSnapshot) => {
    startTransition(() => {
      setSnapshot(nextSnapshot);
      setPageStatus('ready');
      setErrorMessage(null);
    });
  };

  const refreshSnapshot = async () => {
    setErrorMessage(null);
    try {
      const nextSnapshot = await getDependencyManagementBridge().refresh();
      applySnapshot(nextSnapshot);
    } catch (error) {
      setPageStatus('error');
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    let disposed = false;

    const loadSnapshot = async () => {
      try {
        const initial = await getDependencyManagementBridge().getSnapshot();
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

    const bridge = getDependencyManagementBridge();
    const unsubscribe = bridge.onProgress((event) => {
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

    const unsubscribeActivation = bridge.onVendoredRuntimeActivationProgress((event) => {
      setSnapshot((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          activeRuntimeActivation: ['completed', 'failed'].includes(event.stage) ? null : event,
          vendoredRuntimes: current.vendoredRuntimes.map((item) => item.id === event.runtimeId
            ? {
                ...item,
                activation: event,
                status: ['completed', 'failed'].includes(event.stage) ? item.status : 'extracting',
                installStatus: item.installStatus === 'installed' ? 'installed' : 'not-installed',
                primaryAction: ['completed', 'failed'].includes(event.stage) ? item.primaryAction : 'none',
              }
            : item),
        };
      });
      if (event.stage === 'failed') {
        setRuntimeOperationError((current) => ({
          ...current,
          [event.runtimeId]: event.error ?? event.message,
        }));
      }
      if (event.stage === 'completed' || event.stage === 'failed') {
        setRuntimeActionState((current) => ({
          ...current,
          [event.runtimeId]: undefined,
        }));
        void refreshSnapshot();
      }
    });

    void loadSnapshot();

    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeActivation();
    };
  }, []);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    setSelectedPackageIds((current) => pruneSelectedPackageIds(current, snapshot.packages));
  }, [snapshot]);

  useEffect(() => {
    setRepairCompletionState('idle');
  }, [repairIntent?.failureKind, repairIntent?.targetPackageIds.join('|')]);

  const isBatchSyncRunning = batchSyncState?.status === 'running';
  const isRepairCompletionRunning = repairCompletionState === 'checking';

  useEffect(() => {
    if (!isBatchSyncRunning) {
      return;
    }

    batchLogPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isBatchSyncRunning]);

  const runOperation = async (
    packageId: ManagedNpmPackageId,
    action: 'install' | 'uninstall',
  ) => {
    setOperationError((current) => ({ ...current, [packageId]: undefined }));
    setBatchSyncState({
      packageIds: [packageId],
      status: 'running',
      logs: [],
    });
    try {
      const result = action === 'install'
        ? await getDependencyManagementBridge().install(packageId)
        : await getDependencyManagementBridge().uninstall(packageId);
      applySnapshot(result.snapshot);
      if (!result.success) {
        setBatchSyncState((current) => current && current.packageIds.length === 1 && current.packageIds[0] === packageId
          ? { ...current, status: 'failed', error: result.error ?? t('dependencyManagement.errors.operationFailed') }
          : current);
        setOperationError((current) => ({ ...current, [packageId]: result.error ?? t('dependencyManagement.errors.operationFailed') }));
        return;
      }
      setBatchSyncState((current) => current && current.packageIds.length === 1 && current.packageIds[0] === packageId
        ? { ...current, status: 'completed', error: undefined }
        : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBatchSyncState((current) => current && current.packageIds.length === 1 && current.packageIds[0] === packageId
        ? { ...current, status: 'failed', error: message }
        : current);
      setOperationError((current) => ({
        ...current,
        [packageId]: message,
      }));
    }
  };

  const runBatchInstall = async (packageIds: ManagedNpmPackageId[]) => {
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
      const result = await getDependencyManagementBridge().syncPackages({ packageIds });
      applySnapshot(result.snapshot);
      if (result.success) {
        setBatchSyncState((current) => current && current.packageIds.every((id) => packageIds.includes(id))
          ? { ...current, status: 'completed', error: undefined }
          : current);
        setSelectedPackageIds((current) => current.filter((id) => !packageIds.includes(id)));
        return;
      }

      setBatchSyncState((current) => current && current.packageIds.every((id) => packageIds.includes(id))
        ? { ...current, status: 'failed', error: result.error ?? t('dependencyManagement.errors.operationFailed') }
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
      const nextSnapshot = await getDependencyManagementBridge().setMirrorSettings({ enabled });
      setSnapshot(nextSnapshot);
    } catch (error) {
      setSnapshot(previousSnapshot);
      setMirrorSaveError(error instanceof Error ? error.message : t('dependencyManagement.mirror.saveFailed'));
    } finally {
      setIsSavingMirrorSettings(false);
    }
  };

  const managedPackages = snapshot?.packages ?? [];
  const vendoredRuntimes = snapshot?.vendoredRuntimes ?? [];
  const hasVendoredRuntimes = vendoredRuntimes.length > 0;
  const highlightedPackageIds = repairIntent?.targetPackageIds ?? [];
  const highlightedRuntimeIds = repairIntent?.targetRuntimeIds ?? [];
  const prioritizedManagedPackages = prioritizePackagesForRepair(managedPackages, highlightedPackageIds);
  const prioritizedVendoredRuntimes = prioritizeVendoredRuntimesForRepair(vendoredRuntimes, highlightedRuntimeIds);
  const repairEvaluation = evaluateDependencyRepairIntent(snapshot?.packages ?? [], snapshot?.vendoredRuntimes ?? [], repairIntent);
  const activePackageId = snapshot?.activeOperation?.packageId;
  const environmentAvailable = snapshot?.environment.available ?? false;
  const actionsDisabled = !environmentAvailable || isPending || Boolean(activePackageId) || isRepairCompletionRunning;
  const mirrorToggleDisabled = isSavingMirrorSettings || Boolean(activePackageId);
  const mirrorRegistryUrl = snapshot?.mirrorSettings.registryUrl ?? NPM_MIRROR_REGISTRY_URL;
  const selectablePackageIds = getSelectablePackageIds(managedPackages, { actionsDisabled });
  const batchSyncPackageIds = new Set(batchSyncState?.packageIds ?? []);
  const basePackages = prioritizedManagedPackages.filter((item) => item.definition.category !== 'agent-cli');
  const agentCliPackages = prioritizedManagedPackages.filter((item) => item.definition.category === 'agent-cli');
  const basePackageIdSet = new Set(basePackages.map((item) => item.id));
  const agentCliPackageIdSet = new Set(agentCliPackages.map((item) => item.id));
  const baseHighlightedPackageIds = highlightedPackageIds.filter((id) => basePackageIdSet.has(id));
  const agentCliHighlightedPackageIds = highlightedPackageIds.filter((id) => agentCliPackageIdSet.has(id));
  const baseSelectablePackageIds = selectablePackageIds.filter((id) => basePackageIdSet.has(id));
  const agentCliSelectablePackageIds = selectablePackageIds.filter((id) => agentCliPackageIdSet.has(id));
  const baseSelectedEligibleIds = getSelectedEligiblePackageIds(selectedPackageIds, baseSelectablePackageIds);
  const agentCliSelectedEligibleIds = getSelectedEligiblePackageIds(selectedPackageIds, agentCliSelectablePackageIds);
  const baseSelectAllChecked = getSelectAllChecked(selectedPackageIds, baseSelectablePackageIds);
  const agentCliSelectAllChecked = getSelectAllChecked(selectedPackageIds, agentCliSelectablePackageIds);

  const runVendoredRuntimeAction = async (
    runtimeId: VendoredRuntimeId,
    action: VendoredRuntimeLifecycleAction,
  ) => {
    setRuntimeActionState((current) => ({ ...current, [runtimeId]: action }));
    setRuntimeOperationError((current) => ({ ...current, [runtimeId]: undefined }));
    try {
      const bridge = getDependencyManagementBridge();
      const result = action === 'enable'
        ? await bridge.enableVendoredRuntime(runtimeId)
        : action === 'start'
          ? await bridge.startVendoredRuntime(runtimeId)
          : action === 'stop'
            ? await bridge.stopVendoredRuntime(runtimeId)
            : action === 'restart'
              ? await bridge.restartVendoredRuntime(runtimeId)
              : await bridge.repairVendoredRuntime(runtimeId);

      setSnapshot((current) => current ? {
        ...current,
        vendoredRuntimes: current.vendoredRuntimes.map((item) => item.id === runtimeId ? result.status : item),
      } : current);

      if (!result.success) {
        setRuntimeOperationError((current) => ({
          ...current,
          [runtimeId]: result.error ?? t('dependencyManagement.errors.operationFailed'),
        }));
      }

      await refreshSnapshot();
    } catch (error) {
      setRuntimeOperationError((current) => ({
        ...current,
        [runtimeId]: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setRuntimeActionState((current) => ({ ...current, [runtimeId]: undefined }));
    }
  };

  const togglePackageSelection = (packageId: ManagedNpmPackageId, checked: boolean) => {
    setSelectedPackageIds((current) => updateSelectedPackageIds(current, packageId, checked));
  };

  const toggleSelectAll = (checked: boolean, eligiblePackageIds: readonly ManagedNpmPackageId[]) => {
    setSelectedPackageIds((current) => updateSelectAllPackageIds(current, eligiblePackageIds, checked));
  };

  const runRepairCompletionCheck = async () => {
    if (!repairIntent) {
      return;
    }

    setRepairCompletionState('checking');
    try {
      const nextSnapshot = await getDependencyManagementBridge().refresh();
      applySnapshot(nextSnapshot);

      const nextEvaluation = evaluateDependencyRepairIntent(
        nextSnapshot.packages,
        nextSnapshot.vendoredRuntimes,
        repairIntent,
      );
      if (nextEvaluation.ready) {
        dispatch(setDependencyManagementIntent(null));
        dispatch(switchView(repairIntent.returnView));
        return;
      }

      setRepairCompletionState('incomplete');
    } catch {
      setRepairCompletionState('failed');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card className="border-border/80 shadow-md">
        <CardHeader className="gap-4 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2">
                <PackageOpen className="h-5 w-5" />
                {t('dependencyManagement.title')}
              </CardTitle>
              <CardDescription>{t('dependencyManagement.description')}</CardDescription>
            </div>
            <Button variant="outline" onClick={() => void refreshSnapshot()} disabled={pageStatus === 'loading' || isPending}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('dependencyManagement.actions.refresh')}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {pageStatus === 'loading' && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t('dependencyManagement.loading')}
          </CardContent>
        </Card>
      )}

      {pageStatus === 'error' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('dependencyManagement.errors.loadFailed')}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {pageStatus === 'ready' && snapshot && (
        <>
          <div className="space-y-5">
            <NpmPackageTable
              titleKey="dependencyManagement.packageTable.groups.base.title"
              descriptionKey="dependencyManagement.packageTable.groups.base.description"
              packages={basePackages}
              highlightedPackageIds={baseHighlightedPackageIds}
              selectedPackageIds={selectedPackageIds}
              selectablePackageIds={baseSelectablePackageIds}
              selectAllChecked={baseSelectAllChecked}
              selectedEligibleCount={baseSelectedEligibleIds.length}
              batchSyncPackageIds={batchSyncPackageIds}
              isBatchSyncRunning={isBatchSyncRunning}
              progressByPackageId={progress}
              activeOperation={snapshot.activeOperation}
              operationErrorByPackageId={operationError}
              actionsDisabled={actionsDisabled}
              onTogglePackage={togglePackageSelection}
              onToggleAll={(checked) => toggleSelectAll(checked, baseSelectablePackageIds)}
              onInstallSelected={() => void runBatchInstall(baseSelectedEligibleIds)}
              onRunOperation={(packageId, action) => void runOperation(packageId, action)}
            />

            <NpmPackageTable
              titleKey="dependencyManagement.packageTable.groups.agentCli.title"
              descriptionKey="dependencyManagement.packageTable.groups.agentCli.description"
              packages={agentCliPackages}
              highlightedPackageIds={agentCliHighlightedPackageIds}
              selectedPackageIds={selectedPackageIds}
              selectablePackageIds={agentCliSelectablePackageIds}
              selectAllChecked={agentCliSelectAllChecked}
              selectedEligibleCount={agentCliSelectedEligibleIds.length}
              batchSyncPackageIds={batchSyncPackageIds}
              isBatchSyncRunning={isBatchSyncRunning}
              progressByPackageId={progress}
              activeOperation={snapshot.activeOperation}
              operationErrorByPackageId={operationError}
              actionsDisabled={actionsDisabled}
              onTogglePackage={togglePackageSelection}
              onToggleAll={(checked) => toggleSelectAll(checked, agentCliSelectablePackageIds)}
              onInstallSelected={() => void runBatchInstall(agentCliSelectedEligibleIds)}
              onRunOperation={(packageId, action) => void runOperation(packageId, action)}
            />
          </div>

          {hasVendoredRuntimes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('dependencyManagement.vendoredRuntime.title')}</CardTitle>
                <CardDescription>{t('dependencyManagement.vendoredRuntime.description')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 xl:grid-cols-2">
                {prioritizedVendoredRuntimes.map((runtime) => (
                  <VendoredRuntimeCard
                    key={runtime.id}
                    item={runtime}
                    highlighted={highlightedRuntimeIds.includes(runtime.id)}
                    pendingAction={runtimeActionState[runtime.id] ?? null}
                    error={runtimeOperationError[runtime.id] ?? null}
                    refreshDisabled={pageStatus === 'loading' || isPending}
                    onPrimaryAction={(item) => {
                      if (item.primaryAction === 'reinstall-desktop' || item.primaryAction === 'none') {
                        return;
                      }
                      void runVendoredRuntimeAction(item.id, item.primaryAction);
                    }}
                    onRestart={(runtimeId) => void runVendoredRuntimeAction(runtimeId, 'restart')}
                    onRefresh={() => void refreshSnapshot()}
                    onOpenLogs={(runtimeId) => void getDependencyManagementBridge().openVendoredRuntimePath(runtimeId, 'logs')}
                    onOpenRuntimeRoot={(runtimeId) => void getDependencyManagementBridge().openVendoredRuntimePath(runtimeId, 'runtime-root')}
                    onOpenUrl={(url) => void window.electronAPI.openExternal(url)}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {batchSyncState && (
            <BatchSyncLogPanel ref={batchLogPanelRef} batchSyncState={batchSyncState} />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gauge className="h-5 w-5" />
                {t('dependencyManagement.environment.title')}
              </CardTitle>
              <CardDescription>{t('dependencyManagement.environment.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium">{t('dependencyManagement.environment.rationaleTitle')}</p>
                <p className="mt-2 text-sm text-muted-foreground">{t('dependencyManagement.environment.managedNotice')}</p>
                <Button type="button" variant="outline" size="sm" className="mt-3 gap-2" onClick={openNodeEnvironmentFaq}>
                  <ExternalLink className="h-4 w-4" />
                  {t('dependencyManagement.environment.faqLinkLabel')}
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
              {(['node', 'npm'] as const).map((component) => {
                const item = snapshot.environment[component];
                return (
                  <div key={component} className="rounded-lg border p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="font-medium uppercase">{component}</span>
                      <Badge variant={item.status === 'available' ? 'default' : 'destructive'}>
                        {t(`dependencyManagement.environment.status.${item.status}`)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{t('dependencyManagement.environment.version')}: {item.version ?? t('dependencyManagement.unavailable')}</p>
                    <p className="break-all text-sm text-muted-foreground">{item.executablePath}</p>
                    {item.message && <p className="mt-2 text-sm text-destructive">{item.message}</p>}
                  </div>
                );
              })}
              <div className="rounded-lg border p-4 md:col-span-2">
                <p className="text-sm font-medium">{t('dependencyManagement.environment.toolchainRoot')}</p>
                <p className="break-all text-sm text-muted-foreground">{snapshot.environment.toolchainRoot}</p>
                <p className="mt-3 text-sm font-medium">{t('dependencyManagement.environment.nodeRuntimeRoot')}</p>
                <p className="break-all text-sm text-muted-foreground">{snapshot.environment.nodeRuntimeRoot}</p>
                <p className="mt-3 text-sm font-medium">{t('dependencyManagement.environment.nodeMajorVersion')}</p>
                <p className="break-all text-sm text-muted-foreground">node{snapshot.environment.nodeMajorVersion}</p>
                <p className="mt-3 text-sm font-medium">{t('dependencyManagement.environment.globalPrefix')}</p>
                <p className="break-all text-sm text-muted-foreground">{snapshot.environment.npmGlobalPrefix}</p>
                <p className="mt-3 text-sm font-medium">{t('dependencyManagement.environment.globalModulesRoot')}</p>
                <p className="break-all text-sm text-muted-foreground">{snapshot.environment.npmGlobalModulesRoot}</p>
              </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('dependencyManagement.mirror.title')}</CardTitle>
              <CardDescription>{t('dependencyManagement.mirror.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t('dependencyManagement.mirror.toggleLabel')}</span>
                    <Badge variant={snapshot.mirrorSettings.enabled ? 'default' : 'secondary'}>
                      {isSavingMirrorSettings
                        ? t('dependencyManagement.mirror.saving')
                        : snapshot.mirrorSettings.enabled
                          ? t('dependencyManagement.mirror.enabled')
                          : t('dependencyManagement.mirror.disabled')}
                    </Badge>
                  </div>
                  <p className="break-all text-sm text-muted-foreground">
                    {t('dependencyManagement.mirror.registryUrl')}: {mirrorRegistryUrl}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {snapshot.mirrorSettings.enabled
                      ? t('dependencyManagement.mirror.enabledHelp')
                      : t('dependencyManagement.mirror.disabledHelp')}
                  </p>
                </div>
                <Switch
                  checked={snapshot.mirrorSettings.enabled}
                  onCheckedChange={(enabled) => void updateMirrorSettings(enabled)}
                  disabled={mirrorToggleDisabled}
                  aria-label={t('dependencyManagement.mirror.toggleLabel')}
                />
              </div>

              {mirrorSaveError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t('dependencyManagement.mirror.saveFailed')}</AlertTitle>
                  <AlertDescription>{mirrorSaveError}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
