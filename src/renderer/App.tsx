import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, FileText, FolderSync, LoaderCircle, RefreshCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import SidebarNavigation from './components/SidebarNavigation';
import SystemManagementView from './components/SystemManagementView';
import SystemDiagnosticPage from './components/SystemDiagnosticPage';
import WebView from './components/WebView';
import VersionManagementPage from './components/VersionManagementPage';
import NpmManagementPage from './components/NpmManagementPage';
import SettingsPage from './components/SettingsPage';
import InstallConfirmDialog from './components/InstallConfirmDialog';
import OnboardingWizard from './components/onboarding/OnboardingWizard';
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert';
import { Button } from './components/ui/button';
import { switchView } from './store/slices/viewSlice';
import { restartOnboardingFlow } from './store/slices/onboardingSlice';
import { selectWebServiceInfo } from './store/slices/webServiceSlice';
import { runCriticalStartupInitialization, startBackgroundStartupInitialization } from './store';
import type { RootState, AppDispatch } from './store';
import { buildAccessUrl, DEFAULT_WEB_SERVICE_HOST, DEFAULT_WEB_SERVICE_PORT } from '../types/web-service-network';
import type { DistributionMode } from '../types/distribution-mode';
import type { NpmManagementBridge } from '../types/npm-management';
import type {
  DataDirectoryMutationResult,
  DesktopBootstrapSnapshot,
} from '../types/bootstrap';
import type { LogDirectoryOpenResult } from '../types/log-directory';

type BootstrapPhase = 'loading' | 'ready' | 'error';

interface AppProps {
  onRendererMounted?: () => void;
  onShellReady?: () => void;
  onBootstrapErrorVisible?: () => void;
}

const BOOTSTRAP_TIMEOUT_MS = 10000;

async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs: number = BOOTSTRAP_TIMEOUT_MS,
): Promise<T> {
  let timeoutHandle: number | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = window.setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
  }
}

declare global {
  interface Window {
    electronAPI: {
      bootstrap?: {
        getCachedSnapshot: () => DesktopBootstrapSnapshot | null;
        getSnapshot: () => Promise<DesktopBootstrapSnapshot>;
        refresh: () => Promise<DesktopBootstrapSnapshot>;
        restoreDefaultDataDirectory: () => Promise<DataDirectoryMutationResult>;
        openDesktopLogs: () => Promise<LogDirectoryOpenResult>;
      };
      getAppVersion: () => Promise<string>;
      getDistributionMode: () => Promise<DistributionMode>;
      showWindow: () => Promise<void>;
      hideWindow: () => Promise<void>;
      onServerStatusChange: (callback: (status: 'running' | 'stopped' | 'error') => void) => void;
      startServer: () => Promise<boolean>;
      stopServer: () => Promise<boolean>;
      getServerStatus: () => Promise<'running' | 'stopped' | 'error'>;
      switchView: (view: 'system' | 'web' | 'version' | 'diagnostic' | 'npm-management' | 'settings') => Promise<{ success: boolean; reason?: string; url?: string }>;
      getCurrentView: () => Promise<string>;
      onViewChange: (callback: (view: 'system' | 'web' | 'version' | 'diagnostic' | 'npm-management' | 'settings') => void) => () => void;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      openHagicodeInApp: (url: string) => Promise<{ success: boolean; error?: string }>;
      onOnboardingSwitchToWeb: (callback: (data: { versionId: string }) => void) => () => void;
      onOnboardingOpenHagicode: (callback: (data: { url: string; versionId: string }) => void) => () => void;
      resetOnboarding: () => Promise<{ success: boolean; error?: string }>;
      onOnboardingShow: (callback: () => void) => () => void;
      npmManagement: NpmManagementBridge;
    };
  }
}

function buildRendererBootstrapErrorSnapshot(
  summary: string,
  details: string,
  stage: DesktopBootstrapSnapshot['stage'] = 'renderer-shell',
): DesktopBootstrapSnapshot {
  return {
    status: 'error',
    stage,
    summary,
    details,
    dataDirectory: null,
    diagnostics: [],
    recovery: {
      canRetry: true,
      canRestoreDefault: false,
      canOpenDesktopLogs: false,
    },
    generatedAt: new Date().toISOString(),
  };
}

