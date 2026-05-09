import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { useNavigate } from '../hooks/useNavigate';
import { Package, Activity, FolderOpen, Globe, Monitor, LoaderCircle, BellRing, ArrowRight, type LucideIcon } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { toast } from 'sonner';
import WebServiceStatusCard from './WebServiceStatusCard';
import BlogFeedCard from './BlogFeedCard';
import { SidebarPromotionCard } from './SidebarPromotionCard';
import { Button } from '@/components/ui/button';
import { useSidebarPromotion } from '../hooks/useSidebarPromotion';
import {
  buildHomepageTourSteps,
  HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE,
  HOMEPAGE_TOUR_DOM_STABLE_DELAY_MS,
  HOMEPAGE_TOUR_VARIANTS,
  HOMEPAGE_TOUR_VARIANT_ATTRIBUTE,
  shouldAutoStartHomepageTour,
  startHomepageTour,
  type HomepageTourSession,
} from '@/lib/homepageInteractiveTour';
import { cn } from '@/lib/utils';
import { evaluateDependencyReadiness } from '../../shared/npm-managed-packages.js';
import { selectWebServiceInfo } from '../store/slices/webServiceSlice';
import { selectVisibleVersionUpdateReminder } from '../store/slices/versionUpdateSlice';
import { resetOnboarding, checkOnboardingTrigger } from '../store/thunks/onboardingThunks';
import { installWebServicePackage } from '../store/thunks/webServiceThunks';
import type { AppDispatch, RootState } from '../store';
import type {
  LogDirectoryErrorCode,
  LogDirectoryBridge,
  LogDirectoryTarget,
  LogDirectoryTargetStatus,
} from '@types/log-directory';
import type { DependencyReadinessSummary } from '../../types/dependency-management';
import type { DistributionMode } from '../../types/distribution-mode';
import { resolveDesktopLanguageCode } from '../../shared/desktop-languages';

interface InstalledVersion {
  id: string;
  version: string;
  platform: string;
  packageFilename: string;
  installedPath: string;
  installedAt: string;
  status: 'installed-ready' | 'payload-invalid' | 'runtime-incompatible' | 'desktop-incompatible';
  dependencies: any[];
  isActive: boolean;
}

declare global {
  interface Window {
    electronAPI: {
      versionGetActive: () => Promise<InstalledVersion | null>;
      onActiveVersionChanged: (callback: (version: InstalledVersion | null) => void) => (() => void) | void;
      logDirectory: LogDirectoryBridge;
    };
  }
}

type ServerStatus = 'running' | 'stopped' | 'error';
type LogTargetStateMap = Record<LogDirectoryTarget, LogDirectoryTargetStatus>;

