import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { useNavigate } from '../hooks/useNavigate';
import { Package, FolderOpen, Globe, Monitor, LoaderCircle, BellRing, ArrowRight } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { toast } from 'sonner';
import WebServiceStatusCard from './WebServiceStatusCard';
import BlogFeedCard from './BlogFeedCard';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
import { selectVisibleVersionUpdateReminder } from '../store/slices/versionUpdateSlice';
import {
  InstallState,
  selectInstallProgress,
  selectInstallingVersionId,
  selectInstallState,
} from '../store/slices/webServiceSlice';
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
import { createDefaultDistributionModeState, type DistributionModeState } from '../../types/distribution-mode';
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

type LogTargetStateMap = Record<LogDirectoryTarget, LogDirectoryTargetStatus>;

interface SystemManagementViewProps {
  distributionState?: DistributionModeState;
}

const createDefaultLogTarget = (target: LogDirectoryTarget): LogDirectoryTargetStatus => ({
  target,
  available: false,
  exists: false,
  path: null,
  reason: 'logs_not_found',
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
  distributionState = createDefaultDistributionModeState(),
}: SystemManagementViewProps) {
  const { t, i18n } = useTranslation(['common', 'components']);
  const { navigateTo } = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const versionUpdateReminder = useSelector((state: RootState) => selectVisibleVersionUpdateReminder(state));
  const installProgress = useSelector((state: RootState) => selectInstallProgress(state));
  const installState = useSelector((state: RootState) => selectInstallState(state));
  const installingVersionId = useSelector((state: RootState) => selectInstallingVersionId(state));
  const currentView = useSelector((state: RootState) => state.view.currentView);
  const onboardingActive = useSelector((state: RootState) => state.onboarding.isActive);
  const shouldShowVersionUpdateReminder = !distributionState.fusionMode && Boolean(versionUpdateReminder);

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

  const isLatestVersionInstalling = Boolean(
    versionUpdateReminder?.latestVersion?.id && installingVersionId === versionUpdateReminder.latestVersion.id,
  );
  const isHomepageInstallBusy =
    installState === InstallState.Confirming ||
    installState === InstallState.StoppingService ||
    isLatestVersionInstalling;

  const getHomepageInstallStageLabel = () => {
    if (installState === InstallState.Confirming) {
      return t('system.updateReminder.progress.confirming');
    }
    if (installState === InstallState.StoppingService) {
      return t('system.updateReminder.progress.stoppingService');
    }
    if (!installProgress) {
      return t('system.updateReminder.states.ready');
    }

    const translatedMessage = installProgress.message
      ? t(`versionManagement.progressMessage.${installProgress.message}`, {
          ns: 'pages',
          defaultValue: '',
        })
      : '';

    if (translatedMessage) {
      return translatedMessage;
    }

    const stageLabels: Record<string, string> = {
      queued: t('versionManagement.downloadStage.queued', { ns: 'pages' }),
      'fetching-torrent': t('versionManagement.downloadStage.fetchingTorrent', { ns: 'pages' }),
      downloading: t('versionManagement.downloadStage.sharedDownloading', { ns: 'pages' }),
      backfilling: t('versionManagement.downloadStage.backfilling', { ns: 'pages' }),
      verifying: t('versionManagement.verifying', { ns: 'pages' }),
      extracting: t('versionManagement.extracting', { ns: 'pages' }),
      switching: t('versionManagement.switching', { ns: 'pages' }),
      completed: t('versionManagement.completed', { ns: 'pages' }),
      error: t('versionManagement.toast.installFailed', { ns: 'pages' }),
    };

    return stageLabels[installProgress.stage] ?? t('system.updateReminder.states.downloading');
  };

  const getHomepageInstallSummary = () => {
    if (!versionUpdateReminder?.latestVersion) {
      return null;
    }

    if (installState === InstallState.Confirming) {
      return t('system.updateReminder.progress.confirmingDescription', {
        version: versionUpdateReminder.latestVersion.version,
      });
    }

    if (installState === InstallState.StoppingService) {
      return t('system.updateReminder.progress.stoppingServiceDescription');
    }

    if (!installProgress) {
      return t('system.updateReminder.descriptions.ready');
    }

    if (installProgress.stage === 'completed') {
      return t('system.updateReminder.progress.completedDescription', {
        version: versionUpdateReminder.latestVersion.version,
      });
    }

    if (installProgress.stage === 'switching') {
      return t('system.updateReminder.progress.switchingDescription', {
        version: versionUpdateReminder.latestVersion.version,
      });
    }

    return t('system.updateReminder.progress.activeDescription', {
      version: versionUpdateReminder.latestVersion.version,
      stage: getHomepageInstallStageLabel(),
    });
  };

  const homepageInstallProgressValue = (() => {
    if (installState === InstallState.Confirming) {
      return 8;
    }
    if (installState === InstallState.StoppingService) {
      return 16;
    }
    return Math.max(0, Math.min(100, installProgress?.progress ?? 0));
  })();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
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
                        {isHomepageInstallBusy ? getHomepageInstallStageLabel() : t(`system.updateReminder.states.${versionUpdateReminder.status}`)}
                      </span>
                    </div>
                    <p className="mt-2 max-w-[62ch] text-sm text-muted-foreground">
                      {isHomepageInstallBusy ? getHomepageInstallSummary() : t(`system.updateReminder.descriptions.${versionUpdateReminder.disabledReason ?? versionUpdateReminder.status}`, {
                        error: versionUpdateReminder.failure?.message ?? '',
                      })}
                    </p>
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
                    <div className="mt-1 font-medium text-foreground">{isHomepageInstallBusy ? getHomepageInstallStageLabel() : t(`system.updateReminder.states.${versionUpdateReminder.status}`)}</div>
                  </div>
                </div>

                {isHomepageInstallBusy ? (
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-medium text-foreground">{getHomepageInstallStageLabel()}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{getHomepageInstallSummary()}</div>
                      </div>
                      <div className="text-sm font-medium text-foreground">
                        {homepageInstallProgressValue}%
                      </div>
                    </div>
                    <Progress value={homepageInstallProgressValue} className="mt-3 h-2.5" />
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                {versionUpdateReminder.status === 'ready' ? (
                  <Button type="button" onClick={() => void handleInstallLatest()} className="justify-between" disabled={isHomepageInstallBusy}>
                    <span>{isHomepageInstallBusy ? getHomepageInstallStageLabel() : t('system.updateReminder.actions.installLatest')}</span>
                    {isHomepageInstallBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
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
              <div className="mt-5">
                <Button type="button" onClick={() => void handleStartWizard()}>
                  {t('system.noVersionInstalled.startWizard')}
                </Button>
              </div>
            </section>
          )}

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
