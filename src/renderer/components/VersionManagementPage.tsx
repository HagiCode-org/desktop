import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useDispatch, useSelector } from 'react-redux';
import {
  Package,
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  HardDrive,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import {
  selectWebServiceOperating,
  selectIsInstallingFromState,
  selectInstallProgress,
  selectInstallingVersionId,
} from '../store/slices/webServiceSlice';
import {
  installWebServicePackage,
} from '../store/thunks/webServiceThunks';
import type { RootState } from '../store';
import type { DistributionModeState } from '../../types/distribution-mode';
import { resolveDesktopLanguageCode } from '../../shared/desktop-languages';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { VersionManagementTabContent } from '../features/version-management/VersionManagementTabContent';
import { useVersionManagementTab } from '../features/version-management/useVersionManagementTab';
import type { InstalledVersion, Version } from '../features/version-management/types';
import { PageHeader } from './ui/page-header';


interface VersionSwitchResult {
  success: boolean;
  error?: string;
  errorCode?: 'not-installed' | 'desktop-incompatible' | 'portable-version-mode' | 'unknown';
  desktopCompatibility?: {
    declared: boolean;
    compatible: boolean;
    requiredVersion?: string;
    currentVersion: string;
    message?: string;
    reason?: string;
  };
}

declare global {
  interface Window {
    electronAPI: {
      versionList: () => Promise<Version[]>;
      versionGetInstalled: () => Promise<InstalledVersion[]>;
      versionGetActive: () => Promise<InstalledVersion | null>;
      versionInstall: (versionId: string) => Promise<{ success: boolean; error?: string }>;
      versionUninstall: (versionId: string) => Promise<boolean>;
      versionSwitch: (versionId: string) => Promise<VersionSwitchResult>;
      versionReinstall: (versionId: string) => Promise<boolean>;
      versionOpenLogs: (versionId: string) => Promise<{ success: boolean; error?: string }>;
      onInstalledVersionsChanged: (callback: (versions: InstalledVersion[]) => void) => () => void;
      onActiveVersionChanged: (callback: (version: InstalledVersion | null) => void) => () => void;
      onVersionListChanged: (callback: () => void) => () => void;
      resetOnboarding: () => Promise<{ success: boolean; error?: string }>;
      checkTriggerCondition: () => Promise<{ shouldShow: boolean; reason?: string }>;
    };
  }
}

interface VersionManagementPageProps {
  distributionState: DistributionModeState;
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-background/75 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold text-foreground">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
    </section>
  );
}

