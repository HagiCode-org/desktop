import { useState, useEffect, useCallback } from 'react';
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
  Route,
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
import type {
  OmniRouteStatusSnapshot,
  OmniRouteOverallStatus,
} from '../../types/omniroute-management.js';

// ─── types ───────────────────────────────────────────────────────────────────

type NormalizedStatus = 'loading' | 'running' | 'stopped' | 'error';

interface ServiceMiniCardDisplayProps {
  title: string;
  icon: LucideIcon;
  status: NormalizedStatus;
  version?: string | null;
  port?: number | null;
  url?: string | null;
  isBusy: boolean;
  lifecycleBlocked: boolean;
  openLabel: string;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onOpen?: () => void;
  onViewDetails: () => void;
}

// ─── pure display ─────────────────────────────────────────────────────────────

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
  openLabel,
  onStart,
  onStop,
  onRestart,
  onOpen,
  onViewDetails,
}: ServiceMiniCardDisplayProps) {
  const { t } = useTranslation('common');

  const isRunning = status === 'running';
  const isLoading = status === 'loading';
  const actionDisabled = isBusy || isLoading || lifecycleBlocked;

  const statusLabel = (() => {
    if (isLoading) return t('status.loading');
    if (lifecycleBlocked) return t('system.services.notReady');
    switch (status) {
      case 'running': return t('status.running');
      case 'stopped': return t('status.stopped');
      case 'error': return t('status.error');
    }
  })();

  return (
    <div className="flex flex-col rounded-2xl border border-border/70 bg-card p-5 shadow-sm gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold text-foreground">{title}</span>
        </div>
        <Badge variant={statusVariant(status)} className="shrink-0 mt-0.5">
          {isLoading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              {statusLabel}
            </span>
          ) : statusLabel}
        </Badge>
      </div>

      {/* Info row */}
      <div className="min-h-[2.75rem] space-y-1 text-sm text-muted-foreground">
        <div className="text-xs">
          {t('common.version')}: <span className="font-mono">{version ?? t('dependencyManagement.unavailable')}</span>
        </div>
        <div>
          {lifecycleBlocked ? (
            <span className="text-amber-600 dark:text-amber-500">{t('system.services.installRequired')}</span>
          ) : isRunning && url ? (
            <span className="font-mono text-xs text-muted-foreground break-all">{url}</span>
          ) : port ? (
            <span>{t('system.services.port', { port })}</span>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
        {/* Start / Stop toggle */}
        {!lifecycleBlocked && (
          isRunning ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onStop}
              disabled={actionDisabled}
              className="gap-1.5"
            >
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
              {t('omniroute.actions.stop')}
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
              {t('omniroute.actions.start')}
            </Button>
          )
        )}

        {/* Restart (only when running) */}
        {!lifecycleBlocked && isRunning && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRestart}
            disabled={actionDisabled}
            className="gap-1.5 text-muted-foreground"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
            {t('omniroute.actions.restart')}
          </Button>
        )}

        {/* Open URL */}
        {isRunning && onOpen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpen}
            className="gap-1.5 ml-auto"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {openLabel}
          </Button>
        )}

        {/* Details link — always visible, pushed to end when no open button */}
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

// ─── helpers ──────────────────────────────────────────────────────────────────

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

function normalizeOmniRouteStatus(
  status: OmniRouteOverallStatus | undefined,
): NormalizedStatus {
  if (!status) return 'loading';
  switch (status) {
    case 'running': return 'running';
    case 'stopped': return 'stopped';
    case 'partial':
    case 'error': return 'error';
    default: return 'stopped';
  }
}

// ─── CodeServerMiniCard ───────────────────────────────────────────────────────

export function CodeServerMiniCard() {
  const { t } = useTranslation('common');
  const dispatch = useDispatch<AppDispatch>();

  const [snapshot, setSnapshot] = useState<CodeServerStatusSnapshot | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [operation, setOperation] = useState<'start' | 'stop' | 'restart' | null>(null);

  const isBusy = operation !== null;
  const lifecycleBlocked =
    !snapshot?.pm2Available || snapshot?.runtime.installStatus !== 'installed';
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

    return () => {
      disposed = true;
      unsub();
    };
  }, []);

  const handleStart = useCallback(async () => {
    setOperation('start');
    try {
      const result = await window.electronAPI.codeServer.start();
      if (result.status) setSnapshot(result.status);
      if (!result.success) toast.error(t('system.services.startFailed'));
    } catch {
      toast.error(t('system.services.startFailed'));
    } finally {
      setOperation(null);
    }
  }, [t]);

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
  }, [t]);

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
      openLabel={t('codeServer.actions.openBrowser')}
      onStart={() => void handleStart()}
      onStop={() => void handleStop()}
      onRestart={() => void handleRestart()}
      onOpen={() => void handleOpen()}
      onViewDetails={handleViewDetails}
    />
  );
}

// ─── OmniRouteMiniCard ────────────────────────────────────────────────────────

export function OmniRouteMiniCard() {
  const { t } = useTranslation('common');
  const dispatch = useDispatch<AppDispatch>();

  const [snapshot, setSnapshot] = useState<OmniRouteStatusSnapshot | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [operation, setOperation] = useState<'start' | 'stop' | 'restart' | null>(null);

  const isBusy = operation !== null;
  const lifecycleBlocked =
    !snapshot?.pm2Available || snapshot?.runtime.installStatus !== 'installed';
  const normalizedStatus = normalizeOmniRouteStatus(snapshot?.status);

  useEffect(() => {
    let disposed = false;
    const bridge = window.electronAPI.omniroute;

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

    return () => {
      disposed = true;
      unsub();
    };
  }, []);

  const handleStart = useCallback(async () => {
    setOperation('start');
    try {
      const result = await window.electronAPI.omniroute.start();
      if (result.status) setSnapshot(result.status);
      if (!result.success) toast.error(t('system.services.startFailed'));
    } catch {
      toast.error(t('system.services.startFailed'));
    } finally {
      setOperation(null);
    }
  }, [t]);

  const handleStop = useCallback(async () => {
    setOperation('stop');
    try {
      const result = await window.electronAPI.omniroute.stop();
      if (result.status) setSnapshot(result.status);
      if (!result.success) toast.error(t('system.services.stopFailed'));
    } catch {
      toast.error(t('system.services.stopFailed'));
    } finally {
      setOperation(null);
    }
  }, [t]);

  const handleRestart = useCallback(async () => {
    setOperation('restart');
    try {
      const result = await window.electronAPI.omniroute.restart();
      if (result.status) setSnapshot(result.status);
      if (!result.success) toast.error(t('system.services.restartFailed'));
    } catch {
      toast.error(t('system.services.restartFailed'));
    } finally {
      setOperation(null);
    }
  }, [t]);

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
    dispatch(switchView('omniroute'));
  }, [dispatch]);

  return (
    <ServiceMiniCardDisplay
      title={t('sidebar.omniroute')}
      icon={Route}
      status={isInitialLoading ? 'loading' : normalizedStatus}
      version={snapshot?.runtime.version ?? null}
      port={snapshot?.config?.port ?? null}
      url={snapshot?.status === 'running' ? snapshot.config?.baseUrl : null}
      isBusy={isBusy}
      lifecycleBlocked={lifecycleBlocked && snapshot !== null}
      openLabel={t('omniroute.actions.openUi')}
      onStart={() => void handleStart()}
      onStop={() => void handleStop()}
      onRestart={() => void handleRestart()}
      onOpen={() => void handleOpen()}
      onViewDetails={handleViewDetails}
    />
  );
}
