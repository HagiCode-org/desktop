import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { toast } from 'sonner';
import {
  Play,
  Square,
  RotateCw,
  Loader2,
  ExternalLink,
  ArrowRight,
  Code2,
  PackageOpen,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { switchView } from '@/store/slices/viewSlice';
import type { AppDispatch } from '@/store';
import type {
  CodeServerStatusSnapshot,
  CodeServerOverallStatus,
} from '../../types/code-server-management.js';

type NormalizedStatus = 'loading' | 'running' | 'stopped' | 'error';

type MiniCardOperation = 'enable' | 'start' | 'stop' | 'restart' | null;

interface ServiceMiniCardDisplayProps {
  title: string;
  icon: LucideIcon;
  status: NormalizedStatus;
  version?: string | null;
  port?: number | null;
  url?: string | null;
  isBusy: boolean;
  lifecycleBlocked: boolean;
  enableRequired: boolean;
  enableInProgress: boolean;
  enableProgress?: number;
  openLabel: string;
  startLabel: string;
  stopLabel: string;
  restartLabel: string;
  onEnable: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onOpen?: () => void;
  onViewDetails: () => void;
}

function resolveBlockedReason(snapshot: {
  error?: string;
  runtime?: {
    message?: string;
  };
  remediation?: {
    message?: string;
  };
} | null): string | null {
  return snapshot?.error ?? snapshot?.remediation?.message ?? snapshot?.runtime?.message ?? null;
}

function statusVariant(status: NormalizedStatus) {
  if (status === 'running') return 'default' as const;
  if (status === 'error') return 'destructive' as const;
  return 'secondary' as const;
}

function ServiceMiniCardDisplay({
  title,
  icon: Icon,
  status,
  version,
  port,
  url,
  isBusy,
  lifecycleBlocked,
  enableRequired,
  enableInProgress,
  enableProgress,
  openLabel,
  startLabel,
  stopLabel,
  restartLabel,
  onEnable,
  onStart,
  onStop,
  onRestart,
  onOpen,
  onViewDetails,
}: ServiceMiniCardDisplayProps) {
  const { t } = useTranslation('common');

  const isRunning = status === 'running';
  const isLoading = status === 'loading';
  const actionDisabled = isBusy || isLoading;

  const statusLabel = (() => {
    if (isLoading) return t('status.loading');
    if (enableInProgress) return t('dependencyManagement.vendoredRuntime.status.extracting');
    if (enableRequired) return t('dependencyManagement.vendoredRuntime.status.enable-required');
    if (lifecycleBlocked) return t('system.services.notReady');
    switch (status) {
      case 'running': return t('status.running');
      case 'stopped': return t('status.stopped');
      case 'error': return t('status.error');
    }
  })();

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold text-foreground">{title}</span>
        </div>
        <Badge variant={statusVariant(status)} className="mt-0.5 shrink-0">
          {isLoading || enableInProgress ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              {statusLabel}
            </span>
          ) : statusLabel}
        </Badge>
      </div>

      <div className="min-h-[2.75rem] space-y-1 text-sm text-muted-foreground">
        <div className="text-xs">
          {t('common.version')}: <span className="font-mono">{version ?? t('dependencyManagement.unavailable')}</span>
        </div>
        <div>
          {enableInProgress ? (
            <span className="text-amber-600 dark:text-amber-500">
              {t('dependencyManagement.vendoredRuntime.activationInline', { percent: enableProgress ?? 0 })}
            </span>
          ) : enableRequired ? (
            <span className="text-amber-600 dark:text-amber-500">{t('system.services.enableRequired')}</span>
          ) : lifecycleBlocked ? (
            <span className="text-amber-600 dark:text-amber-500">{t('system.services.installRequired')}</span>
          ) : isRunning && url ? (
            <span className="break-all font-mono text-xs text-muted-foreground">{url}</span>
          ) : port ? (
            <span>{t('system.services.port', { port })}</span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
        {enableRequired || enableInProgress ? (
          <Button
            type="button"
            size="sm"
            onClick={onEnable}
            disabled={isBusy || enableInProgress}
            className="gap-1.5"
          >
            {isBusy || enableInProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageOpen className="h-3.5 w-3.5" />}
            {enableInProgress ? t('dependencyManagement.vendoredRuntime.status.extracting') : t('dependencyManagement.vendoredRuntime.actions.enable')}
          </Button>
        ) : isRunning ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onStop}
            disabled={actionDisabled}
            className="gap-1.5"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
            {stopLabel}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={onStart}
            disabled={actionDisabled}
            className="gap-1.5"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {startLabel}
          </Button>
        )}

        {!enableRequired && !enableInProgress && isRunning && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRestart}
            disabled={actionDisabled}
            className="gap-1.5 text-muted-foreground"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
            {restartLabel}
          </Button>
        )}

        {isRunning && onOpen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpen}
            className="ml-auto gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {openLabel}
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onViewDetails}
          className={cn('gap-1 text-primary', isRunning && onOpen ? '' : 'ml-auto')}
        >
          {t('system.services.viewDetails')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function normalizeCodeServerStatus(
  status: CodeServerOverallStatus | undefined,
  lifecycleBlocked: boolean,
): NormalizedStatus {
  if (!status) return 'loading';
  if (lifecycleBlocked && status !== 'running') return 'stopped';
  switch (status) {
    case 'running': return 'running';
    case 'stopped': return 'stopped';
    case 'error': return 'error';
    case 'missing':
    case 'damaged': return 'stopped';
    default: return 'stopped';
  }
}

export function CodeServerMiniCard() {
  const { t } = useTranslation('common');
  const dispatch = useDispatch<AppDispatch>();

  const [snapshot, setSnapshot] = useState<CodeServerStatusSnapshot | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [operation, setOperation] = useState<MiniCardOperation>(null);

  const isBusy = operation !== null;
  const enableRequired = snapshot?.runtime.primaryAction === 'enable';
  const enableInProgress = snapshot?.runtime.status === 'extracting';
  const lifecycleBlocked =
    !snapshot?.pm2Available || snapshot?.runtime.installStatus !== 'installed' || enableInProgress;
  const blockedReason = resolveBlockedReason(snapshot);
  const normalizedStatus = normalizeCodeServerStatus(snapshot?.status, lifecycleBlocked);

  useEffect(() => {
    let disposed = false;
    const bridge = window.electronAPI.codeServer;

    void bridge.getStatus().then((s) => {
      if (!disposed) {
        setSnapshot(s);
        setIsInitialLoading(false);
      }
    }).catch(() => {
      if (!disposed) setIsInitialLoading(false);
    });

    const unsub = bridge.onStatusChange((s) => {
      if (!disposed) setSnapshot(s);
    });
    const activationUnsub = window.electronAPI.dependencyManagement.onVendoredRuntimeActivationProgress((event) => {
      if (event.runtimeId !== 'code-server' || disposed) {
        return;
      }
      setSnapshot((current) => current ? {
        ...current,
        runtime: {
          ...current.runtime,
          activation: event,
          status: ['completed', 'failed'].includes(event.stage) ? current.runtime.status : 'extracting',
        },
      } : current);
      if (event.stage === 'completed' || event.stage === 'failed') {
        void bridge.getStatus().then((status) => {
          if (!disposed) {
            setSnapshot(status);
          }
        });
      }
    });

    return () => {
      disposed = true;
      unsub();
      activationUnsub();
    };
  }, []);

  const handleEnable = useCallback(async () => {
    setOperation('enable');
    try {
      const result = await window.electronAPI.dependencyManagement.enableVendoredRuntime('code-server');
      const nextStatus = await window.electronAPI.codeServer.getStatus();
      setSnapshot(nextStatus);
      if (!result.success) toast.error(result.error ?? t('system.services.startFailed'));
    } catch {
      toast.error(t('system.services.startFailed'));
    } finally {
      setOperation(null);
    }
  }, [t]);

  const handleStart = useCallback(async () => {
    if (lifecycleBlocked) {
      toast.error(blockedReason ?? t('system.services.notReady'));
      return;
    }
    setOperation('start');
    try {
      const result = await window.electronAPI.codeServer.start();
      if (result.status) setSnapshot(result.status);
      if (!result.success) {
        toast.error(t('system.services.startFailed'), {
          description: result.error,
        });
      }
    } catch {
      toast.error(t('system.services.startFailed'));
    } finally {
      setOperation(null);
    }
  }, [blockedReason, lifecycleBlocked, t]);

  const handleStop = useCallback(async () => {
    setOperation('stop');
    try {
      const result = await window.electronAPI.codeServer.stop();
      if (result.status) setSnapshot(result.status);
      if (!result.success) toast.error(t('system.services.stopFailed'));
    } catch {
      toast.error(t('system.services.stopFailed'));
    } finally {
      setOperation(null);
    }
  }, [t]);

  const handleRestart = useCallback(async () => {
    if (lifecycleBlocked) {
      toast.error(blockedReason ?? t('system.services.notReady'));
      return;
    }
    setOperation('restart');
    try {
      const result = await window.electronAPI.codeServer.restart();
      if (result.status) setSnapshot(result.status);
      if (!result.success) toast.error(t('system.services.restartFailed'));
    } catch {
      toast.error(t('system.services.restartFailed'));
    } finally {
      setOperation(null);
    }
  }, [blockedReason, lifecycleBlocked, t]);

  const handleOpen = useCallback(async () => {
    const url = snapshot?.config?.baseUrl;
    if (!url) return;
    try {
      await window.electronAPI.openExternal(url);
    } catch {
      // ignore
    }
  }, [snapshot?.config?.baseUrl]);

  const handleViewDetails = useCallback(() => {
    dispatch(switchView('code-server'));
  }, [dispatch]);

  return (
    <ServiceMiniCardDisplay
      title={t('sidebar.codeServer')}
      icon={Code2}
      status={isInitialLoading ? 'loading' : normalizedStatus}
      version={snapshot?.runtime.version ?? null}
      port={snapshot?.config?.port ?? null}
      url={snapshot?.status === 'running' ? snapshot.config?.baseUrl : null}
      isBusy={isBusy}
      lifecycleBlocked={lifecycleBlocked && snapshot !== null}
      enableRequired={Boolean(enableRequired)}
      enableInProgress={Boolean(enableInProgress)}
      enableProgress={snapshot?.runtime.activation?.percentage}
      openLabel={t('codeServer.actions.openBrowser')}
      startLabel={t('codeServer.actions.start')}
      stopLabel={t('codeServer.actions.stop')}
      restartLabel={t('codeServer.actions.restart')}
      onEnable={() => void handleEnable()}
      onStart={() => void handleStart()}
      onStop={() => void handleStop()}
      onRestart={() => void handleRestart()}
      onOpen={() => void handleOpen()}
      onViewDetails={handleViewDetails}
    />
  );
}