function DesktopAppContent({ distributionMode }: { distributionMode: DistributionMode }) {
  const dispatch = useDispatch<AppDispatch>();
  const currentView = useSelector((state: RootState) => state.view.currentView);
  const webServiceUrl = useSelector((state: RootState) => state.view.webServiceUrl);
  const webServiceInfo = useSelector((state: RootState) => selectWebServiceInfo(state));
  const fallbackWebServiceUrl = buildAccessUrl(
    webServiceInfo.host || DEFAULT_WEB_SERVICE_HOST,
    webServiceInfo.port || DEFAULT_WEB_SERVICE_PORT
  );

  useEffect(() => {
    const unsubscribeViewChange = window.electronAPI.onViewChange((view: 'system' | 'web' | 'version' | 'diagnostic' | 'npm-management' | 'settings') => {
      dispatch(switchView(view));
    });

    const unsubscribeOnboardingShow = window.electronAPI.onOnboardingShow(() => {
      dispatch(restartOnboardingFlow());
    });

    const unsubscribeOnboardingOpenHagicode = window.electronAPI.onOnboardingOpenHagicode(async (data) => {
      try {
        await window.electronAPI.openHagicodeInApp(data.url);
      } catch (error) {
        console.error('[App] Failed to open Hagicode:', error);
      }
    });

    return () => {
      if (typeof unsubscribeViewChange === 'function') {
        unsubscribeViewChange();
      }
      if (typeof unsubscribeOnboardingShow === 'function') {
        unsubscribeOnboardingShow();
      }
      if (typeof unsubscribeOnboardingOpenHagicode === 'function') {
        unsubscribeOnboardingOpenHagicode();
      }
    };
  }, [dispatch]);

  useEffect(() => {
    if (distributionMode === 'steam' && currentView === 'version') {
      dispatch(switchView('system'));
    }
  }, [currentView, dispatch, distributionMode]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
      </div>

      <SidebarNavigation distributionMode={distributionMode} />

      <div className="ml-64 transition-all duration-500 ease-out">
        <div className="container mx-auto px-4 py-8 min-h-screen">
          {currentView === 'system' && <SystemManagementView distributionMode={distributionMode} />}
          {currentView === 'web' && <WebView src={webServiceUrl || fallbackWebServiceUrl} />}
          {currentView === 'version' && <VersionManagementPage distributionMode={distributionMode} />}
          {currentView === 'diagnostic' && <SystemDiagnosticPage />}
          {currentView === 'npm-management' && <NpmManagementPage />}
          {currentView === 'settings' && <SettingsPage distributionMode={distributionMode} />}
        </div>
      </div>

      <InstallConfirmDialog />
      <OnboardingWizard />
    </div>
  );
}

