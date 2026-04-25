import { useEffect, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Loader2, PackageOpen, RefreshCw, Trash2 } from 'lucide-react';
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
import { Progress } from '@/components/ui/progress';

type PageStatus = 'loading' | 'ready' | 'error';

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

export default function NpmManagementPage() {
  const { t } = useTranslation('common');
  const [snapshot, setSnapshot] = useState<NpmManagementSnapshot | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<ManagedNpmPackageId, NpmManagementOperationProgress | undefined>>({
    openspec: undefined,
    skills: undefined,
    omniroute: undefined,
  });
  const [operationError, setOperationError] = useState<Record<ManagedNpmPackageId, string | undefined>>({
    openspec: undefined,
    skills: undefined,
    omniroute: undefined,
  });
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

  const activePackageId = snapshot?.activeOperation?.packageId;
  const environmentAvailable = snapshot?.environment.available ?? false;
  const actionsDisabled = !environmentAvailable || isPending || Boolean(activePackageId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card className="border-border/80 shadow-md">
        <CardHeader className="gap-4 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2">
                <PackageOpen className="h-5 w-5 text-primary" />
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

      {pageStatus === 'error' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('npmManagement.errors.loadFailed')}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {pageStatus === 'loading' && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t('npmManagement.loading')}
          </CardContent>
        </Card>
      )}

      {snapshot && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('npmManagement.environment.title')}</CardTitle>
              <CardDescription>{t('npmManagement.environment.description')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-card p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">Node</span>
                  <Badge variant={snapshot.environment.node.status === 'available' ? 'default' : 'destructive'}>
                    {t(`npmManagement.environment.status.${snapshot.environment.node.status}`)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{snapshot.environment.node.executablePath}</p>
                <p className="mt-2 text-sm">{t('npmManagement.environment.version')}: {snapshot.environment.node.version ?? t('npmManagement.unavailable')}</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">npm</span>
                  <Badge variant={snapshot.environment.npm.status === 'available' ? 'default' : 'destructive'}>
                    {t(`npmManagement.environment.status.${snapshot.environment.npm.status}`)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{snapshot.environment.npm.executablePath}</p>
                <p className="mt-2 text-sm">{t('npmManagement.environment.version')}: {snapshot.environment.npm.version ?? t('npmManagement.unavailable')}</p>
              </div>
              <div className="md:col-span-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p>{t('npmManagement.environment.toolchainRoot')}: {snapshot.environment.toolchainRoot}</p>
                <p>{t('npmManagement.environment.globalPrefix')}: {snapshot.environment.npmGlobalPrefix}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            {snapshot.packages.map((item) => {
              const itemProgress = progress[item.id] ?? (snapshot.activeOperation?.packageId === item.id ? snapshot.activeOperation : undefined);
              const isActive = itemProgress?.stage === 'started' || itemProgress?.stage === 'output';
              const disabled = actionsDisabled || (activePackageId !== undefined && activePackageId !== item.id);
              const error = operationError[item.id] ?? (item.status === 'unknown' ? item.message : undefined);

              return (
                <Card key={item.id} className="flex flex-col">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">{item.definition.displayName}</CardTitle>
                        <CardDescription>{t(item.definition.descriptionKey)}</CardDescription>
                      </div>
                      <Badge variant={packageBadgeVariant(item.status)}>
                        {t(`npmManagement.packageStatus.${item.status}`)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>{t('npmManagement.package.version')}: {item.version ?? t('npmManagement.unavailable')}</p>
                      <p className="break-all">{t('npmManagement.package.packageName')}: {item.definition.packageName}</p>
                    </div>

                    {isActive && (
                      <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {itemProgress.message}
                        </div>
                        <Progress value={itemProgress.percentage ?? 20} />
                      </div>
                    )}

                    {itemProgress?.stage === 'completed' && (
                      <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" />
                        {itemProgress.message}
                      </div>
                    )}

                    {error && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button
                        onClick={() => void runOperation(item.id, 'install')}
                        disabled={disabled || item.status === 'installed'}
                      >
                        {isActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageOpen className="mr-2 h-4 w-4" />}
                        {item.status === 'installed' ? t('npmManagement.actions.installed') : t('npmManagement.actions.install')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void runOperation(item.id, 'uninstall')}
                        disabled={disabled || item.status !== 'installed'}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('npmManagement.actions.uninstall')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

