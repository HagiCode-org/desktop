import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionConfig, motion } from 'motion/react';
import { useNavigate } from '../hooks/useNavigate';
import { useHomeEntitlementTier } from '../hooks/useHomeEntitlementTier';
import { shortBuildCommit, useDesktopBuildInfo } from '../hooks/useDesktopBuildInfo';
import { planHomeRail, type HomeRailSlot } from '../lib/home-rail-plan';
import { selectHomePromoteItems } from '../store/slices/homePromoteSlice';
import { Package, FolderOpen, Globe, Monitor, LoaderCircle, BellRing, ArrowRight, type LucideIcon } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { toast } from 'sonner';
import WebServiceStatusCard from './WebServiceStatusCard';
import HomeStoreOfferPanel from './HomeStoreOfferPanel';
import HomeStoreRatingPrompt from './HomeStoreRatingPrompt';
import HomeStoreDonationItem from './HomeStoreDonationItem';
import HomePromotePanel from './HomePromotePanel';
import { PageShell } from './ui/page-shell';
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
import { ServiceRegionPrompt } from './settings/ServiceRegionPrompt';

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
      versionGetInstalled: () => Promise<InstalledVersion[]>;
      versionGetActive: () => Promise<InstalledVersion | null>;
      onInstalledVersionsChanged: (callback: (versions: InstalledVersion[]) => void) => (() => void) | void;
      onActiveVersionChanged: (callback: (version: InstalledVersion | null) => void) => (() => void) | void;
      logDirectory: LogDirectoryBridge;
    };
  }
}

/**
 * Home arrival: the service card lands first and furthest, everything else follows it down the
 * page in reading order. Opacity + a short rise only, exponential ease-out, so it settles fast.
 */