export default function VersionManagementPage({ distributionState }: VersionManagementPageProps) {
  const { t, i18n } = useTranslation(['pages', 'common']);
  const { activeTab, setActiveTab, tabs } = useVersionManagementTab();
  const dispatch = useDispatch();
  const webServiceOperating = useSelector((state: RootState) => selectWebServiceOperating(state));
  const isInstallingFromState = useSelector((state: RootState) => selectIsInstallingFromState(state));
  const webServiceInstallProgress = useSelector((state: RootState) => selectInstallProgress(state));
  const installingVersionId = useSelector((state: RootState) => selectInstallingVersionId(state));
  const [availableVersions, setAvailableVersions] = useState<Version[]>([]);
  const [installedVersions, setInstalledVersions] = useState<InstalledVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<InstalledVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);

  // Dialog states
  const [reinstallDialogOpen, setReinstallDialogOpen] = useState(false);
  const [uninstallDialogOpen, setUninstallDialogOpen] = useState(false);
  const [pendingVersionId, setPendingVersionId] = useState<string | null>(null);


  useEffect(() => {
    fetchAllData();

    const unsubscribeInstalled = window.electronAPI.onInstalledVersionsChanged((versions) => {
      setInstalledVersions(versions);
    });

    const unsubscribeActive = window.electronAPI.onActiveVersionChanged((version) => {
      setActiveVersion(version);
    });

    const unsubscribeVersionListChanged = window.electronAPI.onVersionListChanged(() => {
      // Refresh available versions when package source changes
      fetchAllData();
    });

    return () => {
      if (typeof unsubscribeInstalled === 'function') {
        unsubscribeInstalled();
      }
      if (typeof unsubscribeActive === 'function') {
        unsubscribeActive();
      }
      if (typeof unsubscribeVersionListChanged === 'function') {
        unsubscribeVersionListChanged();
      }
    };
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [available, installed, active] = await Promise.all([
        window.electronAPI.versionList(),
        window.electronAPI.versionGetInstalled(),
        window.electronAPI.versionGetActive(),
      ]);

      setAvailableVersions(available);
      setInstalledVersions(installed);
      setActiveVersion(active);
    } catch (error) {
      console.error('Failed to fetch version data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUninstall = async (versionId: string) => {
    if (uninstalling) return;

    // Open confirmation dialog instead of using native confirm
    setPendingVersionId(versionId);
    setUninstallDialogOpen(true);
  };

  const confirmUninstall = async () => {
    if (!pendingVersionId || uninstalling) {
      setUninstallDialogOpen(false);
      setPendingVersionId(null);
      return;
    }

    try {
      setUninstalling(pendingVersionId);
      setUninstallDialogOpen(false);
      const success = await window.electronAPI.versionUninstall(pendingVersionId);

      if (success) {
        toast.success(t('versionManagement.toast.uninstallSuccess'));
        await fetchAllData();
      } else {
        toast.error(t('versionManagement.toast.uninstallFailed'));
      }
    } catch (error) {
      console.error('Error uninstalling version:', error);
      toast.error(t('versionManagement.toast.uninstallFailed'));
    } finally {
      setUninstalling(null);
      setPendingVersionId(null);
    }
  };

  const handleSwitch = async (versionId: string) => {
    if (switching) return;

    try {
      setSwitching(versionId);
      const result = await window.electronAPI.versionSwitch(versionId);

      if (result.success) {
        await fetchAllData();
      } else if (result.errorCode === 'desktop-incompatible') {
        toast.error(result.error || t('versionManagement.toast.switchBlocked'));
      } else if (result.error) {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error switching version:', error);
      toast.error(t('versionManagement.toast.switchFailed'));
    } finally {
      setSwitching(null);
    }
  };

  const handleReinstall = async (versionId: string) => {
    if (isInstallingFromState || webServiceOperating) return;

    // Use Redux thunk which will check service status and show confirmation dialog if needed
    dispatch(installWebServicePackage(versionId));
  };

  const confirmReinstall = async () => {
    if (!pendingVersionId || isInstallingFromState) {
      setReinstallDialogOpen(false);
      setPendingVersionId(null);
      return;
    }

    // Use Redux thunk which will check service status and show confirmation dialog
    dispatch(installWebServicePackage(pendingVersionId));
    setReinstallDialogOpen(false);
    setPendingVersionId(null);
  };

  const handleOpenLogs = async (versionId: string) => {
    try {
      const result = await window.electronAPI.versionOpenLogs(versionId);

      if (result.success) {
        toast.success(t('versionManagement.toast.openLogsSuccess'));
      } else {
        if (result.error === 'logs_not_found') {
          toast.error(t('versionManagement.toast.logsNotFound'));
        } else {
          toast.error(t('versionManagement.toast.openLogsError'));
        }
      }
    } catch (error) {
      console.error('Error opening logs folder:', error);
      toast.error(t('versionManagement.toast.openLogsError'));
    }
  };

  const handleStartOnboarding = async () => {
    try {
      // Reset onboarding state to allow it to show again
      await window.electronAPI.resetOnboarding();
      // Check trigger condition to activate onboarding
      const result = await window.electronAPI.checkTriggerCondition();
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

  const getInstallProgressText = () => {
    if (!webServiceInstallProgress) return t('versionManagement.installing');

    const stageTexts: Record<string, string> = {
      'queued': t('versionManagement.downloadStage.queued'),
      'fetching-torrent': t('versionManagement.downloadStage.fetchingTorrent'),
      'downloading': t('versionManagement.downloadStage.sharedDownloading'),
      'backfilling': t('versionManagement.downloadStage.backfilling'),
      'extracting': t('versionManagement.extracting'),
      'verifying': t('versionManagement.verifying'),
      'switching': t('versionManagement.switching'),
      'completed': t('versionManagement.completed'),
      'error': t('versionManagement.toast.installFailed'),
    };

    const messageKey = webServiceInstallProgress.message;
    if (messageKey) {
      const translated = t(`versionManagement.progressMessage.${messageKey}`, { defaultValue: '' });
      if (translated) {
        return translated;
      }
    }

    return stageTexts[webServiceInstallProgress.stage] || t('versionManagement.installing');
  };

  const getDownloadModeLabel = (mode?: string) => {
    if (mode === 'shared-acceleration') return t('versionManagement.downloadMode.shared');
    if (mode === 'source-fallback') return t('versionManagement.downloadMode.fallback');
    return t('versionManagement.downloadMode.direct');
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[exponent]}`;
  };

  const getInstallStageFlow = () => {
    if (!webServiceInstallProgress) {
      return t('versionManagement.installTelemetry.flow');
    }

    const stageTexts: Record<string, string> = {
      'fetching-torrent': t('versionManagement.downloadStage.fetchingTorrent'),
      'downloading': t('versionManagement.downloadStage.sharedDownloading'),
      'backfilling': t('versionManagement.downloadStage.backfilling'),
      'verifying': t('versionManagement.verifying'),
      'extracting': t('versionManagement.extracting'),
      'switching': t('versionManagement.switching'),
      'completed': t('versionManagement.completed'),
    };

    return t('versionManagement.installTelemetry.flowActive', {
      stage: stageTexts[webServiceInstallProgress.stage] ?? getInstallProgressText(),
    });
  };

  const renderInstallTelemetry = (versionId: string) => {
    if (!isInstallingFromState || !webServiceInstallProgress || installingVersionId !== versionId) {
      return null;
    }

    return (
      <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <div className="mb-2 text-foreground">{getInstallStageFlow()}</div>
        <div className="flex flex-wrap items-center gap-3">
          <span>{t('versionManagement.installTelemetry.mode')}: {getDownloadModeLabel(webServiceInstallProgress.mode)}</span>
          <span>{t('versionManagement.installTelemetry.stage')}: {getInstallProgressText()}</span>
          <span>{t('versionManagement.installTelemetry.peers')}: {webServiceInstallProgress.peers ?? 0}</span>
          <span>{t('versionManagement.installTelemetry.sharedBytes')}: {formatBytes(webServiceInstallProgress.p2pBytes)}</span>
          <span>{t('versionManagement.installTelemetry.fallbackBytes')}: {formatBytes(webServiceInstallProgress.fallbackBytes)}</span>
          {webServiceInstallProgress.verified && (
            <span className="text-primary">{t('versionManagement.installTelemetry.verified')}</span>
          )}
        </div>
      </div>
    );
  };

  const getDesktopCompatibility = (version: InstalledVersion) => version.validation?.desktopCompatibility;

  const isDesktopIncompatible = (version: InstalledVersion) =>
    version.status === 'desktop-incompatible' && !getDesktopCompatibility(version)?.compatible;

  const getVersionStatus = (version: InstalledVersion) => {
    if (version.status === 'desktop-incompatible') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 border border-amber-500/20 dark:text-amber-300">
          <AlertCircle className="w-3 h-3" />
          {t('versionManagement.status.desktopIncompatible')}
        </span>
      );
    }

    if (version.status === 'runtime-incompatible') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
          <AlertCircle className="w-3 h-3" />
          {t('versionManagement.status.runtimeIncompatible')}
        </span>
      );
    }

    if (version.status === 'payload-invalid') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
          <AlertCircle className="w-3 h-3" />
          {t('versionManagement.status.payloadInvalid')}
        </span>
      );
    }

    if (version.isActive) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
          <CheckCircle className="w-3 h-3" />
          {t('versionManagement.status.active')}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
        <CheckCircle className="w-3 h-3" />
        {t('versionManagement.status.installed')}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(resolveDesktopLanguageCode(i18n.resolvedLanguage ?? i18n.language), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const getPlatformLabel = (platform: string) => {
    // Simplified platform labels - only 3 types: linux, windows, osx
    const labels: Record<string, string> = {
      'linux': 'Linux',
      'windows': 'Windows',
      'osx': 'macOS',
    };

    // Direct match
    if (labels[platform]) {
      return labels[platform];
    }

    // Case-insensitive match
    const lowerPlatform = platform.toLowerCase();
    for (const [key, label] of Object.entries(labels)) {
      if (key.toLowerCase() === lowerPlatform) {
        return label;
      }
    }

    // Partial match for backwards compatibility with old platform names
    if (lowerPlatform.includes('linux') || lowerPlatform.includes('ubuntu') || lowerPlatform.includes('debian')) {
      return 'Linux';
    }
    if (lowerPlatform.includes('darwin') || lowerPlatform.includes('mac') || lowerPlatform.includes('osx')) {
      return 'macOS';
    }
    if (lowerPlatform.includes('win') || lowerPlatform.includes('msys') || lowerPlatform.includes('cygwin')) {
      return 'Windows';
    }

    // Return original if no match
    return platform;
  };

  if (loading) {
    return (
      <div className="mx-auto flex max-w-6xl items-center justify-center px-4 py-10">
        <div className="rounded-3xl border border-border/80 bg-card px-8 py-10 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>{t('status.loading', { ns: 'common', defaultValue: 'Loading...' })}</span>
          </div>
        </div>
      </div>
    );
  }

  if (distributionState.fusionMode) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-3xl border border-border/80 bg-card p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-primary">
              <Package className="w-6 h-6" />
            </div>
            <div className="space-y-3">
              <h1 className="text-2xl font-semibold text-foreground">
                {t('versionManagement.portableMode.title')}
              </h1>
              <p className="text-muted-foreground">
                {t('versionManagement.portableMode.description')}
              </p>
              {activeVersion && (
                <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span>{t('versionManagement.portableMode.activeRuntime', { version: activeVersion.packageFilename })}</span>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {t('versionManagement.portableMode.updates')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <PageHeader
          icon={Package}
          titleKey="versionManagement.title"
          descriptionKey="versionManagement.description"
          actions={<Button type="button" variant="outline" onClick={fetchAllData}><RefreshCw className="h-4 w-4" />{t('versionManagement.actions.refresh')}</Button>}
          summaryTiles={(
            <>
              <SummaryTile
              icon={Package}
              label={t('common.version', { ns: 'common' })}
              value={activeVersion?.version ?? t('versionManagement.notInstalled')}
              description={activeVersion ? activeVersion.packageFilename : t('versionManagement.noVersionsInstalled.description')}
              />
              <SummaryTile
              icon={HardDrive}
              label={t('versionManagement.installedVersions')}
              value={installedVersions.length.toString()}
              description={installedVersions.length > 0 ? t('versionManagement.status.installed') : t('versionManagement.notInstalled')}
              />
              <SummaryTile
              icon={Download}
              label={t('versionManagement.availableVersions')}
              value={availableVersions.length.toString()}
              description={availableVersions.length > 0 ? t('versionManagement.actions.install') : t('versionManagement.noVersionsAvailable')}
              />
              <SummaryTile
              icon={isInstallingFromState ? Loader2 : RefreshCw}
              label={t('versionManagement.actions.refresh')}
              value={isInstallingFromState ? getInstallProgressText() : t('versionManagement.status.ready')}
              description={isInstallingFromState ? getInstallStageFlow() : t('versionManagement.info.description')}
              />
            </>
          )}
        />

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-2xl border border-border/70 bg-muted/25 p-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-2 rounded-xl px-4 py-3">
                  <Icon className="h-4 w-4" />
                  <span>{t(tab.labelKey)}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          <VersionManagementTabContent
            activeTab={tabs.find((tab) => tab.id === activeTab) ?? tabs[0]}
            availableVersions={availableVersions}
            installedVersions={installedVersions}
            getPlatformLabel={getPlatformLabel}
            getInstallProgressText={getInstallProgressText}
            onRefresh={fetchAllData}
            renderInstallTelemetry={renderInstallTelemetry}
            onReinstall={handleReinstall}
            onOpenLogs={handleOpenLogs}
            onSwitch={handleSwitch}
            onUninstall={handleUninstall}
            onStartOnboarding={handleStartOnboarding}
            switching={switching}
            uninstalling={uninstalling}
            isInstalling={isInstallingFromState}
            installProgress={webServiceInstallProgress}
            getVersionStatus={getVersionStatus}
            formatDate={formatDate}
            isDesktopIncompatible={isDesktopIncompatible}
            getDesktopCompatibility={getDesktopCompatibility}
          />
        </Tabs>

      </div>

      {/* Reinstall Confirmation Dialog */}
      <Dialog open={reinstallDialogOpen} onOpenChange={setReinstallDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('versionManagement.dialog.reinstallTitle')}</DialogTitle>
            <DialogDescription>
              {t('versionManagement.dialog.reinstallDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReinstallDialogOpen(false);
                setPendingVersionId(null);
              }}
              disabled={isInstallingFromState}
            >
              {t('versionManagement.dialog.cancel')}
            </Button>
            <Button
              onClick={confirmReinstall}
              disabled={isInstallingFromState}
            >
              {isInstallingFromState ? t('versionManagement.reinstalling') : t('versionManagement.dialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Uninstall Confirmation Dialog */}
      <Dialog open={uninstallDialogOpen} onOpenChange={setUninstallDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('versionManagement.dialog.uninstallTitle')}</DialogTitle>
            <DialogDescription>
              {t('versionManagement.dialog.uninstallDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUninstallDialogOpen(false);
                setPendingVersionId(null);
              }}
              disabled={uninstalling !== null}
            >
              {t('versionManagement.dialog.cancel')}
            </Button>
            <Button
              onClick={confirmUninstall}
              disabled={uninstalling !== null}
              variant="destructive"
            >
              {uninstalling ? t('versionManagement.switching') : t('versionManagement.dialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