function BootstrapLoadingShell({
  summary,
  details,
  stage,
}: {
  summary: string;
  details?: string;
  stage: DesktopBootstrapSnapshot['stage'];
}) {
  const { t } = useTranslation('common');
  const stageIndex = useMemo(() => {
    const order: DesktopBootstrapSnapshot['stage'][] = [
      'bootstrap-start',
      'config-ready',
      'data-directory-ready',
      'shell-ready',
    ];

    return Math.max(order.indexOf(stage), 0);
  }, [stage]);
  const steps = [
    t('bootstrap.steps.shell'),
    t('bootstrap.steps.config'),
    t('bootstrap.steps.dataDirectory'),
    t('bootstrap.steps.render'),
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/40">
        <div className="flex items-center gap-3 text-slate-200">
          <LoaderCircle className="h-7 w-7 animate-spin text-cyan-400" />
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Hagicode Desktop</p>
            <h1 className="mt-2 text-2xl font-semibold">{t('bootstrap.loading.title')}</h1>
          </div>
        </div>

        <p className="mt-6 text-lg text-slate-200">{summary}</p>
        <p className="mt-2 text-sm text-slate-400">
          {details || t('bootstrap.loading.description')}
        </p>

        <div className="mt-8 grid gap-3">
          {steps.map((label, index) => {
            const active = index <= stageIndex;

            return (
              <div
                key={label}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                  active ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-100' : 'border-slate-800 bg-slate-950/40 text-slate-500'
                }`}
              >
                <span>{label}</span>
                <span className="text-xs uppercase tracking-[0.2em]">
                  {active ? t('bootstrap.loading.stepActive') : t('bootstrap.loading.stepPending')}
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-xs uppercase tracking-[0.2em] text-slate-500">
          {t('bootstrap.loading.stage', { stage })}
        </p>
      </div>
    </div>
  );
}

function BootstrapErrorShell({
  snapshot,
  pendingAction,
  onRetry,
  onRestoreDefault,
  onOpenLogs,
}: {
  snapshot: DesktopBootstrapSnapshot;
  pendingAction: 'retry' | 'restore' | 'logs' | null;
  onRetry: () => Promise<void>;
  onRestoreDefault: () => Promise<void>;
  onOpenLogs: () => Promise<void>;
}) {
  const { t } = useTranslation('common');
  const diagnostic = snapshot.diagnostics[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="w-full max-w-3xl rounded-3xl border border-rose-500/30 bg-slate-900/95 p-8 shadow-2xl shadow-slate-950/50">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-rose-500/10 p-3 text-rose-300">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <p className="text-sm uppercase tracking-[0.3em] text-rose-300/70">Hagicode Desktop</p>
            <h1 className="mt-2 text-2xl font-semibold">{t('bootstrap.error.title')}</h1>
            <p className="mt-3 text-base text-slate-200">{snapshot.summary}</p>
            <p className="mt-2 text-sm text-slate-400">{snapshot.details || t('bootstrap.error.description')}</p>
          </div>
        </div>

        <Alert className="mt-8 border-slate-800 bg-slate-950/60 text-slate-200">
          <AlertTitle>{t('bootstrap.error.diagnosticTitle')}</AlertTitle>
          <AlertDescription className="mt-3 space-y-2 text-sm leading-6">
            <p>{t('bootstrap.error.stage', { stage: snapshot.stage })}</p>
            {diagnostic?.summary && <p>{t('bootstrap.error.summary', { summary: diagnostic.summary })}</p>}
            {diagnostic?.normalizedPath && (
              <p>{t('bootstrap.error.path', { path: diagnostic.normalizedPath })}</p>
            )}
            {diagnostic?.detail && <p>{diagnostic.detail}</p>}
          </AlertDescription>
        </Alert>

        <div className="mt-8 flex flex-wrap gap-3">
          {snapshot.recovery.canOpenDesktopLogs && (
            <Button
              variant="outline"
              onClick={() => void onOpenLogs()}
              disabled={pendingAction !== null}
            >
              <FileText className="mr-2 h-4 w-4" />
              {pendingAction === 'logs' ? t('bootstrap.actions.working') : t('bootstrap.actions.openLogs')}
            </Button>
          )}
          {snapshot.recovery.canRestoreDefault && (
            <Button
              variant="outline"
              onClick={() => void onRestoreDefault()}
              disabled={pendingAction !== null}
            >
              <FolderSync className="mr-2 h-4 w-4" />
              {pendingAction === 'restore' ? t('bootstrap.actions.working') : t('bootstrap.actions.restoreDefault')}
            </Button>
          )}
          {snapshot.recovery.canRetry && (
            <Button onClick={() => void onRetry()} disabled={pendingAction !== null}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {pendingAction === 'retry' ? t('bootstrap.actions.working') : t('bootstrap.actions.retry')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function App({ onRendererMounted, onShellReady, onBootstrapErrorVisible }: AppProps) {
  const { t } = useTranslation('common');
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('normal');
  const [bootstrapPhase, setBootstrapPhase] = useState<BootstrapPhase>('loading');
  const [bootstrapSnapshot, setBootstrapSnapshot] = useState<DesktopBootstrapSnapshot | null>(null);
  const [pendingAction, setPendingAction] = useState<'retry' | 'restore' | 'logs' | null>(null);
  const mountedRef = useRef(true);
  const shellReadyNotifiedRef = useRef(false);
  const postShellInitializationStartedRef = useRef(false);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useEffect(() => {
    onRendererMounted?.();
  }, [onRendererMounted]);

  const hydrateBootstrap = async (requestMode: 'initial' | 'refresh') => {
    const bridge = window.electronAPI?.bootstrap;
    if (!bridge) {
      const snapshot = buildRendererBootstrapErrorSnapshot(
        'bootstrap bridge is unavailable',
        'window.electronAPI.bootstrap is missing before the Desktop shell can initialize.',
        'preload-bridge',
      );
      if (mountedRef.current) {
        setBootstrapSnapshot(snapshot);
        setBootstrapPhase('error');
      }
      return;
    }

    if (mountedRef.current) {
      setBootstrapPhase('loading');
    }

    try {
      const cachedSnapshot = requestMode === 'initial'
        ? bridge.getCachedSnapshot?.() ?? null
        : null;
      const snapshot = cachedSnapshot ?? (
        requestMode === 'refresh'
          ? await withTimeout(bridge.refresh(), 'bootstrap refresh')
          : await withTimeout(bridge.getSnapshot(), 'bootstrap snapshot')
      );

      if (!mountedRef.current) {
        return;
      }

      if (snapshot.status === 'error') {
        setBootstrapSnapshot(snapshot);
        setBootstrapPhase('error');
        return;
      }

      setBootstrapSnapshot(snapshot);
      setBootstrapSnapshot({
        ...snapshot,
        status: 'ready',
        stage: 'shell-ready',
      });
      setBootstrapPhase('ready');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!mountedRef.current) {
        return;
      }

      setBootstrapSnapshot(buildRendererBootstrapErrorSnapshot(
        'renderer shell initialization failed',
        detail,
      ));
      setBootstrapPhase('error');
    }
  };

  useEffect(() => {
    void hydrateBootstrap('initial');
  }, []);

  useEffect(() => {
    if (bootstrapPhase !== 'ready') {
      return;
    }

    startBackgroundStartupInitialization();

    if (shellReadyNotifiedRef.current) {
      return;
    }

    shellReadyNotifiedRef.current = true;

    let shellRevealed = false;
    const revealShell = () => {
      if (shellRevealed) {
        return;
      }

      shellRevealed = true;
      onShellReady?.();
    };

    const animationFrame = window.requestAnimationFrame(revealShell);
    const revealTimeout = window.setTimeout(revealShell, 160);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(revealTimeout);
    };
  }, [bootstrapPhase, onShellReady]);

  useEffect(() => {
    if (bootstrapPhase !== 'ready' || postShellInitializationStartedRef.current) {
      return;
    }

    postShellInitializationStartedRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        await withTimeout(
          runCriticalStartupInitialization(),
          'critical startup initialization',
        );
        const resolvedMode = await withTimeout(
          window.electronAPI.getDistributionMode(),
          'distribution mode lookup',
        );

        if (!cancelled && mountedRef.current) {
          setDistributionMode(resolvedMode);
        }
      } catch (error) {
        console.error('[App] Post-shell startup initialization failed:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrapPhase]);

  useEffect(() => {
    if (bootstrapPhase === 'error') {
      onBootstrapErrorVisible?.();
    }
  }, [bootstrapPhase, onBootstrapErrorVisible]);

  const handleRetry = async () => {
    setPendingAction('retry');
    try {
      await hydrateBootstrap('refresh');
    } finally {
      if (mountedRef.current) {
        setPendingAction(null);
      }
    }
  };

  const handleRestoreDefault = async () => {
    const bridge = window.electronAPI?.bootstrap;
    if (!bridge) {
      return;
    }

    setPendingAction('restore');
    try {
      const result = await bridge.restoreDefaultDataDirectory();
      if (!result.success) {
        const detail = result.error || t('bootstrap.toasts.restoreFailed');
        setBootstrapSnapshot((current) => current ?? buildRendererBootstrapErrorSnapshot(
          'failed to restore default data directory',
          detail,
        ));
        setBootstrapPhase('error');
        toast.error(detail);
        return;
      }

      toast.success(t('bootstrap.toasts.restoreSuccess'));
      await hydrateBootstrap('refresh');
    } finally {
      if (mountedRef.current) {
        setPendingAction(null);
      }
    }
  };

  const handleOpenLogs = async () => {
    const bridge = window.electronAPI?.bootstrap;
    if (!bridge) {
      return;
    }

    setPendingAction('logs');
    try {
      const result = await bridge.openDesktopLogs();
      if (result.success) {
        toast.success(t('bootstrap.toasts.logsOpened'));
      } else {
        toast.error(t('bootstrap.toasts.logsFailed'));
      }
    } finally {
      if (mountedRef.current) {
        setPendingAction(null);
      }
    }
  };

  if (bootstrapPhase !== 'ready') {
    if (bootstrapPhase === 'error' && bootstrapSnapshot) {
      return (
        <BootstrapErrorShell
          snapshot={bootstrapSnapshot}
          pendingAction={pendingAction}
          onRetry={handleRetry}
          onRestoreDefault={handleRestoreDefault}
          onOpenLogs={handleOpenLogs}
        />
      );
    }

    return (
      <BootstrapLoadingShell
        summary={bootstrapSnapshot?.summary || t('bootstrap.loading.summary')}
        details={bootstrapSnapshot?.details}
        stage={bootstrapSnapshot?.stage || 'bootstrap-start'}
      />
    );
  }

  return <DesktopAppContent distributionMode={distributionMode} />;
}

export default App;
