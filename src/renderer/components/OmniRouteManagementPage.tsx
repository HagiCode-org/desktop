import { useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ExternalLink, FolderOpen, Loader2, Play, RefreshCw, RotateCcw, Save, Square } from 'lucide-react';
import type {
  OmniRouteBridge,
  OmniRouteLogReadResult,
  OmniRouteLogTarget,
  OmniRoutePathTarget,
  OmniRouteStatusSnapshot,
} from '../../types/omniroute-management.js';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { cn } from '@/lib/utils';

type PageState = 'loading' | 'ready' | 'error';
type Operation = 'start' | 'stop' | 'restart' | 'refresh' | 'save-port' | 'open-path' | 'load-log' | null;

const LOG_TARGETS: OmniRouteLogTarget[] = ['service-out', 'service-error'];
const PATH_TARGETS: OmniRoutePathTarget[] = ['config', 'data', 'logs'];

function getBridge(): OmniRouteBridge {
  return window.electronAPI.omniroute;
}

function statusBadgeVariant(status: OmniRouteStatusSnapshot['status']) {
  if (status === 'running') {
    return 'default' as const;
  }
  if (status === 'error' || status === 'partial') {
    return 'destructive' as const;
  }
  return 'secondary' as const;
}

function validatePortInput(value: string): string | null {
  const port = Number.parseInt(value, 10);
  if (!/^\d+$/.test(value.trim()) || !Number.isInteger(port)) {
    return 'omniroute.validation.numeric';
  }
  if (port < 1024 || port > 65535) {
    return 'omniroute.validation.range';
  }
  return null;
}

