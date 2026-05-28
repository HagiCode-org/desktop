import { useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ExternalLink, FolderOpen, Loader2, Monitor, PackageOpen, Play, RefreshCw, RotateCcw, Save, Square, Wrench } from 'lucide-react';
import { useDispatch } from 'react-redux';
import type {
  CodeServerBridge,
  CodeServerLogReadResult,
  CodeServerLogTarget,
  CodeServerPathTarget,
  CodeServerStatusSnapshot,
} from '../../types/code-server-management.js';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { cn } from '@/lib/utils';
import { switchView } from '@/store/slices/viewSlice';
import type { AppDispatch } from '@/store';

type PageState = 'loading' | 'ready' | 'error';
type Operation = 'enable' | 'start' | 'stop' | 'restart' | 'repair' | 'refresh' | 'save-config' | 'load-log' | 'open-window' | 'open-browser' | null;

const LOG_TARGETS: CodeServerLogTarget[] = ['service-out', 'service-error'];
const PATH_TARGETS: CodeServerPathTarget[] = ['runtime-root', 'data', 'extensions', 'logs'];

function getBridge(): CodeServerBridge {
  return window.electronAPI.codeServer;
}

function statusBadgeVariant(status: CodeServerStatusSnapshot['status']) {
  if (status === 'running') {
    return 'default' as const;
  }
  if (status === 'error' || status === 'missing' || status === 'damaged') {
    return 'destructive' as const;
  }
  return 'secondary' as const;
}

function validatePortInput(value: string): string | null {
  const port = Number.parseInt(value, 10);
  if (!/^\d+$/.test(value.trim()) || !Number.isInteger(port)) {
    return 'codeServer.validation.numeric';
  }
  if (port < 1024 || port > 65535) {
    return 'codeServer.validation.range';
  }
  return null;
}

function validatePasswordInput(value: string): string | null {
  const password = value.trim();
  if (password.length < 4 || password.length > 200) {
    return 'codeServer.validation.passwordLength';
  }
  return null;
}