function DashboardSummaryCard({
  icon: Icon,
  label,
  value,
  description,
  accentClass = 'text-primary',
  className,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  description: string;
  accentClass?: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-border/70 bg-card p-4 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className={cn('text-lg font-semibold text-foreground', valueClassName)}>{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
          <Icon className={`h-5 w-5 ${accentClass}`} />
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{description}</p>
    </section>
  );
}

interface SystemManagementViewProps {
  distributionMode?: DistributionMode;
}

const createDefaultLogTarget = (target: LogDirectoryTarget): LogDirectoryTargetStatus => ({
  target,
  available: false,
  exists: false,
  path: null,
  reason: target === 'web-app' ? 'no_active_version' : 'logs_not_found',
});

const createDefaultLogTargetMap = (): LogTargetStateMap => ({
  desktop: createDefaultLogTarget('desktop'),
  'web-app': createDefaultLogTarget('web-app'),
});

const toLogTargetStateMap = (targets: LogDirectoryTargetStatus[]): LogTargetStateMap => {
  const nextState = createDefaultLogTargetMap();

  for (const target of targets) {
    nextState[target.target] = target;
  }

  return nextState;
};

export default function SystemManagementView({
  distributionMode = 'normal',
}: SystemManagementViewProps) {
  const { t, i18n } = useTranslation(['common', 'components']);
  const { navigateTo } = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const webServiceInfo = useSelector((state: RootState) => selectWebServiceInfo(state));
  const versionUpdateReminder = useSelector((state: RootState) => selectVisibleVersionUpdateReminder(state));
  const currentView = useSelector((state: RootState) => state.view.currentView);
  const onboardingActive = useSelector((state: RootState) => state.onboarding.isActive);
  const shouldShowVersionUpdateReminder = distributionMode !== 'steam' && Boolean(versionUpdateReminder);
  const promotion = useSidebarPromotion();

  const [activeVersion, setActiveVersion] = useState<InstalledVersion | null>(null);
  const [logTargets, setLogTargets] = useState<LogTargetStateMap>(createDefaultLogTargetMap);
  const [isLogTargetsLoading, setIsLogTargetsLoading] = useState(true);
  const [openingTarget, setOpeningTarget] = useState<LogDirectoryTarget | null>(null);
  const [dependencyReadiness, setDependencyReadiness] = useState<DependencyReadinessSummary | null>(null);
  const [dependencyReadinessError, setDependencyReadinessError] = useState<string | null>(null);
  const homepageTourSessionRef = useRef<HomepageTourSession | null>(null);
  const homepageTourFrameRef = useRef<number | null>(null);
  const homepageTourTimeoutRef = useRef<number | null>(null);
  const currentLocale = resolveDesktopLanguageCode(i18n.resolvedLanguage ?? i18n.language);

  const clearPendingHomepageTourStartup = useCallback(() => {
    if (homepageTourFrameRef.current !== null) {
      window.cancelAnimationFrame(homepageTourFrameRef.current);
      homepageTourFrameRef.current = null;
    }

    if (homepageTourTimeoutRef.current !== null) {
      window.clearTimeout(homepageTourTimeoutRef.current);
      homepageTourTimeoutRef.current = null;
    }
  }, []);

  const destroyHomepageTourSession = useCallback((markCompleted = false) => {
    homepageTourSessionRef.current?.destroy({ markCompleted });
    homepageTourSessionRef.current = null;
  }, []);

  const loadLogTargets = useCallback(async (showErrorToast = true) => {
    setIsLogTargetsLoading(true);

    try {
      const targets = await window.electronAPI.logDirectory.listTargets();
      setLogTargets(toLogTargetStateMap(targets));
    } catch (error) {
      console.error('Failed to load log directory targets:', error);
      setLogTargets(createDefaultLogTargetMap());

      if (showErrorToast) {
        toast.error(t('system.logQuickAccess.errors.load_failed'));
      }
    } finally {
      setIsLogTargetsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let isDisposed = false;

    const loadInitialState = async () => {
      try {
        const [version, targets] = await Promise.all([
          window.electronAPI.versionGetActive(),
          window.electronAPI.logDirectory.listTargets(),
        ]);

        if (isDisposed) {
          return;
        }

        setActiveVersion(version);
        setLogTargets(toLogTargetStateMap(targets));
      } catch (error) {
        if (isDisposed) {
          return;
        }

        console.error('Failed to initialize system dashboard state:', error);
        toast.error(t('system.logQuickAccess.errors.load_failed'));
      } finally {
        if (!isDisposed) {
          setIsLogTargetsLoading(false);
        }
      }
    };

    void loadInitialState();

    const unsubscribeVersion = window.electronAPI.onActiveVersionChanged((version) => {
      setActiveVersion(version);
      void loadLogTargets(false);
    });

    return () => {
      isDisposed = true;
      if (typeof unsubscribeVersion === 'function') {
        unsubscribeVersion();
      }
    };
  }, [loadLogTargets, t]);

  useEffect(() => {
    let isDisposed = false;

    const loadDependencyReadiness = async () => {
      try {
        const snapshot = await window.electronAPI.dependencyManagement.refresh();
        if (!isDisposed) {
          setDependencyReadiness(evaluateDependencyReadiness(snapshot, []));
          setDependencyReadinessError(null);
        }
      } catch (error) {
        if (!isDisposed) {
          setDependencyReadiness(null);
          setDependencyReadinessError(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void loadDependencyReadiness();

    return () => {
      isDisposed = true;
    };
  }, [activeVersion?.id]);

  useEffect(() => {
    if (onboardingActive) {
      clearPendingHomepageTourStartup();
      destroyHomepageTourSession(false);
      return;
    }

    if (homepageTourSessionRef.current?.isActive()) {
      return;
    }

    clearPendingHomepageTourStartup();

    homepageTourFrameRef.current = window.requestAnimationFrame(() => {
      homepageTourFrameRef.current = null;
      homepageTourTimeoutRef.current = window.setTimeout(() => {
        homepageTourTimeoutRef.current = null;

        const steps = buildHomepageTourSteps({ t });
        if (!shouldAutoStartHomepageTour({ currentView, onboardingActive, steps })) {
          return;
        }

        homepageTourSessionRef.current = startHomepageTour({
          t,
          steps,
          onDestroyed: () => {
            homepageTourSessionRef.current = null;
          },
        });
      }, HOMEPAGE_TOUR_DOM_STABLE_DELAY_MS);
    });

    return () => {
      clearPendingHomepageTourStartup();
    };
  }, [
    clearPendingHomepageTourStartup,
    currentView,
    destroyHomepageTourSession,
    onboardingActive,
    t,
    activeVersion?.id,
    shouldShowVersionUpdateReminder,
  ]);

  useEffect(() => {
    return () => {
      clearPendingHomepageTourStartup();
      destroyHomepageTourSession(false);
    };
  }, [clearPendingHomepageTourStartup, destroyHomepageTourSession]);

  const getLogTargetDescription = useCallback((target: LogDirectoryTarget, status: LogDirectoryTargetStatus) => {
    if (status.reason) {
      return t(`system.logQuickAccess.errors.${status.reason}`);
    }

    return target === 'desktop'
      ? t('system.logQuickAccess.desktop.description')
      : t('system.logQuickAccess.webApp.description');
  }, [t]);

  const getOpenSuccessMessage = useCallback((target: LogDirectoryTarget) => {
    return target === 'desktop'
      ? t('system.logQuickAccess.desktop.openSuccess')
      : t('system.logQuickAccess.webApp.openSuccess');
  }, [t]);

  const getOpenErrorMessage = useCallback((errorCode?: LogDirectoryErrorCode) => {
    const normalizedCode = errorCode ?? 'open_failed';
    return t(`system.logQuickAccess.errors.${normalizedCode}`);
  }, [t]);

  const handleOpenLogDirectory = useCallback(async (target: LogDirectoryTarget) => {
    setOpeningTarget(target);

    try {
      const result = await window.electronAPI.logDirectory.open(target);

      if (result.success) {
        toast.success(getOpenSuccessMessage(target));
      } else {
        toast.error(getOpenErrorMessage(result.error));
      }

      await loadLogTargets(false);
    } catch (error) {
      console.error('Failed to open log directory:', error);
      toast.error(getOpenErrorMessage('open_failed'));
    } finally {
      setOpeningTarget(null);
    }
  }, [getOpenErrorMessage, getOpenSuccessMessage, loadLogTargets]);

  // Get server status from Redux store
  const serverStatus: ServerStatus =
    webServiceInfo.status === 'starting' || webServiceInfo.status === 'stopping'
      ? 'running'
      : webServiceInfo.status;

  const getStatusColor = (status: ServerStatus) => {
    switch (status) {
      case 'running':
        return 'text-primary';
      case 'stopped':
        return 'text-muted-foreground';
      case 'error':
        return 'text-destructive';
    }
  };

  const getStatusText = (status: ServerStatus) => {
    switch (status) {
      case 'running':
        return t('status.running');
      case 'stopped':
        return t('status.stopped');
      case 'error':
        return t('status.error');
    }
  };

  const handleStartWizard = async () => {
    try {
      await dispatch(resetOnboarding()).unwrap();
      const result = await dispatch(checkOnboardingTrigger()).unwrap();
      if (result.shouldShow) {
        toast.success(t('versionManagement.toast.onboardingStarted'));
      } else {
        toast.error(t('versionManagement.toast.onboardingFailed') + `: ${result.reason || 'Unknown reason'}`);
      }
    } catch (error) {
      console.error('Failed to start onboarding:', error);
      toast.error(t('versionManagement.toast.onboardingFailed'));
    }
  };

  const handleOpenVersionManagement = () => {
    navigateTo('version');
  };

  const handleOpenPromotion = useCallback(async (url: string) => {
    try {
      const result = await window.electronAPI.openExternal(url);
      if (!result.success) {
        console.error('Failed to open external link:', result.error);
      }
    } catch (error) {
      console.error('Failed to open external link:', error);
    }
  }, []);

  const handleOpenUpdateSettings = () => {
    navigateTo('settings');
  };

  const handleInstallLatest = async () => {
    if (!versionUpdateReminder?.latestVersion?.id) {
      return;
    }

    await dispatch(installWebServicePackage({
      version: versionUpdateReminder.latestVersion.id,
      options: {
        autoSwitchWhenIdle: true,
      },
    }));
  };

  const getUpdateReminderDescription = () => {
    if (!versionUpdateReminder) {
      return '';
    }

    switch (versionUpdateReminder.status) {
      case 'checking':
        return t('system.updateReminder.descriptions.checking');
      case 'downloading':
        return t('system.updateReminder.descriptions.downloading');
      case 'ready':
        return t('system.updateReminder.descriptions.ready');
      case 'failed':
        return t('system.updateReminder.descriptions.failed', {
          error: versionUpdateReminder.failure?.message ?? t('status.failed'),
        });
      case 'disabled':
        return t(`system.updateReminder.descriptions.${versionUpdateReminder.disabledReason ?? 'settings-disabled'}`);
      default:
        return '';
    }
  };

  const logQuickAccessItems: Array<{
    target: LogDirectoryTarget;
    icon: LucideIcon;
    label: string;
    status: LogDirectoryTargetStatus;
  }> = [
    {
      target: 'desktop',
      icon: Monitor,
      label: t('system.logQuickAccess.desktop.label'),
      status: logTargets.desktop,
    },
    {
      target: 'web-app',
      icon: Globe,
      label: t('system.logQuickAccess.webApp.label'),
      status: logTargets['web-app'],
    },
  ];

  const activeVersionInstalledAt = activeVersion
    ? new Date(activeVersion.installedAt).toLocaleDateString(currentLocale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;
  const dependencyValue = dependencyReadinessError
    ? t('status.error')
    : dependencyReadiness?.requiredReady
      ? t('dependencyManagement.status.ready', { ns: 'components' })
      : t('status.warning');
  const dependencyDescription = dependencyReadinessError
    ? dependencyReadinessError
    : dependencyReadiness?.requiredReady
      ? t('dependencyManagement.description')
      : t('webServiceStatus.dependencyReadinessAlert.message', { ns: 'components' });
  const networkValue = `${webServiceInfo.host || 'localhost'}:${webServiceInfo.port || 36556}`;
  const networkDescription = webServiceInfo.url || t('webServiceStatus.details.listenAddress', { ns: 'components' });
  const heroDetails = [
    { label: t('common.version'), value: activeVersion?.version ?? t('status.notInstalled') },
    { label: t('webServiceStatus.details.listenAddress', { ns: 'components' }), value: networkValue },
    { label: t('dependencyManagement.title'), value: dependencyValue },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section
        className="rounded-[28px] border border-border/80 bg-card px-6 py-6 shadow-sm lg:px-8"
        {...{ [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'hero' }}
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t('sidebar.dashboard')}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                {t('system.dashboard.title')}
              </h1>
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium',
                  serverStatus === 'running'
                    ? 'border-primary/25 bg-primary/10 text-primary'
                    : serverStatus === 'error'
                      ? 'border-destructive/25 bg-destructive/10 text-destructive'
                      : 'border-border bg-muted text-muted-foreground',
                )}
              >
                <Activity className="h-4 w-4" />
                {getStatusText(serverStatus)}
              </span>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t('system.dashboard.description')}
            </p>
          </div>

          <aside className="rounded-2xl border border-border/70 bg-muted/25 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {t('system.dashboard.title')}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {webServiceInfo.phaseMessage?.trim() || networkDescription}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-card px-3 py-2 text-right shadow-sm">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t('sidebar.webService')}
                </div>
                <div className={cn('mt-1 text-sm font-semibold', getStatusColor(serverStatus))}>
                  {getStatusText(serverStatus)}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {heroDetails.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm"
                >
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className="text-sm font-medium text-foreground">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row xl:flex-col">
              {!activeVersion ? (
                <Button type="button" onClick={() => void handleStartWizard()} className="justify-between">
                  <span>{t('system.noVersionInstalled.startWizard')}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" onClick={handleOpenVersionManagement} className="justify-between">
                  <span>{t('system.activeVersion.actions.manage')}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              <Button type="button" variant="outline" onClick={handleOpenUpdateSettings} className="justify-between">
                <span>{t('sidebar.settings')}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </aside>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardSummaryCard
            icon={Activity}
            label={t('sidebar.webService')}
            value={getStatusText(serverStatus)}
            description={webServiceInfo.phaseMessage?.trim() || webServiceInfo.url || t('system.dashboard.description')}
            accentClass={getStatusColor(serverStatus)}
            className="xl:col-span-2"
            valueClassName="text-xl"
          />
          <DashboardSummaryCard
            icon={Package}
            label={t('common.version')}
            value={activeVersion?.version ?? t('status.notInstalled')}
            description={activeVersionInstalledAt ?? t('system.noVersionInstalled.description')}
          />
          <DashboardSummaryCard
            icon={Globe}
            label={t('webServiceStatus.details.listenAddress', { ns: 'components' })}
            value={networkValue}
            description={networkDescription}
          />
          <DashboardSummaryCard
            icon={Monitor}
            label={t('dependencyManagement.title')}
            value={dependencyValue}
            description={dependencyDescription}
            accentClass={
              dependencyReadinessError
                ? 'text-destructive'
                : dependencyReadiness?.requiredReady
                  ? 'text-primary'
                  : 'text-amber-600'
            }
          />
        </div>
      </section>

      {shouldShowVersionUpdateReminder ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          {...{ [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'update-reminder' }}
        >
          <section className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-3">
                    <BellRing className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-foreground">{t('system.updateReminder.title')}</h2>
                      <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        {t(`system.updateReminder.states.${versionUpdateReminder.status}`)}
                      </span>
                    </div>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{getUpdateReminderDescription()}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('system.updateReminder.labels.current')}</div>
                    <div className="mt-1 font-medium text-foreground">
                      {versionUpdateReminder.currentVersion?.version ?? t('status.loading')}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('system.updateReminder.labels.latest')}</div>
                    <div className="mt-1 font-medium text-foreground">
                      {versionUpdateReminder.latestVersion?.version ?? t('status.loading')}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('system.updateReminder.labels.state')}</div>
                    <div className="mt-1 font-medium text-foreground">{t(`system.updateReminder.states.${versionUpdateReminder.status}`)}</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                {versionUpdateReminder.status === 'ready' ? (
                  <Button type="button" onClick={() => void handleInstallLatest()} className="justify-between">
                    <span>{t('system.updateReminder.actions.installLatest')}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button type="button" variant={versionUpdateReminder.status === 'ready' ? 'outline' : 'default'} onClick={handleOpenVersionManagement} className="justify-between">
                  <span>{t('system.updateReminder.actions.openVersionPage')}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
                {versionUpdateReminder.status === 'disabled' ? (
                  <Button type="button" variant="outline" onClick={handleOpenUpdateSettings}>
                    {t('system.updateReminder.actions.openSettings')}
                  </Button>
                ) : null}
              </div>
            </div>
          </section>
        </motion.div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <div {...{ [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'service-card' }}>
            <WebServiceStatusCard />
          </div>

          <section
            className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm"
            {...{ [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'log-access' }}
          >
            <div>
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-semibold">
                    <FolderOpen className="w-5 h-5 text-primary" />
                    {t('system.logQuickAccess.title')}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('system.logQuickAccess.description')}
                  </p>
                </div>
                <span className="inline-flex self-start rounded-full border border-border/70 bg-muted/25 px-2.5 py-1 text-xs text-muted-foreground">
                  {isLogTargetsLoading ? t('system.logQuickAccess.loading') : t('system.logQuickAccess.hint')}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {logQuickAccessItems.map(({ target, icon: Icon, label, status }) => {
                  const isOpening = openingTarget === target;
                  const isDisabled = isLogTargetsLoading || isOpening || !status.available;

                  return (
                    <div
                      key={target}
                      className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-xl border border-border/70 bg-background p-2.5 shadow-sm">
                            <Icon className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-medium text-foreground">{label}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {getLogTargetDescription(target, status)}
                            </p>
                          </div>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
                            status.available
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {status.available
                            ? t('system.logQuickAccess.status.available')
                            : t('system.logQuickAccess.status.unavailable')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                        <span className="text-xs text-muted-foreground">
                          {status.available
                            ? t('system.logQuickAccess.status.available')
                            : t('system.logQuickAccess.status.unavailable')}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleOpenLogDirectory(target)}
                          disabled={isDisabled}
                          className="justify-between gap-2"
                        >
                          <span>{label}</span>
                          {isOpening ? (
                            <LoaderCircle className="w-4 h-4 animate-spin" />
                          ) : (
                            <FolderOpen className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {activeVersion ? (
            <section
              className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm"
              {...{
                [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'version-section',
                [HOMEPAGE_TOUR_VARIANT_ATTRIBUTE]: HOMEPAGE_TOUR_VARIANTS.activeVersion,
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">{t('common.version')}</h2>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{activeVersion.version}</p>
                </div>
                <Button type="button" variant="ghost" onClick={handleOpenVersionManagement} className="px-0 text-primary">
                  {t('system.activeVersion.actions.manage')}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  { label: t('system.activeVersion.labels.version'), value: activeVersion.packageFilename },
                  { label: t('common.platform'), value: activeVersion.platform },
                  {
                    label: t('system.activeVersion.labels.installedAt'),
                    value: activeVersionInstalledAt ?? '-',
                  },
                  { label: t('system.activeVersion.labels.status'), value: t('system.activeVersion.states.ready') },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3"
                  >
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className="text-sm font-medium text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section
              className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm"
              {...{
                [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'version-section',
                [HOMEPAGE_TOUR_VARIANT_ATTRIBUTE]: HOMEPAGE_TOUR_VARIANTS.noVersionInstalled,
              }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Package className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-foreground">{t('system.noVersionInstalled.title')}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('system.noVersionInstalled.description')}
              </p>
              <div className="mt-5">
                <Button type="button" onClick={() => void handleStartWizard()}>
                  {t('system.noVersionInstalled.startWizard')}
                </Button>
              </div>
            </section>
          )}

          {promotion ? (
            <SidebarPromotionCard
              promotion={promotion}
              collapsed={false}
              label={t('navigation.promotion.label')}
              onActivate={(url) => void handleOpenPromotion(url)}
            />
          ) : null}

          <BlogFeedCard />
        </div>
      </div>

      <section className="rounded-3xl border border-transparent px-1 py-2 text-center">
        <p className="text-sm text-muted-foreground">{t('footer.copyright')}</p>
        <p className="mt-2 text-xs text-muted-foreground/80">{t('footer.testBuild')}</p>
      </section>
    </div>
  );
}