const homeArrival = (order: number, distance = 10) => ({
  initial: { opacity: 0, y: distance },
  animate: { opacity: 1, y: 0 },
  transition: { duration: order === 0 ? 0.55 : 0.4, delay: order * 0.07, ease: [0.16, 1, 0.3, 1] as const },
});

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
  const [installedVersions, setInstalledVersions] = useState<InstalledVersion[]>([]);
  const [logTargets, setLogTargets] = useState<LogTargetStateMap>(createDefaultLogTargetMap);
  const [isLogTargetsLoading, setIsLogTargetsLoading] = useState(true);
  const [openingTarget, setOpeningTarget] = useState<LogDirectoryTarget | null>(null);
  const [dependencyReadiness, setDependencyReadiness] = useState<DependencyReadinessSummary | null>(null);
  const [dependencyReadinessError, setDependencyReadinessError] = useState<string | null>(null);
  const [homepageTourStartupResolved, setHomepageTourStartupResolved] = useState(false);
  const [homepageTourActive, setHomepageTourActive] = useState(false);
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
        const [version, installed, targets] = await Promise.all([
          window.electronAPI.versionGetActive(),
          window.electronAPI.versionGetInstalled(),
          window.electronAPI.logDirectory.listTargets(),
        ]);

        if (isDisposed) {
          return;
        }

        setActiveVersion(version);
        setInstalledVersions(installed);
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

    const unsubscribeInstalled = window.electronAPI.onInstalledVersionsChanged((versions) => {
      setInstalledVersions(versions);
    });

    const unsubscribeVersion = window.electronAPI.onActiveVersionChanged((version) => {
      setActiveVersion(version);
      void loadLogTargets(false);
    });

    return () => {
      isDisposed = true;
      if (typeof unsubscribeInstalled === 'function') {
        unsubscribeInstalled();
      }
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
      setHomepageTourStartupResolved(true);
      return;
    }

    if (homepageTourSessionRef.current?.isActive()) {
      setHomepageTourActive(true);
      setHomepageTourStartupResolved(true);
      return;
    }

    setHomepageTourStartupResolved(false);
    clearPendingHomepageTourStartup();

    homepageTourFrameRef.current = window.requestAnimationFrame(() => {
      homepageTourFrameRef.current = null;
      homepageTourTimeoutRef.current = window.setTimeout(() => {
        homepageTourTimeoutRef.current = null;

        const steps = buildHomepageTourSteps({ t });
        if (!shouldAutoStartHomepageTour({ currentView, onboardingActive, steps })) {
          setHomepageTourStartupResolved(true);
          return;
        }

        homepageTourSessionRef.current = startHomepageTour({
          t,
          steps,
          onDestroyed: () => {
            homepageTourSessionRef.current = null;
            setHomepageTourActive(false);
          },
        });
        setHomepageTourActive(true);
        setHomepageTourStartupResolved(true);
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
        toast.success(t('pages:versionManagement.toast.onboardingStarted'));
      } else {
        toast.error(t('pages:versionManagement.toast.onboardingFailed') + `: ${result.reason || t('common:common.unknownError')}`);
      }
    } catch (error) {
      console.error('Failed to start onboarding:', error);
      toast.error(t('pages:versionManagement.toast.onboardingFailed'));
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
  const hasInstalledVersions = installedVersions.length > 0;
  const activeVersionStatus = activeVersion
    ? ({
        'installed-ready': { label: t('system.activeVersion.states.ready'), healthy: true },
        'payload-invalid': { label: t('versionManagement.status.payloadInvalid', { ns: 'pages' }), healthy: false },
        'runtime-incompatible': { label: t('versionManagement.status.runtimeIncompatible', { ns: 'pages' }), healthy: false },
        'desktop-incompatible': { label: t('versionManagement.status.desktopIncompatible', { ns: 'pages' }), healthy: false },
      } as const)[activeVersion.status] ?? { label: t('system.activeVersion.states.ready'), healthy: true }
    : null;

  const entitlementTier = useHomeEntitlementTier();
  const buildInfo = useDesktopBuildInfo();
  const hasHighlights = useSelector((state: RootState) => selectHomePromoteItems(state).length > 0);
  const railPlan = planHomeRail(entitlementTier, { hasHighlights });
  const railSlots: Record<HomeRailSlot, ReactNode> = {
    highlights: <HomePromotePanel />,
    offer: <HomeStoreOfferPanel isWindowsStoreRuntime={distributionState.winStoreMode} compact={railPlan.offerCompact} />,
    donation: <HomeStoreDonationItem isWindowsStoreRuntime={distributionState.winStoreMode} />,
    rating: <HomeStoreRatingPrompt />,
  };

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
      downloading: t('versionManagement.downloadStage.downloading', { ns: 'pages' }),
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
    return Math.max(0, Math.min(100, installProgress?.percentage ?? 0));
  })();

  const installStateLabel = isHomepageInstallBusy
    ? getHomepageInstallStageLabel()
    : versionUpdateReminder
      ? t(`system.updateReminder.states.${versionUpdateReminder.status}`)
      : '';

  return (
    <MotionConfig reducedMotion="user">
    <PageShell>
      {shouldShowVersionUpdateReminder ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          {...{ [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'update-reminder' }}
        >
          <section className="rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
                <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">{t('system.updateReminder.title')}</h2>
                  <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">
                    {isHomepageInstallBusy ? getHomepageInstallSummary() : t(`system.updateReminder.descriptions.${versionUpdateReminder.disabledReason ?? versionUpdateReminder.status}`, {
                      error: versionUpdateReminder.failure?.message ?? '',
                    })}
                  </p>
                </div>
              </div>

              <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">{t('system.updateReminder.labels.current')}</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-foreground">
                    {versionUpdateReminder.currentVersion?.version ?? t('status.loading')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('system.updateReminder.labels.latest')}</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-foreground">
                    {versionUpdateReminder.latestVersion?.version ?? t('status.loading')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('system.updateReminder.labels.state')}</dt>
                  <dd className="mt-0.5 font-medium text-foreground">{installStateLabel}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-2">
                {versionUpdateReminder.status === 'ready' ? (
                  <Button type="button" size="sm" onClick={() => void handleInstallLatest()} disabled={isHomepageInstallBusy}>
                    <span>{isHomepageInstallBusy ? getHomepageInstallStageLabel() : t('system.updateReminder.actions.installLatest')}</span>
                    {isHomepageInstallBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant={versionUpdateReminder.status === 'ready' ? 'outline' : 'default'} onClick={handleOpenVersionManagement}>
                  <span>{t('system.updateReminder.actions.openVersionPage')}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
                {versionUpdateReminder.status === 'disabled' ? (
                  <Button type="button" size="sm" variant="outline" onClick={handleOpenUpdateSettings}>
                    {t('system.updateReminder.actions.openSettings')}
                  </Button>
                ) : null}
              </div>
            </div>

            {isHomepageInstallBusy ? (
              <div className="mt-3 border-t border-primary/15 pt-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-foreground">{getHomepageInstallStageLabel()}</span>
                  <span className="font-medium tabular-nums text-foreground">{homepageInstallProgressValue}%</span>
                </div>
                <Progress value={homepageInstallProgressValue} className="mt-2 h-2" />
              </div>
            ) : null}
          </section>
        </motion.div>
      ) : null}

      <ServiceRegionPrompt
        disabled={distributionState.steamMode || onboardingActive || !homepageTourStartupResolved || homepageTourActive}
      />

      {/*
        Priority tiers (see lib/home-rail-plan). Daily operations (service, version, logs) own
        the main column. A side rail beside it holds only the heavy commerce cards, so the two
        columns stay close in height; Highlights and the quieter asks sit in a full-width band
        below. Free users get the purchase panel in the rail, paid users get the full width and
        a one-line license row. In a narrow window the order is the same: operations, rail, band.
        The rail drops out entirely when it has nothing to show.
      */}
      <div className="grid gap-y-4 @4xl:grid-cols-[minmax(0,1fr)_auto]" data-home-entitlement={entitlementTier}>
        <div className="min-w-0 space-y-4">
          <motion.div {...homeArrival(0, 16)} {...{ [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'service-card' }}>
            <WebServiceStatusCard />
          </motion.div>

          <motion.div className="space-y-4" {...homeArrival(1)}>

          {activeVersion ? (
            <section
              className="@container rounded-2xl border border-border/80 bg-card p-6"
              {...{
                [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'version-section',
                [HOMEPAGE_TOUR_VARIANT_ATTRIBUTE]: HOMEPAGE_TOUR_VARIANTS.activeVersion,
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Package className="h-5 w-5 text-primary" />
                    {t('common.version')}
                  </h2>
                  <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm tabular-nums text-foreground">
                    {activeVersion.version}
                  </span>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={handleOpenVersionManagement} className="text-primary">
                  {t('system.activeVersion.actions.manage')}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              <dl className="mt-4 grid gap-x-8 gap-y-3 border-t border-border/60 pt-4 @md:grid-cols-2">
                {[
                  { label: t('system.activeVersion.labels.package'), value: activeVersion.packageFilename, mono: true },
                  { label: t('common.platform'), value: activeVersion.platform },
                  {
                    label: t('system.activeVersion.labels.installedAt'),
                    value: activeVersionInstalledAt ?? '-',
                  },
                  {
                    label: t('system.activeVersion.labels.status'),
                    value: activeVersionStatus?.label,
                    unhealthy: activeVersionStatus ? !activeVersionStatus.healthy : false,
                  },
                ].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd
                      className={cn(
                        'mt-0.5 break-all text-sm font-medium',
                        item.mono && 'font-mono text-[0.8125rem]',
                        item.unhealthy ? 'text-destructive' : 'text-foreground',
                      )}
                    >
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : hasInstalledVersions ? (
            <section
              className="rounded-2xl border border-border/80 bg-card p-6"
              {...{
                [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'version-section',
              }}
            >
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Package className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 basis-56">
                  <h2 className="text-base font-semibold text-foreground">{t('system.noActiveVersion.title')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t('system.noActiveVersion.description')}</p>
                </div>
                <Button type="button" onClick={handleOpenVersionManagement}>
                  {t('system.noActiveVersion.manageVersions')}
                </Button>
              </div>
            </section>
          ) : (
            <section
              className="rounded-2xl border border-border/80 bg-card p-6"
              {...{
                [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'version-section',
                [HOMEPAGE_TOUR_VARIANT_ATTRIBUTE]: HOMEPAGE_TOUR_VARIANTS.noVersionInstalled,
              }}
            >
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Package className="h-5 w-5" />
                </div>
                <h2 className="min-w-0 flex-1 basis-56 text-base font-semibold text-foreground">{t('system.noVersionInstalled.title')}</h2>
                <Button type="button" onClick={() => void handleStartWizard()}>
                  {t('system.noVersionInstalled.startWizard')}
                </Button>
              </div>
            </section>
          )}

          </motion.div>

          <motion.section
            className="rounded-2xl border border-border/80 bg-card p-6"
            {...homeArrival(2)}
            {...{ [HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE]: 'log-access' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <FolderOpen className="h-5 w-5 text-primary" />
                {t('system.logQuickAccess.title')}
              </h2>
              <span className="text-xs text-muted-foreground">
                {isLogTargetsLoading ? t('system.logQuickAccess.loading') : t('system.logQuickAccess.hint')}
              </span>
            </div>

            <ul className="mt-4 divide-y divide-border/60">
              {logQuickAccessItems.map(({ target, icon: Icon, label, status }) => {
                const isOpening = openingTarget === target;
                const isDisabled = isLogTargetsLoading || isOpening || !status.available;
                const titleId = `log-quick-access-${target}-title`;
                const buttonId = `log-quick-access-${target}-button`;

                return (
                  <li key={target} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1 basis-56">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <h3 id={titleId} className="text-sm font-medium text-foreground">{label}</h3>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 text-xs',
                            status.available ? 'text-primary' : 'text-muted-foreground',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              status.available ? 'bg-primary' : 'bg-muted-foreground/50',
                            )}
                          />
                          {status.available
                            ? t('system.logQuickAccess.status.available')
                            : t('system.logQuickAccess.status.unavailable')}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {getLogTargetDescription(target, status)}
                      </p>
                    </div>
                    <Button
                      id={buttonId}
                      aria-labelledby={`${buttonId} ${titleId}`}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleOpenLogDirectory(target)}
                      disabled={isDisabled}
                      className="gap-2"
                    >
                      {isOpening ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <FolderOpen className="h-4 w-4" />
                      )}
                      {t('button.open')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </motion.section>
        </div>

        <motion.div
          {...homeArrival(2, 14)}
          className="min-w-0 space-y-4 empty:hidden @4xl:ml-6 @4xl:w-[22rem]"
          data-home-region="rail"
        >
          {railPlan.side.map((slot) => (
            <Fragment key={slot}>{railSlots[slot]}</Fragment>
          ))}
        </motion.div>
      </div>

      <motion.div
        {...homeArrival(3)}
        className="space-y-4 border-t border-border/60 pt-6 empty:hidden"
        data-home-region="band"
      >
        {railPlan.band.map((slot) => (
          <Fragment key={slot}>{railSlots[slot]}</Fragment>
        ))}
      </motion.div>

      <footer className="px-1 py-2 text-center">
        <p className="text-sm text-muted-foreground">{t('footer.copyright')}</p>
        {buildInfo.status === 'ready' ? (
          <p className="break-words text-sm text-muted-foreground">
            <span>{t('footer.buildVersion')} {buildInfo.desktopVersion}</span>
            <span aria-hidden="true"> · </span>
            <span>{t('footer.buildBranch')} {buildInfo.buildBranch}</span>
            <span aria-hidden="true"> · </span>
            <span>{t('footer.buildCommit')} {shortBuildCommit(buildInfo.buildCommit)}</span>
          </p>
        ) : null}
      </footer>
    </PageShell>
    </MotionConfig>
  );
}