export default function CodeServerManagementPage() {
  const { t } = useTranslation('common');
  const dispatch = useDispatch<AppDispatch>();
  const [status, setStatus] = useState<CodeServerStatusSnapshot | null>(null);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [operation, setOperation] = useState<Operation>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [portInput, setPortInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [selectedLogTarget, setSelectedLogTarget] = useState<CodeServerLogTarget>('service-out');
  const [logs, setLogs] = useState<Partial<Record<CodeServerLogTarget, CodeServerLogReadResult>>>({});
  const [isPending, startTransition] = useTransition();

  const isBusy = operation !== null || isPending;
  const portValidationKey = useMemo(() => validatePortInput(portInput), [portInput]);
  const passwordValidationKey = useMemo(() => validatePasswordInput(passwordInput), [passwordInput]);
  const isRunning = status?.status === 'running';
  const activationInProgress = status?.runtime.status === 'extracting';
  const lifecycleBlocked = !status?.pm2Available || status?.runtime.installStatus !== 'installed' || activationInProgress;
  const runtimeInstallStatus = status?.runtime.installStatus ?? 'not-installed';
  const runtimeNeedsRepair = runtimeInstallStatus !== 'installed';
  const runtimeInstalled = runtimeInstallStatus === 'installed';
  const runtimePrimaryAction = status?.runtime.primaryAction ?? 'none';
  const runtimeEnableAvailable = runtimePrimaryAction === 'enable';
  const runtimeRepairAvailable = runtimePrimaryAction === 'repair';
  const runtimeRequiresDesktopReinstall = runtimePrimaryAction === 'reinstall-desktop';

  const applyStatus = (nextStatus: CodeServerStatusSnapshot) => {
    startTransition(() => {
      setStatus(nextStatus);
      setPortInput(String(nextStatus.config.port));
      setPasswordInput(nextStatus.config.password);
      setPageState('ready');
    });
  };

  const refreshStatus = async () => {
    setOperation('refresh');
    setErrorMessage(null);
    try {
      applyStatus(await getBridge().getStatus());
    } catch (error) {
      setPageState('error');
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOperation(null);
    }
  };

  const runLifecycle = async (action: 'start' | 'stop' | 'restart' | 'repair') => {
    setOperation(action);
    setErrorMessage(null);
    try {
      const result = await getBridge()[action]();
      applyStatus(result.status);
      if (!result.success) {
        const errorLog = await getBridge().readLog({ target: 'service-error', maxLines: 200 });
        setLogs((current) => ({ ...current, 'service-error': errorLog }));
        setSelectedLogTarget('service-error');
        setErrorMessage(result.error ?? t('codeServer.errors.operationFailed'));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOperation(null);
    }
  };

  const enableRuntime = async () => {
    setOperation('enable');
    setErrorMessage(null);
    try {
      const result = await window.electronAPI.dependencyManagement.enableVendoredRuntime('code-server');
      applyStatus(await getBridge().getStatus());
      if (!result.success) {
        setErrorMessage(result.error ?? t('codeServer.errors.operationFailed'));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOperation(null);
    }
  };

  const saveConfig = async () => {
    if (portValidationKey) {
      setErrorMessage(t(portValidationKey));
      return;
    }
    if (passwordValidationKey) {
      setErrorMessage(t(passwordValidationKey));
      return;
    }

    setOperation('save-config');
    setErrorMessage(null);
    try {
      const result = await getBridge().setConfig({
        port: Number.parseInt(portInput, 10),
        password: passwordInput.trim(),
      });
      applyStatus(result.status);
      if (!result.success) {
        setErrorMessage(result.error ?? t('codeServer.errors.saveFailed'));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOperation(null);
    }
  };

  const loadLog = async (target: CodeServerLogTarget = selectedLogTarget) => {
    setOperation('load-log');
    setErrorMessage(null);
    try {
      const result = await getBridge().readLog({ target, maxLines: 200 });
      setLogs((current) => ({ ...current, [target]: result }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOperation(null);
    }
  };

  const openPath = (target: CodeServerPathTarget) => {
    setErrorMessage(null);
    void getBridge().openPath(target).then((result) => {
      if (!result.success) {
        setErrorMessage(result.error ?? t('codeServer.errors.openPathFailed'));
      }
    }).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    });
  };

  const openManagedWindow = async () => {
    if (!status?.config.baseUrl) {
      return;
    }

    setOperation('open-window');
    setErrorMessage(null);
    try {
      const result = await window.electronAPI.openCodeServerWindow(status.config.baseUrl, status.config.password);
      if (!result.success) {
        setErrorMessage(result.error || result.diagnosticsSummary || t('codeServer.errors.openWindowFailed'));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOperation(null);
    }
  };

  const openBrowserWindow = async () => {
    if (!status?.config.baseUrl) {
      return;
    }

    setOperation('open-browser');
    setErrorMessage(null);
    try {
      const result = await window.electronAPI.openCodeServerExternal(status.config.baseUrl, status.config.password);
      if (!result.success) {
        setErrorMessage(result.error ?? t('codeServer.errors.openWindowFailed'));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOperation(null);
    }
  };

  useEffect(() => {
    let disposed = false;
    const unsubscribe = getBridge().onStatusChange((nextStatus) => {
      if (!disposed) {
        applyStatus(nextStatus);
      }
    });
    const activationUnsubscribe = window.electronAPI.dependencyManagement.onVendoredRuntimeActivationProgress((event) => {
      if (disposed || event.runtimeId !== 'code-server') {
        return;
      }
      setStatus((current) => current ? {
        ...current,
        runtime: {
          ...current.runtime,
          activation: event,
          status: ['completed', 'failed'].includes(event.stage) ? current.runtime.status : 'extracting',
        },
      } : current);
      if (event.stage === 'completed' || event.stage === 'failed') {
        void refreshStatus();
      }
    });

    void refreshStatus();

    return () => {
      disposed = true;
      unsubscribe();
      activationUnsubscribe();
    };
  }, []);

  useEffect(() => {
    void loadLog(selectedLogTarget);
  }, [selectedLogTarget]);

  if (pageState === 'loading') {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{t('codeServer.loading')}</span>
        </div>
      </div>
    );
  }

  const activeLog = logs[selectedLogTarget];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('codeServer.title')}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t('codeServer.description')}</p>
        </div>
        <Button variant="outline" onClick={() => void refreshStatus()} disabled={isBusy}>
          <RefreshCw className={cn('mr-2 h-4 w-4', operation === 'refresh' && 'animate-spin')} />
          {t('codeServer.actions.refresh')}
        </Button>
      </div>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('codeServer.errors.title')}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {!status?.pm2Available ? (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('codeServer.dependencyGuidance.title')}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{t('codeServer.dependencyGuidance.description')}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => dispatch(switchView('dependency-management'))} disabled={isBusy}>
                {t('codeServer.dependencyGuidance.openDependencyManagement')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {status && runtimeNeedsRepair ? (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t(`dependencyManagement.vendoredRuntime.installStatus.${runtimeInstallStatus}`)}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{status.runtime.message ?? t(`dependencyManagement.vendoredRuntime.primaryDescriptions.${runtimeInstallStatus}`)}</p>
            {activationInProgress ? (
              <p className="text-sm text-muted-foreground">{t('dependencyManagement.vendoredRuntime.activationInline', { percent: status.runtime.activation?.percentage ?? 0 })}</p>
            ) : null}
            {status.runtime.diagnostics.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {status.runtime.diagnostics.slice(0, 4).map((diagnostic) => (
                  <li key={diagnostic}>{diagnostic}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {runtimeEnableAvailable || activationInProgress ? (
                <Button type="button" onClick={() => void enableRuntime()} disabled={isBusy || activationInProgress}>
                  <PackageOpen className="mr-2 h-4 w-4" />
                  {activationInProgress ? t('dependencyManagement.vendoredRuntime.status.extracting') : t('dependencyManagement.vendoredRuntime.actions.enable')}
                </Button>
              ) : null}
              {runtimeRepairAvailable ? (
                <Button type="button" onClick={() => void runLifecycle('repair')} disabled={isBusy}>
                  <Wrench className="mr-2 h-4 w-4" />
                  {operation === 'repair' ? t('codeServer.actions.working') : t('codeServer.actions.repair')}
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => openPath('runtime-root')} disabled={isBusy}>
                <FolderOpen className="mr-2 h-4 w-4" />
                {t('codeServer.actions.open')}
              </Button>
            </div>
            {runtimeRequiresDesktopReinstall ? (
              <p className="text-sm text-muted-foreground">{t('dependencyManagement.vendoredRuntime.reinstallHint')}</p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {pageState === 'error' && !status ? null : (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>{t('codeServer.status.title')}</CardTitle>
                  <CardDescription>{status?.config.baseUrl}</CardDescription>
                </div>
                {status ? <Badge variant={statusBadgeVariant(status.status)}>{t(`codeServer.status.${status.status}`)}</Badge> : null}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('codeServer.status.baseUrl')}</p>
                  <p className="mt-2 break-all font-mono text-sm">{status?.config.baseUrl ?? '-'}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('codeServer.status.pm2')}</p>
                  <p className="mt-2 break-all font-mono text-sm">{status?.pm2ExecutablePath ?? t('codeServer.status.pm2Missing')}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('codeServer.status.runtimeStatus')}</p>
                  <p className="mt-2 text-sm">{t(`dependencyManagement.vendoredRuntime.installStatus.${status?.runtime.installStatus ?? 'not-installed'}`)}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('common.version')}</p>
                  <p className="mt-2 break-all font-mono text-sm">{status?.runtime.version ?? t('dependencyManagement.unavailable')}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('codeServer.status.passwordMode')}</p>
                  <p className="mt-2 text-sm">{t('codeServer.status.passwordModeValue')}</p>
                </div>
              </div>
            </CardContent>
            <CardContent className="pt-0">
              <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
                {runtimeEnableAvailable || activationInProgress ? (
                  <Button onClick={() => void enableRuntime()} disabled={isBusy || activationInProgress}>
                    <PackageOpen className="mr-2 h-4 w-4" />
                    {activationInProgress ? t('dependencyManagement.vendoredRuntime.status.extracting') : t('dependencyManagement.vendoredRuntime.actions.enable')}
                  </Button>
                ) : (
                  <Button onClick={() => void runLifecycle('start')} disabled={isBusy || isRunning || lifecycleBlocked}>
                    <Play className="mr-2 h-4 w-4" />
                    {operation === 'start' ? t('codeServer.actions.working') : t('codeServer.actions.start')}
                  </Button>
                )}
                {runtimeInstalled ? (
                  <>
                    <Button variant="outline" onClick={() => void runLifecycle('stop')} disabled={isBusy || !isRunning}>
                      <Square className="mr-2 h-4 w-4" />
                      {operation === 'stop' ? t('codeServer.actions.working') : t('codeServer.actions.stop')}
                    </Button>
                    <Button variant="outline" onClick={() => void runLifecycle('restart')} disabled={isBusy || lifecycleBlocked}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {operation === 'restart' ? t('codeServer.actions.working') : t('codeServer.actions.restart')}
                    </Button>
                    {status?.config.baseUrl && isRunning && !runtimeNeedsRepair ? (
                      <>
                        <Button variant="secondary" onClick={() => void openManagedWindow()} disabled={isBusy}>
                          <Monitor className="mr-2 h-4 w-4" />
                          {t('codeServer.actions.openDesktop')}
                        </Button>
                        <Button variant="secondary" onClick={() => void openBrowserWindow()} disabled={isBusy}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {t('codeServer.actions.openBrowser')}
                        </Button>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            </CardContent>
            {status?.runtime.diagnostics.length ? (
              <CardContent className="pt-0">
                <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('codeServer.status.diagnostics')}</p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {status.runtime.diagnostics.map((diagnostic) => (
                      <li key={diagnostic} className="break-words">{diagnostic}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            ) : null}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('codeServer.config.title')}</CardTitle>
                <CardDescription>{t('codeServer.config.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="code-server-port">{t('codeServer.config.portLabel')}</Label>
                    <Input
                      id="code-server-port"
                      value={portInput}
                      onChange={(event) => setPortInput(event.target.value)}
                      disabled={isBusy}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="code-server-password">{t('codeServer.config.passwordLabel')}</Label>
                    <Input
                      id="code-server-password"
                      className="font-mono"
                      type="text"
                      value={passwordInput}
                      onChange={(event) => setPasswordInput(event.target.value)}
                      disabled={isBusy}
                      spellCheck={false}
                    />
                    <p className="text-xs text-muted-foreground">{t('codeServer.config.passwordDescription')}</p>
                  </div>
                  <Button onClick={() => void saveConfig()} disabled={isBusy || Boolean(portValidationKey) || Boolean(passwordValidationKey)}>
                    <Save className="mr-2 h-4 w-4" />
                    {operation === 'save-config' ? t('codeServer.actions.working') : t('codeServer.actions.save')}
                  </Button>
                </div>
                {portValidationKey ? <p className="text-sm text-destructive">{t(portValidationKey)}</p> : null}
                {passwordValidationKey ? <p className="text-sm text-destructive">{t(passwordValidationKey)}</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('codeServer.paths.title')}</CardTitle>
                <CardDescription>{t('codeServer.paths.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {PATH_TARGETS.map((target) => (
                  <div key={target} className="flex flex-col gap-2 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t(`codeServer.paths.${target}`)}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {target === 'runtime-root' ? status?.runtime.runtimeRoot : status?.paths[target]}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openPath(target)} disabled={isBusy}>
                      <FolderOpen className="mr-2 h-4 w-4" />
                      {t('codeServer.actions.open')}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('codeServer.logs.title')}</CardTitle>
              <CardDescription>{t('codeServer.logs.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={selectedLogTarget} onValueChange={(value) => setSelectedLogTarget(value as CodeServerLogTarget)}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <TabsList>
                    {LOG_TARGETS.map((target) => (
                      <TabsTrigger key={target} value={target}>{t(`codeServer.logs.targets.${target}`)}</TabsTrigger>
                    ))}
                  </TabsList>
                  <Button variant="outline" size="sm" onClick={() => void loadLog()} disabled={isBusy}>
                    <RefreshCw className={cn('mr-2 h-4 w-4', operation === 'load-log' && 'animate-spin')} />
                    {t('codeServer.actions.refreshLogs')}
                  </Button>
                </div>
                {LOG_TARGETS.map((target) => (
                  <TabsContent key={target} value={target} className="mt-4">
                    <div className="rounded-lg border border-border/70 bg-slate-950/95 p-4 text-sm text-slate-100">
                      {activeLog?.target === target && activeLog.lines.length > 0 ? (
                        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words font-mono">{activeLog.lines.join('\n')}</pre>
                      ) : (
                        <p className="text-slate-400">{t('codeServer.logs.empty')}</p>
                      )}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