export default function OmniRouteManagementPage() {
  const { t } = useTranslation('common');
  const [status, setStatus] = useState<OmniRouteStatusSnapshot | null>(null);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [operation, setOperation] = useState<Operation>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [portInput, setPortInput] = useState('');
  const [selectedLogTarget, setSelectedLogTarget] = useState<OmniRouteLogTarget>('service-out');
  const [logs, setLogs] = useState<Partial<Record<OmniRouteLogTarget, OmniRouteLogReadResult>>>({});
  const [isPending, startTransition] = useTransition();

  const isBusy = operation !== null || isPending;
  const portValidationKey = useMemo(() => validatePortInput(portInput), [portInput]);
  const isRunning = status?.status === 'running';

  const applyStatus = (nextStatus: OmniRouteStatusSnapshot) => {
    startTransition(() => {
      setStatus(nextStatus);
      setPortInput(String(nextStatus.config.port));
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

  const runLifecycle = async (action: 'start' | 'stop' | 'restart') => {
    setOperation(action);
    setErrorMessage(null);
    try {
      const result = await getBridge()[action]();
      applyStatus(result.status);
      if (!result.success) {
        setErrorMessage(result.error ?? t('omniroute.errors.operationFailed'));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOperation(null);
    }
  };

  const savePort = async () => {
    if (portValidationKey) {
      setErrorMessage(t(portValidationKey));
      return;
    }

    setOperation('save-port');
    setErrorMessage(null);
    try {
      const result = await getBridge().setConfig({ port: Number.parseInt(portInput, 10) });
      applyStatus(result.status);
      if (!result.success) {
        setErrorMessage(result.error ?? t('omniroute.errors.saveFailed'));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOperation(null);
    }
  };

  const loadLog = async (target: OmniRouteLogTarget = selectedLogTarget) => {
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

  const openPath = async (target: OmniRoutePathTarget) => {
    setOperation('open-path');
    setErrorMessage(null);
    try {
      const result = await getBridge().openPath(target);
      if (!result.success) {
        setErrorMessage(result.error ?? t('omniroute.errors.openPathFailed'));
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

    void refreshStatus();

    return () => {
      disposed = true;
      unsubscribe();
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
          <span>{t('omniroute.loading')}</span>
        </div>
      </div>
    );
  }

  const activeLog = logs[selectedLogTarget];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('omniroute.title')}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t('omniroute.description')}</p>
        </div>
        <Button variant="outline" onClick={() => void refreshStatus()} disabled={isBusy}>
          <RefreshCw className={cn('mr-2 h-4 w-4', operation === 'refresh' && 'animate-spin')} />
          {t('omniroute.actions.refresh')}
        </Button>
      </div>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('omniroute.errors.title')}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {pageState === 'error' && !status ? null : (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>{t('omniroute.status.title')}</CardTitle>
                  <CardDescription>{status?.config.baseUrl}</CardDescription>
                </div>
                {status ? <Badge variant={statusBadgeVariant(status.status)}>{t(`omniroute.status.${status.status}`)}</Badge> : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[1fr_auto]">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('omniroute.status.baseUrl')}</p>
                  <p className="mt-2 break-all font-mono text-sm">{status?.config.baseUrl ?? '-'}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('omniroute.status.pm2')}</p>
                  <p className="mt-2 break-all font-mono text-sm">{status?.pm2ExecutablePath ?? t('omniroute.status.pm2Missing')}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-2 md:justify-end">
                <Button onClick={() => void runLifecycle('start')} disabled={isBusy || isRunning}>
                  <Play className="mr-2 h-4 w-4" />
                  {operation === 'start' ? t('omniroute.actions.working') : t('omniroute.actions.start')}
                </Button>
                <Button variant="outline" onClick={() => void runLifecycle('stop')} disabled={isBusy || !isRunning}>
                  <Square className="mr-2 h-4 w-4" />
                  {operation === 'stop' ? t('omniroute.actions.working') : t('omniroute.actions.stop')}
                </Button>
                <Button variant="outline" onClick={() => void runLifecycle('restart')} disabled={isBusy}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {operation === 'restart' ? t('omniroute.actions.working') : t('omniroute.actions.restart')}
                </Button>
                {status?.config.baseUrl ? (
                  <Button variant="secondary" onClick={() => void window.electronAPI.openExternal(status.config.baseUrl)}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t('omniroute.actions.openUi')}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('omniroute.config.title')}</CardTitle>
                <CardDescription>{t('omniroute.config.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input value={portInput} onChange={(event) => setPortInput(event.target.value)} disabled={isBusy} inputMode="numeric" />
                  <Button onClick={() => void savePort()} disabled={isBusy || Boolean(portValidationKey)}>
                    <Save className="mr-2 h-4 w-4" />
                    {operation === 'save-port' ? t('omniroute.actions.working') : t('omniroute.actions.save')}
                  </Button>
                </div>
                {portValidationKey ? <p className="text-sm text-destructive">{t(portValidationKey)}</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('omniroute.paths.title')}</CardTitle>
                <CardDescription>{t('omniroute.paths.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {PATH_TARGETS.map((target) => (
                  <div key={target} className="flex flex-col gap-2 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t(`omniroute.paths.${target}`)}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{status?.paths[target]}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void openPath(target)} disabled={isBusy}>
                      <FolderOpen className="mr-2 h-4 w-4" />
                      {t('omniroute.actions.open')}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('omniroute.processes.title')}</CardTitle>
              <CardDescription>{t('omniroute.processes.description')}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">{t('omniroute.processes.name')}</th>
                    <th className="py-2 pr-4">{t('omniroute.processes.status')}</th>
                    <th className="py-2 pr-4">PID</th>
                    <th className="py-2 pr-4">{t('omniroute.processes.restarts')}</th>
                  </tr>
                </thead>
                <tbody>
                  {status?.processes.map((process) => (
                    <tr key={process.name} className="border-t border-border/70">
                      <td className="py-3 pr-4 font-mono">{process.name}</td>
                      <td className="py-3 pr-4">{t(`omniroute.processStatus.${process.status}`)}</td>
                      <td className="py-3 pr-4">{process.pid ?? '-'}</td>
                      <td className="py-3 pr-4">{process.restartCount ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('omniroute.logs.title')}</CardTitle>
              <CardDescription>{t('omniroute.logs.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={selectedLogTarget} onValueChange={(value) => setSelectedLogTarget(value as OmniRouteLogTarget)}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <TabsList>
                    {LOG_TARGETS.map((target) => (
                      <TabsTrigger key={target} value={target}>{t(`omniroute.logs.targets.${target}`)}</TabsTrigger>
                    ))}
                  </TabsList>
                  <Button variant="outline" size="sm" onClick={() => void loadLog()} disabled={isBusy}>
                    <RefreshCw className={cn('mr-2 h-4 w-4', operation === 'load-log' && 'animate-spin')} />
                    {t('omniroute.actions.refreshLogs')}
                  </Button>
                </div>
                {LOG_TARGETS.map((target) => (
                  <TabsContent key={target} value={target} className="mt-4">
                    <pre className="min-h-64 max-h-96 overflow-auto rounded-lg border border-border/70 bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
                      {logs[target]?.lines.length ? logs[target]?.lines.join('\n') : t('omniroute.logs.empty')}
                    </pre>
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
