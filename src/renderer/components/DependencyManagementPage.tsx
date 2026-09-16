import { useEffect, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2, PackageOpen, RefreshCw } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { DependencyManagementBridge, DependencyManagementSnapshot, ManagedNpmPackageId } from '../../types/dependency-management.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import { evaluateDependencyRepairIntent, prioritizePackagesForRepair, buildBatchInstallCommand } from './dependency-management/dependencyManagementPageModel';
import { BatchCommandDialog } from './dependency-management/BatchCommandDialog';
import { DependencyManagementTabContent } from '../features/dependency-management/DependencyManagementTabContent';
import { useDependencyManagementTab } from '../features/dependency-management/useDependencyManagementTab';
import { setDependencyManagementIntent, switchView } from '@/store/slices/viewSlice';
import type { AppDispatch, RootState } from '@/store';

type PageStatus = 'loading' | 'ready' | 'error';
const NPM_MIRROR_REGISTRY_URL = 'https://registry.npmmirror.com/';

function getDependencyManagementBridge(): DependencyManagementBridge {
  return (window as Window & { electronAPI: { dependencyManagement: DependencyManagementBridge } }).electronAPI.dependencyManagement;
}

export default function DependencyManagementPage() {
  const { t } = useTranslation('common');
  const dispatch = useDispatch<AppDispatch>();
  const repairIntent = useSelector((state: RootState) => state.view.dependencyManagementIntent);
  const { activeTab, setActiveTab, tabs } = useDependencyManagementTab();
  const [snapshot, setSnapshot] = useState<DependencyManagementSnapshot | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshingSnapshot, setIsRefreshingSnapshot] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selectedPackageIds, setSelectedPackageIds] = useState<Set<ManagedNpmPackageId>>(new Set());
  const [batchCommand, setBatchCommand] = useState<string | null>(null);
  const [mirrorSaveError, setMirrorSaveError] = useState<string | null>(null);
  const [isSavingMirrorSettings, setIsSavingMirrorSettings] = useState(false);
  const [repairCompletionState, setRepairCompletionState] = useState<'idle' | 'checking' | 'incomplete' | 'failed'>('idle');

  const applySnapshot = (next: DependencyManagementSnapshot) => startTransition(() => {
    setSnapshot(next);
    setPageStatus('ready');
    setErrorMessage(null);
  });
  const refreshSnapshot = async (): Promise<boolean> => {
    setErrorMessage(null);
    setIsRefreshingSnapshot(true);
    try { applySnapshot(await getDependencyManagementBridge().refresh()); return true; }
    catch (error) { setPageStatus('error'); setErrorMessage(error instanceof Error ? error.message : String(error)); return false; }
    finally { setIsRefreshingSnapshot(false); }
  };

  useEffect(() => {
    let disposed = false;
    void getDependencyManagementBridge().getSnapshot().then((initial) => {
      if (!disposed) { setSnapshot(initial); setPageStatus('ready'); }
    }).catch((error) => {
      if (!disposed) { setPageStatus('error'); setErrorMessage(error instanceof Error ? error.message : String(error)); }
    });
    return () => { disposed = true; };
  }, []);
  useEffect(() => setRepairCompletionState('idle'), [repairIntent?.failureKind, repairIntent?.targetPackageIds.join('|')]);

  if (pageStatus === 'loading') {
    return <PageShell><PageHeader icon={PackageOpen} titleKey="dependencyManagement.title" descriptionKey="dependencyManagement.description" actions={<RefreshButton onClick={refreshSnapshot} disabled />} /><StatusCard><Loader2 className="h-5 w-5 animate-spin" />{t('dependencyManagement.loading')}</StatusCard></PageShell>;
  }

  const managedPackages = snapshot?.packages ?? [];
  const highlightedPackageIds = repairIntent?.targetPackageIds ?? [];
  const prioritizedPackages = prioritizePackagesForRepair(managedPackages, highlightedPackageIds);
  const basePackages = prioritizedPackages.filter((item) => item.definition.category !== 'agent-cli');
  const agentCliPackages = prioritizedPackages.filter((item) => item.definition.category === 'agent-cli');
  const baseIds = new Set(basePackages.map((item) => item.id));
  const agentIds = new Set(agentCliPackages.map((item) => item.id));
  const updateSelectedIds = (ids: string[], group: 'base' | 'agent-cli') => {
    const groupIds = group === 'base' ? baseIds : agentIds;
    setSelectedPackageIds((current) => {
      const next = new Set([...current].filter((id) => !groupIds.has(id)));
      ids.forEach((id) => next.add(id as ManagedNpmPackageId));
      return next;
    });
  };
  const mirrorRegistryUrl = snapshot?.mirrorSettings.registryUrl ?? NPM_MIRROR_REGISTRY_URL;
  const updateMirrorSettings = async (enabled: boolean) => {
    if (!snapshot) return;
    const previous = snapshot;
    setMirrorSaveError(null); setIsSavingMirrorSettings(true);
    setSnapshot({ ...snapshot, mirrorSettings: { enabled, registryUrl: enabled ? NPM_MIRROR_REGISTRY_URL : null } });
    try { setSnapshot(await getDependencyManagementBridge().setMirrorSettings({ enabled })); }
    catch (error) { setSnapshot(previous); setMirrorSaveError(error instanceof Error ? error.message : t('dependencyManagement.mirror.saveFailed')); }
    finally { setIsSavingMirrorSettings(false); }
  };
  const runRepairCompletionCheck = async () => {
    if (!repairIntent || !snapshot) return;
    setRepairCompletionState('checking');
    try {
      const next = await getDependencyManagementBridge().refresh();
      applySnapshot(next);
      if (evaluateDependencyRepairIntent(next.packages, repairIntent).ready) {
        dispatch(setDependencyManagementIntent(null)); dispatch(switchView(repairIntent.returnView));
      } else setRepairCompletionState('incomplete');
    } catch { setRepairCompletionState('failed'); }
  };
  const generateBatchCommand = () => {
    if (!snapshot || selectedPackageIds.size === 0) return;
    setBatchCommand(buildBatchInstallCommand(snapshot.packages.filter((item) => selectedPackageIds.has(item.id)).map((item) => item.definition), snapshot.mirrorSettings.enabled ? mirrorRegistryUrl : null));
  };
  const activeConfig = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  return <PageShell>
    <PageHeader icon={PackageOpen} titleKey="dependencyManagement.title" descriptionKey="dependencyManagement.description" actions={<RefreshButton onClick={refreshSnapshot} disabled={pageStatus === 'loading' || isRefreshingSnapshot || isPending} loading={isRefreshingSnapshot} />} />
    {pageStatus === 'error' ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>{t('dependencyManagement.errors.loadFailed')}</AlertTitle><AlertDescription>{errorMessage}</AlertDescription></Alert> : null}
    {pageStatus === 'ready' && snapshot ? <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="w-full">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-2xl border border-border/70 bg-muted/25 p-2">{tabs.map((tab) => { const Icon = tab.icon; return <TabsTrigger key={tab.id} value={tab.id} className="gap-2 rounded-xl px-4 py-3"><Icon className="h-4 w-4" />{t(tab.labelKey, { ns: 'pages' })}</TabsTrigger>; })}</TabsList>
      <DependencyManagementTabContent activeTab={activeConfig} snapshot={snapshot} basePackages={basePackages} agentCliPackages={agentCliPackages} baseHighlightedPackageIds={highlightedPackageIds.filter((id) => baseIds.has(id))} agentCliHighlightedPackageIds={highlightedPackageIds.filter((id) => agentIds.has(id))} selectedPackageIds={selectedPackageIds} onSelectionChange={updateSelectedIds} onGenerateBatchCommand={generateBatchCommand} onOpenNodeEnvironmentFaq={() => void window.electronAPI.openExternal(t('dependencyManagement.environment.faqUrl'))} onUpdateMirrorSettings={updateMirrorSettings} isSavingMirrorSettings={isSavingMirrorSettings} mirrorRegistryUrl={mirrorRegistryUrl} mirrorSaveError={mirrorSaveError} />
    </Tabs> : null}
    <BatchCommandDialog open={batchCommand !== null} command={batchCommand ?? ''} onOpenChange={(open) => { if (!open) setBatchCommand(null); }} />
    {repairIntent && repairCompletionState !== 'idle' ? <Button className="sr-only" onClick={() => void runRepairCompletionCheck()} /> : null}
  </PageShell>;
}

function PageShell({ children }: { children: React.ReactNode }) { return <div className="mx-auto max-w-6xl space-y-6">{children}</div>; }
function StatusCard({ children }: { children: React.ReactNode }) { return <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-6 text-muted-foreground">{children}</div>; }
function RefreshButton({ onClick, disabled, loading }: { onClick: () => void; disabled?: boolean; loading?: boolean }) { const { t } = useTranslation('common'); return <Button variant="outline" onClick={() => void onClick()} disabled={disabled}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{t('dependencyManagement.actions.refresh')}</Button>; }
