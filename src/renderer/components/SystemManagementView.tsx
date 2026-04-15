import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '../hooks/useNavigate';
import { motion, AnimatePresence } from 'motion/react';
import { Package, CheckCircle, Activity, FolderOpen, Globe, Monitor, LoaderCircle, BellRing, ArrowRight, type LucideIcon } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { toast } from 'sonner';
import WebServiceStatusCard from './WebServiceStatusCard';
import BlogFeedCard from './BlogFeedCard';
import { Button } from '@/components/ui/button';
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
import type { DistributionMode } from '../../types/distribution-mode';
import hagicodeIcon from '../assets/hagicode-icon.png';

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
  const { t } = useTranslation('common');
  const { navigateTo } = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const webServiceInfo = useSelector((state: RootState) => selectWebServiceInfo(state));
  const versionUpdateReminder = useSelector((state: RootState) => selectVisibleVersionUpdateReminder(state));
  const currentView = useSelector((state: RootState) => state.view.currentView);
  const onboardingActive = useSelector((state: RootState) => state.onboarding.isActive);
  const shouldShowVersionUpdateReminder = distributionMode !== 'steam' && Boolean(versionUpdateReminder);

  const [activeVersion, setActiveVersion] = useState<InstalledVersion | null>(null);
  const [logTargets, setLogTargets] = useState<LogTargetStateMap>(createDefaultLogTargetMap);
  const [isLogTargetsLoading, setIsLogTargetsLoading] = useState(true);
  const [openingTarget, setOpeningTarget] = useState<LogDirectoryTarget | null>(null);
  const homepageTourSessionRef = useRef<HomepageTourSession | null>(null);
  const homepageTourFrameRef = useRef<number | null>(null);
  const homepageTourTimeoutRef = useRef<number | null>(null);

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

  const getStatusBgColor = (status: ServerStatus) => {
    switch (status) {
      case 'running':
        return 'bg-primary';
      case 'stopped':
        return 'bg-muted-foreground';
      case 'error':
        return 'bg-destructive';
    }
  };

  const getStatusGlowColor = (status: ServerStatus) => {
    switch (status) {
      case 'running':
        return 'shadow-primary/50';
      case 'stopped':
        return 'shadow-muted-foreground/30';
      case 'error':
        return 'shadow-destructive/50';
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

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="text-center mb-12"
        {...{ [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'hero' }}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          className="mb-4"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 bg-linear-to-br from-primary to-primary/70 rounded-2xl mb-4 shadow-lg shadow-primary/30 relative overflow-hidden">
            <motion.div
              animate={{
                background: [
                  'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)',
                  'radial-gradient(circle at 80% 50%, rgba(255,255,255,0.15) 0%, transparent 50%)',
                  'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)',
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0"
            />
            <img src={hagicodeIcon} alt="Hagicode" className="w-12 h-12 relative z-10" />
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={serverStatus}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-6"
          >
            <motion.div
              whileHover={{ scale: 1.02 }}
              className={`
                inline-flex items-center gap-3 px-6 py-3 rounded-full
                shadow-lg ${getStatusGlowColor(serverStatus)}
                border border-border/50
                backdrop-blur-sm
                cursor-pointer transition-all
                ${serverStatus === 'running' ? 'bg-primary/10' :
                  serverStatus === 'error' ? 'bg-destructive/10' :
                  'bg-muted/50'}
              `}
            >
              <motion.div
                animate={
                  serverStatus === 'running' ? {
                    scale: [1, 1.1, 1],
                    opacity: [1, 0.8, 1],
                  } : {}
                }
                transition={{ duration: 2, repeat: Infinity }}
                className={`
                  w-3 h-3 rounded-full ${getStatusBgColor(serverStatus)}
                  ${serverStatus === 'running' ? 'shadow-lg shadow-primary/50' : ''}
                `}
              />
              <Activity className={cn('w-4 h-4', getStatusColor(serverStatus))} />
              <span className={cn('font-semibold', getStatusColor(serverStatus))}>
                {getStatusText(serverStatus)}
              </span>
              {serverStatus === 'running' ? (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-xs text-primary/70 ml-1"
                >
                  • Hagicode 服务在线
                </motion.span>
              ) : null}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {shouldShowVersionUpdateReminder ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.45 }}
          className="mb-6 rounded-2xl border border-border bg-card p-6 shadow-sm"
          {...{ [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'update-reminder' }}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-3">
                  <BellRing className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">{t('system.updateReminder.title')}</h2>
                  <p className="text-sm text-muted-foreground">{getUpdateReminderDescription()}</p>
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
              <Button type="button" onClick={handleOpenVersionManagement} className="justify-between">
                <span>{t('system.updateReminder.actions.openVersionPage')}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
              {versionUpdateReminder.status === 'ready' ? (
                <Button type="button" variant="outline" onClick={() => void handleInstallLatest()}>
                  {t('system.updateReminder.actions.installLatest')}
                </Button>
              ) : null}
              {versionUpdateReminder.status === 'disabled' ? (
                <Button type="button" variant="outline" onClick={handleOpenUpdateSettings}>
                  {t('system.updateReminder.actions.openSettings')}
                </Button>
              ) : null}
            </div>
          </div>
        </motion.div>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        {...{ [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'service-card' }}
      >
        <WebServiceStatusCard />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
        className="mt-6"
      >
        <BlogFeedCard />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="mt-6 bg-card rounded-xl p-6 border border-border relative overflow-hidden group"
        {...{ [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'log-access' }}
      >
        <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="relative z-10">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-5">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-primary" />
                {t('system.logQuickAccess.title')}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('system.logQuickAccess.description')}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
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
                  className="rounded-xl border border-border/70 bg-muted/30 p-4 flex flex-col gap-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg bg-background/80 p-2 border border-border/60">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">{label}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
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

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleOpenLogDirectory(target)}
                    disabled={isDisabled}
                    className="justify-between"
                  >
                    <span>{label}</span>
                    {isOpening ? (
                      <LoaderCircle className="w-4 h-4 animate-spin" />
                    ) : (
                      <FolderOpen className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {activeVersion ? (
          <motion.div
            key="version-card"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: 0.45, duration: 0.4 }}
            className="mt-6 bg-card rounded-xl p-6 border border-border relative overflow-hidden group"
            {...{
              [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'version-section',
              [HOMEPAGE_TOUR_VARIANT_ATTRIBUTE]: HOMEPAGE_TOUR_VARIANTS.activeVersion,
            }}
          >
            <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <motion.h2
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-xl font-semibold flex items-center gap-2"
                >
                  <motion.div whileHover={{ rotate: 360 }} transition={{ duration: 0.6 }}>
                    <Package className="w-6 h-6 text-primary" />
                  </motion.div>
                  {t('common.version')}
                </motion.h2>
                <motion.button
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  onClick={() => navigateTo('version')}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.95 }}
                  className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                >
                  管理版本
                  <motion.span
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1 }}
                  >
                    →
                  </motion.span>
                </motion.button>
              </div>

              <div className="space-y-3">
                {[
                  { label: '版本', value: activeVersion.packageFilename },
                  { label: t('common.platform'), value: activeVersion.platform },
                  {
                    label: '安装于',
                    value: new Date(activeVersion.installedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
                  },
                ].map((item, index) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.55 + index * 0.05 }}
                    whileHover={{ x: 4 }}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-default"
                  >
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="text-foreground font-medium">{item.value}</span>
                  </motion.div>
                ))}

                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 }}
                  whileHover={{ x: 4 }}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-default"
                >
                  <span className="text-muted-foreground">状态</span>
                  <div className="flex items-center gap-2">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                    >
                      <CheckCircle className="w-5 h-5 text-primary" />
                    </motion.div>
                    <span className="text-primary">✅ 就绪</span>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!activeVersion ? (
          <motion.div
            key="no-version"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: 0.45, duration: 0.4 }}
            className="mt-6 bg-card rounded-xl p-8 border border-border text-center relative overflow-hidden"
            {...{
              [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'version-section',
              [HOMEPAGE_TOUR_VARIANT_ATTRIBUTE]: HOMEPAGE_TOUR_VARIANTS.noVersionInstalled,
            }}
          >
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.1, 0.2, 0.1],
              }}
              transition={{ duration: 4, repeat: Infinity }}
              className="absolute inset-0 bg-linear-to-br from-primary/10 to-transparent"
            />

            <div className="relative z-10">
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center"
                >
                  <Package className="w-8 h-8 text-muted-foreground" />
                </motion.div>
              </motion.div>

              <motion.h3
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.55 }}
                className="text-lg font-semibold text-foreground mb-2"
              >
                {t('system.noVersionInstalled.title')}
              </motion.h3>

              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-muted-foreground mb-6"
              >
                {t('system.noVersionInstalled.description')}
              </motion.p>

              <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.65 }}
                whileHover={{ scale: 1.05, boxShadow: '0 10px 30px -10px rgba(0,0,0,0.3)' }}
                whileTap={{ scale: 0.95 }}
                onClick={handleStartWizard}
                className="px-6 py-2.5 bg-linear-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground rounded-lg transition-all shadow-lg shadow-primary/20"
              >
                {t('system.noVersionInstalled.startWizard')}
              </motion.button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="mt-12 text-center"
      >
        <motion.p
          className="text-muted-foreground text-sm"
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 400 }}
        >
          {t('footer.copyright')}
        </motion.p>
        <motion.p
          className="mt-2 text-xs text-muted-foreground/70"
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 400 }}
        >
          {t('footer.testBuild')}
        </motion.p>
      </motion.div>
    </div>
  );
}
